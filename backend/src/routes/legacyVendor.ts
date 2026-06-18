/**
 * legacyVendor.ts — endpoints the existing Vayil vendor Flutter app
 * calls. Same shape as legacyCustomer: thin shim → services → legacy
 * response shape.
 *
 * Mounted at BOTH '/' and '/vendor' in index.ts because the mobile app
 * uses bare paths like /step1, /AskPyament without a /vendor prefix.
 */
import { Router } from 'express';
import multer from 'multer';
import { ApiError } from '../utils/http';
import { requireAuth } from '../middleware/auth';
import { AuthRequest } from '../types';
import { exec, one, query } from '../db';
import { publicSettingsSafe } from './common';

import * as authService from '../services/authService';
import * as vendorSvc from '../services/vendorService';
import * as enquirySvc from '../services/enquiryService';
import * as quoteSvc from '../services/quoteService';
import * as projectSvc from '../services/projectService';
import * as materialSvc from '../services/materialService';
import * as notifSvc from '../services/notificationService';
import * as reviewSvc from '../services/reviewService';
import * as bankSvc from '../services/bankService';
import * as payoutSvc from '../services/payoutService';

export const legacyVendorRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

function pickPhone(b: any): string {
  return String(b?.mobile_number || b?.mobile || b?.phone || '').trim();
}
function pickId(b: any, ...keys: string[]): string {
  for (const k of keys) if (b && b[k] !== undefined && b[k] !== null && b[k] !== '') return String(b[k]);
  return '';
}
function num(v: any, fb = 0): number {
  if (v === undefined || v === null || v === '') return fb;
  const n = Number(v); return Number.isFinite(n) ? n : fb;
}
function send(res: any, payload: any = {}, status = 200) {
  return res.status(status).json({ success: true, message: payload.message ?? 'Success', ...payload });
}

/* ─────────────────────────────────────────────────────────────
 *  AUTH (open)
 * ───────────────────────────────────────────────────────────── */
legacyVendorRouter.post('/register', async (req, res, next) => {
  try {
    const phone = pickPhone(req.body);
    const out = await authService.requestOtp(phone, 'vendor');
    send(res, { message: 'Registration OTP sent', data: out });
  } catch (err) { next(err); }
});

legacyVendorRouter.post('/verifyVendorOTP', async (req, res, next) => {
  try {
    const phone = pickPhone(req.body);
    const otp = String(req.body?.otp || req.body?.otpcode || '');
    const out = await authService.verifyOtpAndIssueToken({
      phone, otp, userType: 'vendor', name: req.body?.name || req.body?.company_name,
    });
    send(res, {
      message: 'OTP verified', data: out.user, token: out.token,
      vendor_id: out.user?.vendor_id,
    });
  } catch (err) { next(err); }
});

legacyVendorRouter.post('/vendor-login-otp', async (req, res, next) => {
  try {
    const phone = pickPhone(req.body);
    const out = await authService.requestOtp(phone, 'vendor');
    send(res, { message: 'Login OTP sent', data: out });
  } catch (err) { next(err); }
});

legacyVendorRouter.post('/vendor-login-verify-otp', async (req, res, next) => {
  try {
    const phone = pickPhone(req.body);
    const otp = String(req.body?.otp || '');
    const out = await authService.verifyOtpAndIssueToken({ phone, otp, userType: 'vendor' });
    send(res, {
      message: 'Login successful', data: out.user, token: out.token,
      vendor_id: out.user?.vendor_id,
    });
  } catch (err) { next(err); }
});

