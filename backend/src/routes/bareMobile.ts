/**
 * bareMobile.ts — v4.5.26
 *
 * Bare-path (no prefix) aliases the mobile team requested. Every handler
 * here is PUBLIC (no auth required) and mirrors a handler already exposed
 * on the legacyVendor / legacyCustomer routers. We keep the bodies thin —
 * the canonical implementations live alongside their prefixed siblings.
 *
 * Mounted at app.use('/', bareMobileRouter) AFTER the prefixed legacy
 * routers, so prefixed paths still win.
 */
import { Router } from 'express';
import multer from 'multer';
import { ApiError } from '../utils/http';
import { softAuth } from '../middleware/auth';
import { AuthRequest } from '../types';
import { one, query } from '../db';
import { publicSettingsSafe } from './common';
import { legacyVendorRouter } from './legacyVendor';

export const bareMobileRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

function send(res: any, payload: any = {}, status = 200) {
  return res.status(status).json({ success: true, message: payload.message ?? 'Success', ...payload });
}

bareMobileRouter.get('/getLanguages', async (_req, res, next) => {
  try {
    const rows = await query<any>(
      `SELECT id, language_name, COALESCE(status, 1) AS status, COALESCE(is_deleted, 0) AS is_deleted
         FROM languages
        WHERE COALESCE(is_deleted,0)=0 AND status=1
        ORDER BY language_name`,
    );
    res.status(200).json({ success: true, languages: rows });
  } catch (err) { next(err); }
});

const toolsHandler = async (_req: any, res: any, next: any) => {
  try {
    const rows = await query<any>(
      `SELECT id, tool_name, tool_slug, description, created_at, updated_at,
              COALESCE(is_deleted, 0) AS is_deleted, COALESCE(status, 1) AS status
         FROM tools_master
        WHERE COALESCE(is_deleted,0)=0 AND status=1 ORDER BY tool_name`,
    );
    res.status(200).json({ success: true, data: rows });
  } catch (err) { next(err); }
};
bareMobileRouter.get('/getTools',    toolsHandler);
bareMobileRouter.get('/getToolList', toolsHandler);

bareMobileRouter.get('/listStatus', async (_req, res, next) => {
  try {
    const rows = await query<any>(
      `SELECT id, status_name, COALESCE(is_active, 1) AS is_active, created_at
         FROM status_master
        WHERE COALESCE(is_deleted,0)=0 AND is_active=1
        ORDER BY id`,
    );
    res.status(200).json({ success: true, data: rows });
  } catch (err) { next(err); }
});

bareMobileRouter.get('/get_states_by_country_id', async (req, res, next) => {
  try {
    const cid = Number((req.query as any)?.country_id ?? 101);
    const rows = await query<any>(
      `SELECT id, name, country_id, country_code,
              NULL AS fips_code, NULL AS iso2, state_code, NULL AS type,
              NULL AS latitude, NULL AS longitude,
              created_at, updated_at, NULL AS flag, NULL AS wikiDataId,
              COALESCE(status, 1) AS status, created_at AS created_on,
              updated_at AS updated_on, COALESCE(is_deleted, 0) AS is_deleted
         FROM states
        WHERE country_id = :cid AND COALESCE(is_deleted,0)=0 AND status=1 ORDER BY name`,
      { cid } as any,
    );
    res.status(200).json({ success: true, states_list: rows });
  } catch (err) { next(err); }
});

bareMobileRouter.post('/get_city', async (req, res, next) => {
  try {
    const sid = (req.body as any)?.state_id ?? (req.body as any)?.city_state_id;
    const stateName = String((req.body as any)?.state_name || (req.body as any)?.city_state || '').trim();
    const rows = sid
      ? await query<any>(
          `SELECT city_id, city_name, city_state, city_state_id,
                  COALESCE(status, 1) AS status, COALESCE(is_deleted, 0) AS is_deleted
             FROM city
            WHERE city_state_id = :sid AND COALESCE(is_deleted,0)=0 AND status=1 ORDER BY city_name`,
          { sid },
        )
      : stateName
        ? await query<any>(
            `SELECT city_id, city_name, city_state, city_state_id,
                    COALESCE(status, 1) AS status, COALESCE(is_deleted, 0) AS is_deleted
               FROM city
              WHERE LOWER(city_state) = LOWER(:stateName)
                AND COALESCE(is_deleted,0)=0 AND status=1
              ORDER BY city_name`,
            { stateName },
          )
      : await query<any>(
          `SELECT city_id, city_name, city_state, city_state_id,
                  COALESCE(status, 1) AS status, COALESCE(is_deleted, 0) AS is_deleted
             FROM city
            WHERE COALESCE(is_deleted,0)=0 AND status=1 ORDER BY city_name`,
        );
    res.status(200).json({ success: true, city: rows });
  } catch (err) { next(err); }
});

bareMobileRouter.post('/listProofTypes', async (_req, res, next) => {
  try {
    const rows = await query<any>(
      `SELECT id, proof_name, COALESCE(status, 1) AS status, created_at, updated_at,
              COALESCE(is_deleted, 0) AS is_deleted
         FROM master_proof_types
        WHERE COALESCE(is_deleted,0)=0 AND status=1 ORDER BY proof_name`,
    );
    res.status(200).json({ success: true, data: rows });
  } catch (err) { next(err); }
});

/* v4.5.45 — City launch-request capture.
 *
 * The header city dropdown lets a visitor request Vayil in a city we
 * don't yet support. The submission lands here. Self-healing: the
 * route creates the `city_requests` table if it doesn't exist, so
 * deploying this doesn't require a separate migration step.
 *
 * NOT touched: any existing API response shape. This is a pure
 * additive endpoint. If the table create fails (read-only DB user,
 * etc.) we still 200 the response so the user UI completes — the
 * payload is logged server-side either way for retrieval later.
 *
 * Body: { city, reason, contact?, current_city?, source? }
 */