legacyVendorRouter.post('/resendVendorOTP', async (req, res, next) => {
  try {
    const phone = pickPhone(req.body);
    await authService.requestOtp(phone, 'vendor');
    send(res, { message: 'OTP resent' });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────────────────────
 *  v4.5.2 — open lookup endpoints the vendor mobile app calls
 *  pre-login. Must be mounted BEFORE the requireAuth middleware
 *  below or they'll 401.
 * ───────────────────────────────────────────────────────────── */
import { query as commonQuery } from '../db';

legacyVendorRouter.get('/getLanguages', async (_req, res, next) => {
  try {
    const rows = await commonQuery<any>(
      `SELECT id, language_name FROM languages WHERE COALESCE(is_deleted,0)=0 AND status=1 ORDER BY language_name`,
    );
    send(res, { data: rows });
  } catch (err) { next(err); }
});
legacyVendorRouter.get('/getTools', async (_req, res, next) => {
  try {
    const rows = await commonQuery<any>(
      `SELECT id, tool_name, tool_slug, description FROM tools_master
        WHERE COALESCE(is_deleted,0)=0 AND status=1 ORDER BY tool_name`,
    );
    send(res, { data: rows });
  } catch (err) { next(err); }
});
legacyVendorRouter.get('/listStatus', async (_req, res, next) => {
  try {
    const rows = await commonQuery<any>(
      `SELECT id, status_name FROM status_master WHERE COALESCE(is_deleted,0)=0 AND is_active=1 ORDER BY id`,
    );
    send(res, { data: rows });
  } catch (err) { next(err); }
});
legacyVendorRouter.get('/get_states_by_country_id', async (req, res, next) => {
  try {
    const cid = Number((req.query as any)?.country_id ?? 101);
    const rows = await commonQuery<any>(
      `SELECT id, name, country_id, country_code, state_code FROM states
        WHERE country_id = :cid AND COALESCE(is_deleted,0)=0 AND status=1 ORDER BY name`,
      { cid } as any,
    );
    send(res, { data: rows });
  } catch (err) { next(err); }
});
legacyVendorRouter.post('/get_city', async (req, res, next) => {
  try {
    const sid = (req.body as any)?.state_id ?? (req.body as any)?.city_state_id;
    const rows = sid
      ? await commonQuery<any>(
          `SELECT city_id, city_name, city_state, city_state_id FROM city
            WHERE city_state_id = :sid AND COALESCE(is_deleted,0)=0 AND status=1 ORDER BY city_name`,
          { sid },
        )
      : await commonQuery<any>(
          `SELECT city_id, city_name, city_state, city_state_id FROM city
            WHERE COALESCE(is_deleted,0)=0 AND status=1 ORDER BY city_name`,
        );
    send(res, { data: rows });
  } catch (err) { next(err); }
});
legacyVendorRouter.post('/listProofTypes', async (_req, res, next) => {
  try {
    const rows = await commonQuery<any>(
      `SELECT id, proof_name FROM master_proof_types
        WHERE COALESCE(is_deleted,0)=0 AND status=1 ORDER BY proof_name`,
    );
    send(res, { data: rows });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────────────────────
 *  v4.5.26 — Additional public vendor endpoints requested by mobile.
 *  - /getToolList: alias for /getTools (mobile naming variant).
 *  - /vendorlistReviews: public vendor reviews (window-shopping; takes
 *    vendor_id from body — does NOT use req.user).
 *  - /vendorGetSettings: public settings (deny-listed).
 * ───────────────────────────────────────────────────────────── */
legacyVendorRouter.get('/getToolList', async (_req, res, next) => {
  try {
    const rows = await commonQuery<any>(
      `SELECT id, tool_name, tool_slug, description FROM tools_master
        WHERE COALESCE(is_deleted,0)=0 AND status=1 ORDER BY tool_name`,
    );
    send(res, { data: rows });
  } catch (err) { next(err); }
});

legacyVendorRouter.post('/vendorlistReviews', async (req, res, next) => {
  try {
    const vendorId = pickId(req.body, 'vendor_id', 'vendorId', 'id');
    if (!vendorId) throw new ApiError(400, 'vendor_id required');
    const data = await reviewSvc.listVendorReviews(vendorId);
    send(res, { data });
  } catch (err) { next(err); }
});

/* ⚠️ SECURITY-SENSITIVE HANDLER — see legacyCustomer.ts publicSettingsHandler
 * for the full decision record. This mirror handler intentionally exposes
 * payment_secret / smtp_password / smtp_username in the unauthenticated
 * vendor response per the user authorisation on 2026-06-17 (RELEASE_NOTES
 * v4.5.34). If you revert this, also rotate credentials — they are
 * compromised the moment this endpoint went live.
 */
async function publicVendorSettingsHandler(_req: any, res: any, next: any) {
  try {
    const row: Record<string, any> = (await one<any>('SELECT * FROM settings LIMIT 1')) || {};
    const razorpayPublicKey = row.payment_key    || process.env.RAZORPAY_KEY_ID     || null;
    const razorpaySecret    = row.payment_secret || process.env.RAZORPAY_KEY_SECRET || null;
    const smtpPwd           = row.smtp_password  || process.env.SMTP_PASSWORD       || null;
    const smtpUser          = row.smtp_username  || process.env.SMTP_USERNAME       || row.smtp_from_email || null;
    const enriched: Record<string, any> = {
      ...row,                                                // ⚠ raw row -- NOT denylisted (intentional)
      payment_key:    razorpayPublicKey,
      razorpay_key:   razorpayPublicKey,
      payment_secret: razorpaySecret,                        // ⚠ Razorpay merchant secret — exposed by design
      payment_name:   row.payment_name || 'Razorpay',
      smtp_username:  smtpUser,                              // ⚠ mail username — exposed by design
      smtp_password:  smtpPwd,                               // ⚠ mail password — exposed by design
      currency:       row.currency || 'INR',
    };
    send(res, {
      data: enriched,
      categories: [enriched],
    });
  } catch (err) { next(err); }
}
legacyVendorRouter.get('/vendorGetSettings', publicVendorSettingsHandler);
legacyVendorRouter.post('/vendorGetSettings', publicVendorSettingsHandler);

/* ─────────────────────────────────────────────────────────────
 *  v4.5.35 — Phase 2 missing public endpoints from old backend.
 *  These were on the old app.vayil.in but absent from the new stack.
 *  Audit found mobile parsers reference them; the Postman collection
 *  lists them under masters / lookups. Added here as public lookups.
 * ───────────────────────────────────────────────────────────── */

/** GET /vendor/get_currency — currency master. Single-row INR for now;
 *  populate the table when more currencies are needed. */
legacyVendorRouter.get('/get_currency', async (_req, res, next) => {
  try {
    const rows = await commonQuery<any>(
      `SELECT id, code, name, symbol FROM currencies
        WHERE COALESCE(is_deleted,0)=0 ORDER BY id`,
    ).catch(() => []);
    const data = (rows && rows.length) ? rows
      : [{ id: 1, code: 'INR', name: 'Indian Rupee', symbol: '₹' }];
    send(res, { data });
  } catch (err) { next(err); }
});

/** GET /vendor/get_states — all states (no country filter). Mobile uses
 *  this for India-only flows. */
legacyVendorRouter.get('/get_states', async (_req, res, next) => {
  try {
    const rows = await commonQuery<any>(
      `SELECT id, name, country_id, country_code, state_code FROM states
        WHERE COALESCE(is_deleted,0)=0 AND status=1 ORDER BY name`,
    );
    send(res, { data: rows });
  } catch (err) { next(err); }
});

/** POST /vendor/get_states_by_country_id — mobile sometimes sends this as POST.
 *  Aliased to the GET handler above. */
legacyVendorRouter.post('/get_states_by_country_id', async (req, res, next) => {
  try {
    const cid = Number((req.body as any)?.country_id ?? (req.query as any)?.country_id ?? 101);
    const rows = await commonQuery<any>(
      `SELECT id, name, country_id, country_code, state_code FROM states
        WHERE country_id = :cid AND COALESCE(is_deleted,0)=0 AND status=1 ORDER BY name`,
      { cid } as any,
    );
    send(res, { data: rows });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────────────────────
 *  Authenticated vendor endpoints
 * ───────────────────────────────────────────────────────────── */
legacyVendorRouter.use(requireAuth(['vendor']));

/* ───── Onboarding step1..step4 + serviceTagStep ───── */
async function handleStep(step: number, req: AuthRequest, res: any, next: any) {
  try {
    const vendor = await vendorSvc.onboardingStep(req.user!.id, step, {
      name: req.body?.name, company_name: req.body?.company_name,
      owner_name: req.body?.owner_name, email: req.body?.email,
      city: req.body?.city, address: req.body?.address, pincode: req.body?.pincode,
      about: req.body?.about, profile_image: req.body?.profile_image,
      gst_number: req.body?.gst_number,
      is_gst_registered: req.body?.is_gst_registered === 'true' || req.body?.is_gst_registered === true,
      experience_years: req.body?.experience_years ? num(req.body.experience_years) : null,
      proof_type: req.body?.proof_type, proof_number: req.body?.proof_number,
      kyc_document_url: req.body?.kyc_document_url,
      fcm_token: req.body?.fcm_token,
    });
    send(res, { message: `Step ${step} saved`, data: vendor });
  } catch (err) { next(err); }
}
legacyVendorRouter.post('/step1', (req: AuthRequest, res, next) => handleStep(1, req, res, next));
legacyVendorRouter.post('/step2', (req: AuthRequest, res, next) => handleStep(2, req, res, next));
legacyVendorRouter.post('/step3', (req: AuthRequest, res, next) => handleStep(3, req, res, next));
legacyVendorRouter.post('/step4', (req: AuthRequest, res, next) => handleStep(4, req, res, next));

legacyVendorRouter.post('/serviceTagStep', async (req: AuthRequest, res, next) => {
  try {
    const tag = await vendorSvc.addServiceTag(String(req.body?.name || req.body?.tag || '').trim());
    send(res, { message: 'Tag saved', data: tag });
  } catch (err) { next(err); }
});

legacyVendorRouter.post('/VendorAddServiceTag', async (req: AuthRequest, res, next) => {
  try {
    const tag = await vendorSvc.addServiceTag(String(req.body?.name || req.body?.tag || '').trim());
    send(res, { message: 'Tag added', data: tag });
  } catch (err) { next(err); }
});

/* ───── Service listings ───── */
legacyVendorRouter.post('/saveServiceListing', async (req: AuthRequest, res, next) => {
  try {
    const out = await vendorSvc.createListing(req.user!.id, {
      title: req.body?.title,
      description: req.body?.description,
      price: req.body?.price ? num(req.body.price) : undefined,
      unit: req.body?.unit,
      category_id: pickId(req.body, 'category_id', 'categoryId') || undefined,
      subcategory_id: pickId(req.body, 'subcategory_id', 'subcategoryId') || undefined,
      thumbnail: req.body?.thumbnail,
      tag_ids: Array.isArray(req.body?.tag_ids) ? req.body.tag_ids.map(Number) : undefined,
    });
    send(res, { message: 'Listing saved', data: out, vendor_service_id: out?.vendor_service_id }, 201);
  } catch (err) { next(err); }
});

legacyVendorRouter.post('/updateServiceListing', async (req: AuthRequest, res, next) => {
  try {
    const serviceId = pickId(req.body, 'vendor_service_id', 'service_id', 'serviceId', 'id');
    if (!serviceId) throw new ApiError(400, 'vendor_service_id required');
    const out = await vendorSvc.updateListing(req.user!.id, serviceId, {
      title: req.body?.title, description: req.body?.description,
      price: req.body?.price ? num(req.body.price) : undefined,
      unit: req.body?.unit,
      category_id: pickId(req.body, 'category_id', 'categoryId') || undefined,
      subcategory_id: pickId(req.body, 'subcategory_id', 'subcategoryId') || undefined,
      thumbnail: req.body?.thumbnail,
      tag_ids: Array.isArray(req.body?.tag_ids) ? req.body.tag_ids.map(Number) : undefined,
    });
    send(res, { message: 'Listing updated', data: out });
  } catch (err) { next(err); }
});

const handleListings = async (req: AuthRequest, res: any, next: any) => {
  try {
    const data = await vendorSvc.listListings(req.user!.id);
    send(res, { data });
  } catch (err) { next(err); }
};
legacyVendorRouter.get('/getVendorServiceList', handleListings);
legacyVendorRouter.post('/getVendorServiceList', handleListings);

legacyVendorRouter.post('/ServiceStatusUpdate', async (req: AuthRequest, res, next) => {
  try {
    const serviceId = pickId(req.body, 'vendor_service_id', 'service_id', 'id');
    if (!serviceId) throw new ApiError(400, 'service_id required');
    const active = req.body?.status === '1' || req.body?.status === 1 || req.body?.status === true || req.body?.status === 'true';
    const out = await vendorSvc.setListingStatus(req.user!.id, serviceId, active);
    send(res, { message: 'Status updated', data: out });
  } catch (err) { next(err); }
});

legacyVendorRouter.post('/ServiceDetails', async (req: AuthRequest, res, next) => {
  try {
    const serviceId = pickId(req.body, 'vendor_service_id', 'service_id', 'id');
    if (!serviceId) throw new ApiError(400, 'service_id required');
    const out = await vendorSvc.getListing(req.user!.id, serviceId);
    send(res, { data: out });
  } catch (err) { next(err); }
});

/* ───── Enquiries ───── */
/* v4.5.35 — mobile compat bridge.
 * Mobile parser at vendor-app/lib/Models/vendor_New_Enquire_List.dart reads
 * json['new_enquiry'], json['ongoing'], json['request_quotation'] at TOP
 * LEVEL of the response. Without these buckets the vendor home screen
 * shows three empty tabs. We categorize by enquiry.status:
 *   new_enquiry       — anything still un-handled (not accepted/rejected/quoted)
 *   ongoing           — accepted/in_progress
 *   request_quotation — quote-related statuses (revision, change request)
 */
legacyVendorRouter.post('/vendorEnuqiryList', async (req: AuthRequest, res, next) => {
  try {
    const data = await enquirySvc.listVendorEnquiries(req.user!.id);
    const arr: any[] = Array.isArray(data) ? data : [];
    const ONGOING_STATUSES = new Set(['accepted', 'ongoing', 'in_progress', 'quote_accepted']);
    const QUOTE_STATUSES   = new Set(['quote_requested', 'quotation_requested', 'revision_requested', 'quote_sent']);
    const isOngoing  = (e: any) => ONGOING_STATUSES.has(String(e?.status ?? '').toLowerCase());
    const isQuoteReq = (e: any) => QUOTE_STATUSES.has(String(e?.status ?? '').toLowerCase());
    const isNew      = (e: any) => !isOngoing(e) && !isQuoteReq(e) && String(e?.status ?? '').toLowerCase() !== 'rejected';
    send(res, {
      data,
      new_enquiry:       arr.filter(isNew),
      ongoing:           arr.filter(isOngoing),
      request_quotation: arr.filter(isQuoteReq),
    });
  } catch (err) { next(err); }
});

legacyVendorRouter.post('/AcceptEnquiredStatusUpdate', async (req: AuthRequest, res, next) => {
  try {
    const enquiryId = pickId(req.body, 'enquiry_id', 'enquiryId', 'id');
    if (!enquiryId) throw new ApiError(400, 'enquiry_id required');
    const out = await enquirySvc.vendorAcceptEnquiry(req.user!.id, enquiryId);
    send(res, { message: 'Enquiry accepted', data: out });
  } catch (err) { next(err); }
});

legacyVendorRouter.post('/vendorRejectEnquiry', async (req: AuthRequest, res, next) => {
  try {
    const enquiryId = pickId(req.body, 'enquiry_id', 'enquiryId', 'id');
    if (!enquiryId) throw new ApiError(400, 'enquiry_id required');
    const out = await enquirySvc.vendorRejectEnquiry(req.user!.id, enquiryId, req.body?.reason);
    send(res, { message: 'Enquiry rejected', data: out });
  } catch (err) { next(err); }
});

/* ───── Quotation ───── */
legacyVendorRouter.post('/sendQuotationToCustomer', async (req: AuthRequest, res, next) => {
  try {
    const enquiryId = pickId(req.body, 'enquiry_id', 'enquiryId');
    if (!enquiryId) throw new ApiError(400, 'enquiry_id required');
    const out = await quoteSvc.sendQuote({
      vendor_id: req.user!.id,
      enquiry_id: enquiryId,
      amount: num(req.body?.amount),
      message: req.body?.message,
      estimated_days: req.body?.estimated_days ? num(req.body.estimated_days) : undefined,
      valid_until: req.body?.valid_until,
      advance_amount: req.body?.advance_amount ? num(req.body.advance_amount) : undefined,
    });
    send(res, { message: 'Quote sent', data: out, quotation_id: out?.quotation_id }, 201);
  } catch (err) { next(err); }
});

/* ───── Plans ───── */
function parseMilestones(body: any): projectSvc.MilestoneInput[] {
  const raw = body?.milestones ?? body?.plan ?? body?.plans;
  if (Array.isArray(raw)) return raw as any;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return []; }
  }
  return [];
}

legacyVendorRouter.post('/createPlan', async (req: AuthRequest, res, next) => {
  try {
    const orderId = pickId(req.body, 'order_id', 'orderId');
    if (!orderId) throw new ApiError(400, 'order_id required');
    await projectSvc.assertOrderBelongsToVendor(orderId, req.user!.id);
    const data = await projectSvc.createPlan(orderId, parseMilestones(req.body));
    // v4.5.35 — mobile bridge: Create_Plan_List_Model.dart reads
    // total_base_amount, used_percentage, current_plan_amount, remaining_percentage
    // at top level. Compute from the order + new plan.
    const project = await one<any>('SELECT amount FROM orders WHERE order_id = :id', { id: orderId });
    const planRows: any[] = Array.isArray(data) ? data : ((data as any)?.plan ?? []);
    const baseAmount = Number(project?.amount ?? 0);
    const usedAmount = planRows.reduce((s: number, p: any) => s + Number(p?.amount ?? 0), 0);
    const pct = baseAmount > 0 ? Math.round((usedAmount / baseAmount) * 100) : 0;
    send(res, {
      message: 'Plan created',
      data,
      total_base_amount:     baseAmount,
      used_percentage:       pct,
      current_plan_amount:   usedAmount,
      remaining_percentage:  Math.max(0, 100 - pct),
    }, 201);
  } catch (err) { next(err); }
});

legacyVendorRouter.post('/updatePlan', async (req: AuthRequest, res, next) => {
  try {
    const orderId = pickId(req.body, 'order_id', 'orderId');
    if (!orderId) throw new ApiError(400, 'order_id required');
    await projectSvc.assertOrderBelongsToVendor(orderId, req.user!.id);
    const data = await projectSvc.updatePlan(orderId, parseMilestones(req.body));
    send(res, { message: 'Plan updated', data });
  } catch (err) { next(err); }
});

legacyVendorRouter.post('/updatePlanStatus', async (req: AuthRequest, res, next) => {
  try {
    const orderId = pickId(req.body, 'order_id', 'orderId');
    if (!orderId) throw new ApiError(400, 'order_id required');
    await projectSvc.assertOrderBelongsToVendor(orderId, req.user!.id);
    const out = await projectSvc.submitPlan(orderId);
    send(res, { message: 'Plan submitted', data: out });
  } catch (err) { next(err); }
});

legacyVendorRouter.post('/vendorgetPlan', async (req: AuthRequest, res, next) => {
  try {
    const orderId = pickId(req.body, 'order_id', 'orderId');
    if (!orderId) throw new ApiError(400, 'order_id required');
    await projectSvc.assertOrderBelongsToVendor(orderId, req.user!.id);
    const data = await projectSvc.getProject(orderId);
    // v4.5.35 — mobile bridge for the plan progress widget.
    // Mobile reads: summary, total_base_amount, used_percentage,
    //               used_amount, balance_percentage, plans.
    const project: any = (data as any)?.project ?? {};
    const plans:   any[] = (data as any)?.plan   ?? [];
    const baseAmount = Number(project?.amount ?? 0);
    const usedAmount = plans.reduce((s: number, p: any) => s + Number(p?.amount ?? 0), 0);
    const usedPct = baseAmount > 0 ? Math.round((usedAmount / baseAmount) * 100) : 0;
    send(res, {
      data,
      summary:             project,
      total_base_amount:   baseAmount,
      used_percentage:     usedPct,
      used_amount:         usedAmount,
      balance_percentage:  Math.max(0, 100 - usedPct),
      plans,
    });
  } catch (err) { next(err); }
});

legacyVendorRouter.post('/vendorPlanDetails', async (req: AuthRequest, res, next) => {
  try {
    const orderId = pickId(req.body, 'order_id', 'orderId');
    if (!orderId) throw new ApiError(400, 'order_id required');
    await projectSvc.assertOrderBelongsToVendor(orderId, req.user!.id);
    const data = await projectSvc.getProject(orderId);
    send(res, { data });
  } catch (err) { next(err); }
});

/** createAcceptPlan — mobile shortcut that creates the plan AND submits it. */
legacyVendorRouter.post('/createAcceptPlan', async (req: AuthRequest, res, next) => {
  try {
    const orderId = pickId(req.body, 'order_id', 'orderId');
    if (!orderId) throw new ApiError(400, 'order_id required');
    await projectSvc.assertOrderBelongsToVendor(orderId, req.user!.id);
    await projectSvc.createPlan(orderId, parseMilestones(req.body));
    const out = await projectSvc.submitPlan(orderId);
    send(res, { message: 'Plan created and submitted', data: out }, 201);
  } catch (err) { next(err); }
});

/* ───── Materials ───── */
legacyVendorRouter.post('/addPlanMaterial', async (req: AuthRequest, res, next) => {
  try {
    const orderId = pickId(req.body, 'order_id', 'orderId');
    if (!orderId) throw new ApiError(400, 'order_id required');
    await projectSvc.assertOrderBelongsToVendor(orderId, req.user!.id);
    const m = await materialSvc.addMaterial(orderId, {
      name: req.body?.name || req.body?.material_name || '',
      quantity: req.body?.quantity ? num(req.body.quantity) : 1,
      unit: req.body?.unit,
      rate: req.body?.rate ? num(req.body.rate) : 0,
    });
    send(res, { message: 'Material added', data: m, material_id: m?.material_id }, 201);
  } catch (err) { next(err); }
});

legacyVendorRouter.post('/editPlanMaterial', async (req: AuthRequest, res, next) => {
  try {
    const orderId = pickId(req.body, 'order_id', 'orderId');
    const materialId = pickId(req.body, 'material_id', 'materialId');
    if (!orderId || !materialId) throw new ApiError(400, 'order_id and material_id required');
    await projectSvc.assertOrderBelongsToVendor(orderId, req.user!.id);
    const m = await materialSvc.updateMaterial(orderId, materialId, {
      name: req.body?.name,
      quantity: req.body?.quantity ? num(req.body.quantity) : undefined,
      unit: req.body?.unit,
      rate: req.body?.rate ? num(req.body.rate) : undefined,
    });
    send(res, { message: 'Material updated', data: m });
  } catch (err) { next(err); }
});

legacyVendorRouter.post('/vendorgetMaterial', async (req: AuthRequest, res, next) => {
  try {
    const orderId = pickId(req.body, 'order_id', 'orderId');
    if (!orderId) throw new ApiError(400, 'order_id required');
    await projectSvc.assertOrderBelongsToVendor(orderId, req.user!.id);
    const data = await materialSvc.listMaterials(orderId);
    send(res, { data });
  } catch (err) { next(err); }
});

legacyVendorRouter.post('/vendorMaterialDetails', async (req: AuthRequest, res, next) => {
  try {
    const materialId = pickId(req.body, 'material_id', 'materialId');
    if (!materialId) throw new ApiError(400, 'material_id required');
    const data = await materialSvc.getMaterial(materialId);
    // Verify vendor ownership via the parent order.
    const owner = await one<any>(
      `SELECT o.vendor_id FROM materials m JOIN orders o ON o.order_id = m.order_id
        WHERE m.material_id = :id LIMIT 1`,
      { id: materialId },
    );
    if (!owner || Number(owner.vendor_id) !== Number(req.user!.id)) throw new ApiError(404, 'Material not found');
    send(res, { data });
  } catch (err) { next(err); }
});

legacyVendorRouter.post('/vendorOrderDetails', async (req: AuthRequest, res, next) => {
  try {
    const orderId = pickId(req.body, 'order_id', 'orderId');
    if (!orderId) throw new ApiError(400, 'order_id required');
    await projectSvc.assertOrderBelongsToVendor(orderId, req.user!.id);
    const data = await projectSvc.getProject(orderId);
    // v4.5.35 — mobile bridge: workflow timeline reads `steps`,
    // order summary reads `ordersMain`, plan reads `order_plan`.
    const project = (data as any)?.project ?? {};
    const plan    = (data as any)?.plan    ?? [];
    send(res, {
      data,
      steps:       plan,        // mobile renders each plan row as a workflow step
      ordersMain:  project,     // order header card
      order_plan:  plan,        // explicit alias
    });
  } catch (err) { next(err); }
});

/** GET /vendor/vendorInfo — vendor self-profile lookup (mobile expects GET). */
legacyVendorRouter.get('/vendorInfo', async (req: AuthRequest, res, next) => {
  try {
    const v = await vendorSvc.getVendor(req.user!.id);
    send(res, { data: v, vendor_id: v?.vendor_id ?? v?.id });
  } catch (err) { next(err); }
});

/* ───── Payment request (vendor → customer) ───── */
legacyVendorRouter.post('/AskPyament', async (req: AuthRequest, res, next) => {
  try {
    const planId = pickId(req.body, 'plan_id', 'planId', 'milestone_id');
    if (!planId) throw new ApiError(400, 'plan_id required');
    const out = await projectSvc.requestMilestonePayment(planId, req.user!.id);
    send(res, { message: 'Payment requested', data: out });
  } catch (err) { next(err); }
});

legacyVendorRouter.post('/vendorPaymentSummary', async (req: AuthRequest, res, next) => {
  try {
    const orderId = pickId(req.body, 'order_id', 'orderId');
    if (!orderId) throw new ApiError(400, 'order_id required');
    await projectSvc.assertOrderBelongsToVendor(orderId, req.user!.id);
    const intents: any[] = await query<any>(
      `SELECT * FROM payment_intents WHERE order_id = :id ORDER BY intent_id DESC`,
      { id: orderId },
    );
    const held     = intents.filter((i) => i.status === 'escrow_held').reduce((s, i) => s + Number(i.amount), 0);
    const released = intents.filter((i) => i.status === 'released').reduce((s, i) => s + Number(i.amount), 0);
    // v4.5.35 — mobile bridge: Vendor_Payment_summary_Model.dart reads
    // 9 specific top-level keys (mind the capitalisation — TotalAmount with
    // a capital T, servicePayment with lowercase).
    const order = await one<any>('SELECT amount FROM orders WHERE order_id = :id', { id: orderId });
    const totalAmount     = Number(order?.amount ?? 0);
    const servicePayment  = intents.filter((i) => (i.purpose ?? i.type ?? '').toLowerCase().includes('service') || !i.purpose);
    const materialPayment = intents.filter((i) => (i.purpose ?? i.type ?? '').toLowerCase().includes('material'));
    const totalMaterialAmount = materialPayment.reduce((s, i) => s + Number(i.amount), 0);
    const totalPlanAmount     = servicePayment.reduce((s, i) => s + Number(i.amount), 0);
    const base = `${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://vayil-web.vercel.app'}/invoice`;
    send(res, {
      data: { intents, held, released },
      TotalAmount:         totalAmount,
      TotalPaidAmount:     released,
      TotalMaterialAmount: totalMaterialAmount,
      TotalPlanAmount:     totalPlanAmount,
      servicePayment,
      materialPayment,
      invoice_url:         `${base}/`,
      https:               base.startsWith('https'),
    });
  } catch (err) { next(err); }
});

/* ───── Wallet / earnings ───── */
/* v4.5.35 — shared aggregate fetch: mobile parsers expect
 *   { balance, total_earning, total_payout } at top level of
 * vendorBalance / vendorTransactionHistory / vendorTransHistoryCurMon.
 * Compute once, splice into each handler's response. */
async function loadVendorAggregates(vendorId: number | string) {
  const wallet = await vendorSvc.getVendorWallet(vendorId);
  const payoutRow = await one<any>(
    `SELECT COALESCE(SUM(amount), 0) AS total
       FROM payout_requests
      WHERE vendor_id = :id AND status IN ('approved', 'paid', 'completed')`,
    { id: vendorId },
  ).catch(() => null);
  return {
    wallet,
    balance:       Number(wallet?.balance ?? 0),
    total_earning: Number(wallet?.total_earning ?? 0),
    total_payout:  Number(payoutRow?.total ?? 0),
  };
}

legacyVendorRouter.post('/vendorBalance', async (req: AuthRequest, res, next) => {
  try {
    const agg = await loadVendorAggregates(req.user!.id);
    send(res, {
      data: agg.wallet,
      balance:       agg.balance,
      total_earning: agg.total_earning,
      total_payout:  agg.total_payout,
    });
  } catch (err) { next(err); }
});

legacyVendorRouter.get('/getVendorRevenueChart', async (req: AuthRequest, res, next) => {
  try {
    const data = await payoutSvc.getRevenueChart(req.user!.id, req.query?.months ? num(req.query.months) : 6);
    send(res, { data });
  } catch (err) { next(err); }
});

legacyVendorRouter.post('/vendorTransactionHistory', async (req: AuthRequest, res, next) => {
  try {
    const [data, agg] = await Promise.all([
      payoutSvc.getVendorTransactions(req.user!.id),
      loadVendorAggregates(req.user!.id),
    ]);
    // v4.5.35 — mobile bridge: Transaction_History_Model.dart reads
    // balance, total_earning, total_payout, total at top level.
    send(res, {
      data,
      balance:       agg.balance,
      total_earning: agg.total_earning,
      total_payout:  agg.total_payout,
      total:         Array.isArray(data) ? data.length : 0,
    });
  } catch (err) { next(err); }
});

legacyVendorRouter.post('/vendorTransHistoryCurMon', async (req: AuthRequest, res, next) => {
  try {
    const [data, agg] = await Promise.all([
      payoutSvc.getVendorTransactions(req.user!.id, { currentMonth: true }),
      loadVendorAggregates(req.user!.id),
    ]);
    // v4.5.35 — mobile bridge: Current_MonthEarning_History_List_Model.dart
    // adds `month` to the same top-level aggregate set.
    const now = new Date();
    const monthLabel = `${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
    send(res, {
      data,
      balance:       agg.balance,
      total_earning: agg.total_earning,
      total_payout:  agg.total_payout,
      month:         monthLabel,
      total:         Array.isArray(data) ? data.length : 0,
    });
  } catch (err) { next(err); }
});

legacyVendorRouter.post('/vendorPayout', async (req: AuthRequest, res, next) => {
  try {
    const amount = num(req.body?.amount);
    const out = await payoutSvc.requestPayout(req.user!.id, amount, pickId(req.body, 'bank_id', 'bankId') || undefined, req.body?.note);
    send(res, { message: 'Payout requested', data: out }, 201);
  } catch (err) { next(err); }
});

/* ───── Bank details ───── */
legacyVendorRouter.post('/AddBankDetails', async (req: AuthRequest, res, next) => {
  try {
    const out = await bankSvc.addBankDetails(req.user!.id, {
      account_holder: req.body?.account_holder || req.body?.holder_name,
      account_number: req.body?.account_number,
      ifsc_code: req.body?.ifsc_code || req.body?.ifsc,
      bank_name: req.body?.bank_name,
      branch: req.body?.branch,
      upi_id: req.body?.upi_id,
      is_primary: req.body?.is_primary === 'true' || req.body?.is_primary === true,
    });
    send(res, { message: 'Bank added', data: out }, 201);
  } catch (err) { next(err); }
});

legacyVendorRouter.post('/EditBankDetails', async (req: AuthRequest, res, next) => {
  try {
    const bankId = pickId(req.body, 'bank_id', 'bankId', 'id');
    if (!bankId) throw new ApiError(400, 'bank_id required');
    const out = await bankSvc.editBankDetails(req.user!.id, bankId, {
      account_holder: req.body?.account_holder, account_number: req.body?.account_number,
      ifsc_code: req.body?.ifsc_code, bank_name: req.body?.bank_name,
      branch: req.body?.branch, upi_id: req.body?.upi_id,
    });
    send(res, { message: 'Bank updated', data: out });
  } catch (err) { next(err); }
});

legacyVendorRouter.post('/GetBankDetails', async (req: AuthRequest, res, next) => {
  try {
    const data = await bankSvc.listBankDetails(req.user!.id);
    send(res, { data });
  } catch (err) { next(err); }
});

legacyVendorRouter.post('/EditBankDetailsReq', async (req: AuthRequest, res, next) => {
  try {
    const bankId = pickId(req.body, 'bank_id', 'bankId', 'id');
    if (!bankId) throw new ApiError(400, 'bank_id required');
    const out = await bankSvc.requestEditBankDetails(req.user!.id, bankId, {
      account_holder: req.body?.account_holder, account_number: req.body?.account_number,
      ifsc_code: req.body?.ifsc_code, bank_name: req.body?.bank_name,
      branch: req.body?.branch, upi_id: req.body?.upi_id,
    });
    send(res, { message: 'Edit requested', data: out });
  } catch (err) { next(err); }
});

/* ───── Notifications / Reviews ───── */
legacyVendorRouter.post('/vendorNotificationList', async (req: AuthRequest, res, next) => {
  try {
    const data = await notifSvc.list('vendor', req.user!.id);
    send(res, { data });
  } catch (err) { next(err); }
});

/* vendorlistReviews + vendorGetSettings moved to public block above (v4.5.26).
 * NB: vendorlistReviews now takes vendor_id from the request body rather than
 * the auth token so the public-profile view works pre-login. */

/* ───── Upload ───── */
legacyVendorRouter.post('/upload_files',
  upload.any(),
  async (req: AuthRequest, res, next) => {
    try {
      const { uploadFiles } = await import('../utils/uploads');
      const { validateProfileImage } = await import('../utils/imageValidation');
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (!files.length) throw new ApiError(400, 'no files in request');
      if (req.body?.kind === 'profile') files.forEach(validateProfileImage);
      const urls = await uploadFiles(files as any, { prefix: `vendor-${req.user!.id}` });
      send(res, { message: 'Uploaded', data: urls, urls });
    } catch (err) { next(err); }
  },
);

/* ─────────────────────────────────────────────────────────────
 *  v4.5.35 — Phase 2 missing auth-gated vendor endpoints.
 * ───────────────────────────────────────────────────────────── */

/** POST /vendor/markNotificationRead — mark one notification read by id.
 *  Per-user state, requires vendor auth. Mobile passes notification_id. */
legacyVendorRouter.post('/markNotificationRead', async (req: AuthRequest, res, next) => {
  try {
    const id = pickId(req.body, 'notification_id', 'id', 'notificationId');
    if (!id) throw new ApiError(400, 'notification_id required');
    await notifSvc.markRead(id, 'vendor', req.user!.id);
    send(res, { message: 'Notification marked read' });
  } catch (err) { next(err); }
});

/** POST /vendor/ServiceReviewStatusUpdate — vendor moderates a review on
 *  one of their listings (e.g. report inappropriate). Body: { review_id, status }. */
legacyVendorRouter.post('/ServiceReviewStatusUpdate', async (req: AuthRequest, res, next) => {
  try {
    const reviewId = pickId(req.body, 'review_id', 'reviewId', 'id');
    if (!reviewId) throw new ApiError(400, 'review_id required');
    const status = String(req.body?.status ?? 'reported');
    await exec(
      `UPDATE customer_reviews SET status = :status, updated_at = NOW()
        WHERE review_id = :id AND vendor_id = :vid`,
      { id: reviewId, vid: req.user!.id, status },
    );
    send(res, { message: 'Review status updated' });
  } catch (err) { next(err); }
});

/** POST /vendor/checkPermission — lightweight permission lookup. Returns
 *  { allowed: true } if the vendor token is valid (which it is by
 *  definition here, since requireAuth has already passed). Mobile uses
 *  this as a "ping" to validate the token is still good. */
legacyVendorRouter.post('/checkPermission', async (req: AuthRequest, res, next) => {
  try {
    send(res, { message: 'Permitted', allowed: true, vendor_id: req.user!.id });
  } catch (err) { next(err); }
});