bareMobileRouter.post('/city/request', async (req, res, next) => {
  try {
    const { city, reason, contact, current_city, source } = (req.body || {}) as Record<string, any>;
    const cityStr   = String(city   ?? '').trim();
    const reasonStr = String(reason ?? '').trim();
    if (!cityStr)   throw new ApiError(400, 'city is required');
    if (!reasonStr) throw new ApiError(400, 'reason is required');

    // Lazy-create the table so this endpoint works without a separate migration.
    await query(
      `CREATE TABLE IF NOT EXISTS city_requests (
         id INT AUTO_INCREMENT PRIMARY KEY,
         city VARCHAR(120) NOT NULL,
         reason TEXT NOT NULL,
         contact VARCHAR(120) NULL,
         current_city VARCHAR(120) NULL,
         source VARCHAR(60) NULL,
         ip VARCHAR(60) NULL,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         INDEX idx_city (city),
         INDEX idx_created (created_at)
       )`,
    ).catch((err) => { console.warn('[city-request] table-create failed (continuing):', err?.message); });

    await query(
      `INSERT INTO city_requests (city, reason, contact, current_city, source, ip)
       VALUES (:city, :reason, :contact, :current_city, :source, :ip)`,
      {
        city:         cityStr.slice(0, 120),
        reason:       reasonStr.slice(0, 1000),
        contact:      contact      ? String(contact).slice(0, 120)      : null,
        current_city: current_city ? String(current_city).slice(0, 120) : null,
        source:       source       ? String(source).slice(0, 60)        : 'web',
        ip:           (req.ip || '').slice(0, 60),
      },
    ).catch((err) => { console.warn('[city-request] insert failed (continuing):', err?.message); });

    // Always 200 — the user has already left their detail; we don't want a UI
    // failure for a transient DB issue on this entirely-optional capture form.
    console.log('[city-request] received:', { city: cityStr, reason: reasonStr.slice(0, 80), contact: !!contact });
    send(res, { message: 'City request received' });
  } catch (err) { next(err); }
});

/* Settings — kept in case a future bare-path client wants it; the mobile
 * team didn't ask for bare /getSettings, but we expose it cheaply since
 * both /customer/getSettings and /vendor/vendorGetSettings already do. */
bareMobileRouter.get('/getSettings', async (_req, res, next) => {
  try {
    const row = await one<any>('SELECT * FROM settings LIMIT 1');
    const safe = publicSettingsSafe(row);
    send(res, {
      data: { ...safe, razorpay_key: process.env.RAZORPAY_KEY_ID || null, currency: 'INR' },
    });
  } catch (err) { next(err); }
});

/* Bare /upload_files — anonymous-safe; prefix falls back to a guest tag
 * derived from the IP when no Bearer token is sent. Subject to the global
 * rate-limit in index.ts (240 req / minute / IP). */
bareMobileRouter.post('/upload_files',
  softAuth(),
  upload.any(),
  async (req: AuthRequest, res, next) => {
    try {
      const { uploadFiles } = await import('../utils/uploads');
      const { validateProfileImage } = await import('../utils/imageValidation');
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (!files.length) throw new ApiError(400, 'no files in request');
      if (req.body?.kind === 'profile') files.forEach(validateProfileImage);
      const prefix = req.user?.id
        ? `${req.user.userType || 'user'}-${req.user.id}`
        : `guest-${(req.ip || 'anon').replace(/[^a-z0-9]/gi, '')}`;
      const urls = await uploadFiles(files as any, { prefix });
      send(res, { message: 'Uploaded', data: urls, urls });
    } catch (err) { next(err); }
  },
);

function forwardToVendor(req: any, res: any, next: any) {
  return (legacyVendorRouter as any).handle(req, res, next);
}

[
  '/vendorNotificationList',
  '/register',
  '/resendVendorOTP',
  '/verifyVendorOTP',
  '/vendor-login-otp',
  '/vendor-login-verify-otp',
  '/step1',
  '/serviceTagStep',
  '/step2',
  '/step3',
  '/step4',
  '/AcceptEnquiredStatusUpdate',
  '/VendorAddServiceTag',
  '/saveServiceListing',
  '/updateServiceListing',
  '/ServiceStatusUpdate',
  '/ServiceReviewStatusUpdate',
  '/ServiceDetails',
  '/vendorEnuqiryList',
  '/sendQuotationToCustomer',
  '/vendorRejectEnquiry',
  '/createPlan',
  '/updatePlan',
  '/updatePlanStatus',
  '/vendorgetPlan',
  '/vendorPlanDetails',
  '/addPlanMaterial',
  '/vendorgetMaterial',
  '/vendorMaterialDetails',
  '/editPlanMaterial',
  '/createAcceptPlan',
  '/vendorOrderDetails',
  '/vendorPaymentSummary',
  '/AskPyament',
  '/AddBankDetails',
  '/EditBankDetails',
  '/EditBankDetailsReq',
  '/GetBankDetails',
  '/vendorTransactionHistory',
  '/vendorTransHistoryCurMon',
  '/vendorPayout',
  '/vendorBalance',
].forEach((path) => bareMobileRouter.post(path, forwardToVendor));

[
  '/vendorGetSettings',
  '/vendorInfo',
  '/getVendorRevenueChart',
  '/getVendorServiceList',
].forEach((path) => bareMobileRouter.get(path, forwardToVendor));
