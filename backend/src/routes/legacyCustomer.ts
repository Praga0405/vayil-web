/**
 * legacyCustomer.ts — endpoints the existing Vayil customer Flutter app
 * calls. Mount this BEFORE the canonical /customers router so the names
 * don't collide. Every handler is a thin shim that:
 *
 *   1. Pulls IDs from any of: mobile_number / mobile / phone, customer_id
 *      string-or-int, body / query / path.
 *   2. Calls one of the canonical service modules — no DB logic lives in
 *      this file.
 *   3. Responds with { success, message, data, ... } to match the shape
 *      the Flutter app expects.
 *
 * The Flutter app sends every POST as multipart/form-data (Dio's
 * FormData.fromMap). The legacyMultipart middleware in index.ts populates
 * req.body before this router runs.
 */
import { Router } from 'express';
import multer from 'multer';
import { ApiError } from '../utils/http';
import { requireAuth, softAuth } from '../middleware/auth';
import { AuthRequest } from '../types';
import { exec, one, query } from '../db';
import { publicSettingsSafe } from './common';

import * as authService from '../services/authService';
import * as customerSvc from '../services/customerService';
import * as enquirySvc from '../services/enquiryService';
import * as quoteSvc from '../services/quoteService';
import * as projectSvc from '../services/projectService';
import * as paymentSvc from '../services/paymentService';
import * as notifSvc from '../services/notificationService';
import * as reviewSvc from '../services/reviewService';

export const legacyCustomerRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

/* ─────────────────────────────────────────────────────────────
 *  Helpers — payload extraction with all the legacy aliases.
 * ───────────────────────────────────────────────────────────── */
function pickPhone(b: any): string {
  return String(b?.mobile_number || b?.mobile || b?.phone || '').trim();
}
function pickId(b: any, ...keys: string[]): string {
  for (const k of keys) {
    if (b && b[k] !== undefined && b[k] !== null && b[k] !== '') return String(b[k]);
  }
  return '';
}
function toNumberSafe(v: any, fallback = 0): number {
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function imageUrlOrEmpty(v: any): string {
  const value = String(v ?? '').trim();
  if (!value || value.toLowerCase() === 'null' || value.toLowerCase() === 'undefined') return '';
  return value;
}
/** Send a legacy mobile success response. Mobile parses `success`, `message`,
 *  `data`, `result`, and `token` — include whichever apply. */
function send(res: any, payload: { message?: string; data?: any; result?: any; token?: string; [k: string]: any } = {}, status = 200) {
  return res.status(status).json({ success: true, message: payload.message ?? 'Success', ...payload });
}

async function fetchLegacyCustomerServiceList(body: any): Promise<any[] | null> {
  const endpoint = process.env.LEGACY_CUSTOMER_SERVICE_LIST_URL || 'https://app.vayil.in/customer/ServiceList';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        search: body?.search ?? '',
        category_id: body?.category_id ?? '',
        location: body?.location ?? '',
      }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const json = await response.json() as any;
    return Array.isArray(json?.data) ? json.data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchLegacyCustomerJson(path: string, body: any, authorization?: string): Promise<any | null> {
  const endpoint = `${process.env.LEGACY_CUSTOMER_API_BASE || 'https://app.vayil.in/customer'}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(authorization ? { Authorization: authorization } : {}),
      },
      body: JSON.stringify(body ?? {}),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function legacyCustomerRowsById(customerId: number | string) {
  return query<any>(
    `SELECT COALESCE(id, customer_id) AS id, name, email, COALESCE(ph_code, '+91') AS ph_code,
            COALESCE(phone, mobile) AS phone, status, created_at, updated_at, state, city,
            pincode, address, COALESCE(profile_photo, profile_image) AS profile_photo,
            COALESCE(device_id, '') AS device_id, otp, otp_expires_at, otp_attempts,
            last_otp_sent_at, COALESCE(terms_accept, 1) AS terms_accept,
            COALESCE(is_deleted, 0) AS is_deleted
       FROM customers
      WHERE customer_id = :id OR id = :id
      LIMIT 1`,
    { id: customerId },
  );
}

async function legacyCustomerIdByPhone(phone: string) {
  const row = await one<any>(
    `SELECT COALESCE(id, customer_id) AS id
       FROM customers
      WHERE phone = :phone OR mobile = :phone
      ORDER BY COALESCE(is_deleted, 0) ASC,
        CASE
          WHEN status IN ('verified', 'approved', 'active') THEN 0
          WHEN status IN ('pending', 'pending_approval') THEN 1
          ELSE 2
        END ASC,
        COALESCE(id, customer_id) ASC
      LIMIT 1`,
    { phone },
  ).catch(() => null);
  return row?.id ?? null;
}

const legacyServiceSelect = `
  SELECT
    COALESCE(vs.id, vs.vendor_service_id)              AS id,
    vs.vendor_id                                       AS vendor_id,
    COALESCE(vs.service_title, vs.title)               AS service_title,
    COALESCE(vs.service_category, vs.category_id)      AS service_category,
    COALESCE(vs.service_subcategory, vs.subcategory_id) AS service_subcategory,
    vs.description                                     AS description,
    vs.pricing_type                                    AS pricing_type,
    COALESCE(vs.unit_name, vs.unit)                    AS unit_name,
    vs.price                                           AS price,
    COALESCE(vs.service_image, vs.thumbnail)           AS service_image,
    vs.certificate_url                                 AS certificate_url,
    COALESCE(vs.is_active, vs.status, 1)               AS is_active,
    COALESCE(vs.show_review, 1)                        AS show_review,
    vs.created_at                                      AS created_at,
    vs.updated_at                                      AS updated_at,
    vs.minimum_fee                                     AS minimum_fee,
    COALESCE(vs.is_deleted, 0)                         AS is_deleted,
    v.company_name                                     AS company_name,
    v.name                                             AS vendor_name,
    sc.name                                            AS category_name,
    IFNULL((SELECT ROUND(AVG(cr.rating), 1)
              FROM customer_reviews cr
             WHERE cr.vendor_id = v.vendor_id AND COALESCE(cr.status, 1) = 1), 0) AS rating,
    (SELECT COUNT(*)
       FROM customer_reviews cr
      WHERE cr.vendor_id = v.vendor_id AND COALESCE(cr.status, 1) = 1)            AS review_count,
    (SELECT COUNT(*) FROM orders o WHERE o.vendor_id = v.vendor_id)                AS booking_count
  FROM vendor_services AS vs
  JOIN vendors AS v ON v.vendor_id = vs.vendor_id
  LEFT JOIN service_categories AS sc
         ON sc.category_id = CAST(COALESCE(vs.service_category, vs.category_id) AS UNSIGNED)
`;

function normalizeLegacyService(row: any, includeBookingText = false) {
  const n = Number(row?.booking_count ?? 0);
  const { booking_count, ...item } = row;
  const out: any = {
    ...item,
    service_image: imageUrlOrEmpty(item.service_image),
    rating: Number(row?.rating ?? 0).toFixed(1),
  };
  if (includeBookingText) out.booking_text = `${n} ${n === 1 ? 'booking' : 'bookings'}`;
  return out;
}

async function buildLocalServiceInfo(serviceId: string, customerId?: string) {
  const row = await one<any>(
    `${legacyServiceSelect}
      WHERE (vs.vendor_service_id = :id OR vs.id = :id)
        AND COALESCE(vs.is_deleted, 0) = 0
      LIMIT 1`,
    { id: serviceId },
  );
  if (!row) return null;
  const service = normalizeLegacyService(row);
  const [customer_reviews, cart_data, portfolioRows, similarRows] = await Promise.all([
    query<any>(
      `SELECT cr.*, c.name AS customer_name, c.profile_image AS customer_image
         FROM customer_reviews cr
         LEFT JOIN customers c ON c.customer_id = cr.customer_id
        WHERE cr.vendor_id = :vendorId AND COALESCE(cr.status, 1) = 1
        ORDER BY cr.created_at DESC`,
      { vendorId: row.vendor_id },
    ).catch(() => []),
    customerId && customerId !== '0'
      ? query<any>(
          `SELECT * FROM cart
            WHERE customer_id = :customerId AND vendor_id = :vendorId
              AND service_id = :serviceId AND COALESCE(status, 1) = 1`,
          { customerId, vendorId: row.vendor_id, serviceId },
        ).catch(() => [])
      : Promise.resolve([]),
    query<any>(
      `${legacyServiceSelect}
        WHERE vs.vendor_id = :vendorId AND COALESCE(vs.is_deleted, 0) = 0
        ORDER BY COALESCE(vs.id, vs.vendor_service_id) DESC`,
      { vendorId: row.vendor_id },
    ).catch(() => []),
    query<any>(
      `${legacyServiceSelect}
        WHERE COALESCE(vs.service_category, vs.category_id) = :category
          AND (vs.vendor_service_id <> :id AND COALESCE(vs.id, vs.vendor_service_id) <> :id)
          AND COALESCE(vs.is_deleted, 0) = 0
        ORDER BY COALESCE(vs.id, vs.vendor_service_id) DESC
        LIMIT 10`,
      { category: row.service_category, id: serviceId },
    ).catch(() => []),
  ]);
  const stripVendorName = (r: any) => {
    const item = normalizeLegacyService(r, true);
    delete item.vendor_name;
    return item;
  };
  return {
    service,
    customer_reviews,
    similar_vendors: similarRows.map(stripVendorName),
    cart_data,
    Portfolioservices: portfolioRows.map(stripVendorName),
  };
}

function enquiryStatusExpr(alias: string) {
  return `COALESCE(${alias}.status_int,
    CASE
      WHEN ${alias}.status IN ('new', 'pending') THEN 1
      WHEN ${alias}.status IN ('accepted', 'active') THEN 2
      WHEN ${alias}.status IN ('quoted', 'quote_received') THEN 11
      WHEN ${alias}.status = 'rejected' THEN 4
      WHEN ${alias}.status = 'completed' THEN 8
      ELSE CAST(${alias}.status AS UNSIGNED)
    END)`;
}

async function legacyQuotationRows(enquiryId: number | string) {
  return query<any>(
    `SELECT COALESCE(q.id, q.quotation_id) AS id, q.enquiry_id, q.customer_id,
            q.message, q.files, COALESCE(q.amount, q.final_amount, q.total) AS amount,
            q.service_time, ${enquiryStatusExpr('q')} AS status, q.created_at,
            COALESCE(sm.status_name,
              CASE
                WHEN q.status IN ('quoted', 'quote_received') THEN 'Quote Received'
                WHEN q.status = 'accepted' THEN 'Accepted'
                WHEN q.status = 'rejected' THEN 'Rejected'
                ELSE q.status
              END) AS status_name,
            v.company_name
       FROM quotation q
       LEFT JOIN vendors v ON v.vendor_id = q.vendor_id
       LEFT JOIN status_master sm ON sm.id = ${enquiryStatusExpr('q')}
      WHERE q.enquiry_id = :id
      ORDER BY COALESCE(q.id, q.quotation_id) DESC`,
    { id: enquiryId },
  ).catch(() => []);
}

async function legacyCustomerEnquiryRows(customerId: number | string, enquiryId?: string) {
  const where = enquiryId
    ? `e.customer_id = :customerId AND e.enquiry_id = :enquiryId`
    : `e.customer_id = :customerId`;
  const rows = await query<any>(
    `SELECT COALESCE(e.id, e.enquiry_id) AS enquiry_id, e.customer_id,
            COALESCE(e.first_name, c.name) AS first_name,
            COALESCE(e.last_name, '') AS last_name,
            COALESCE(e.email, c.email) AS email,
            COALESCE(e.phone, c.phone, c.mobile) AS phone,
            COALESCE(e.message, e.description) AS message,
            e.files,
            ${enquiryStatusExpr('e')} AS status,
            e.created_at, e.service_id, e.vendor_id,
            COALESCE(sm.status_name,
              CASE
                WHEN e.status IN ('new', 'pending') THEN 'Pending'
                WHEN e.status IN ('quoted', 'quote_received') THEN 'Quote Received'
                WHEN e.status = 'accepted' THEN 'Accepted'
                WHEN e.status = 'rejected' THEN 'Rejected'
                ELSE e.status
              END) AS status_name,
            v.company_name,
            COALESCE(vs.service_title, vs.title) AS service_title,
            vs.price,
            COALESCE(vs.unit_name, vs.unit) AS unit_name,
            vs.pricing_type,
            vs.description AS description,
            COALESCE(vs.service_image, vs.thumbnail) AS service_image,
            vs.minimum_fee
       FROM enquiries e
       LEFT JOIN customers c ON c.customer_id = e.customer_id
       LEFT JOIN vendors v ON v.vendor_id = e.vendor_id
       LEFT JOIN vendor_services vs ON vs.vendor_service_id = e.service_id OR vs.id = e.service_id
       LEFT JOIN status_master sm ON sm.id = ${enquiryStatusExpr('e')}
      WHERE ${where}
      ORDER BY COALESCE(e.id, e.enquiry_id) DESC`,
    { customerId, enquiryId },
  );
  return Promise.all(rows.map(async (row: any) => ({
    ...row,
    quotations: await legacyQuotationRows(row.enquiry_id),
    orders: await query<any>(
      `SELECT * FROM orders WHERE enquiry_id = :id ORDER BY order_id DESC`,
      { id: row.enquiry_id },
    ).catch(() => []),
  })));
}

/* ─────────────────────────────────────────────────────────────
 *  AUTH — register / OTP / login (mounted before requireAuth).
 * ───────────────────────────────────────────────────────────── */
legacyCustomerRouter.post('/register', async (req, res, next) => {
  try {
    const phone = pickPhone(req.body);
    const out = await authService.requestOtp(phone, 'customer');
    send(res, { message: 'Registration OTP sent', data: out });
  } catch (err) { next(err); }
});

legacyCustomerRouter.post('/verifyCustomerOTP', async (req, res, next) => {
  try {
    const phone = pickPhone(req.body);
    const customerIdInput = pickId(req.body, 'customerId', 'customer_id', 'id');
    const otp = String(req.body?.otp || req.body?.otpcode || '');
    const out = await authService.verifyOtpAndIssueToken({
      phone: phone || undefined,
      userId: customerIdInput || undefined,
      otp,
      userType: 'customer',
      name: req.body?.name,
    });
    const customerId = out.user?.customer_id ?? out.user?.id;
    res.status(200).json({
      success: true,
      message: 'OTP verified successfully.',
      customerId: String(customerId),
      token: out.token,
      data: await legacyCustomerRowsById(customerId),
    });
  } catch (err) { next(err); }
});

legacyCustomerRouter.post('/logincustomerWithOTP', async (req, res, next) => {
  try {
    const phone = pickPhone(req.body);
    const out = await authService.requestLoginOtp(phone, 'customer');
    const customerId = out.user?.customer_id ?? out.user?.id;
    res.status(200).json({
      success: true,
      message: 'OTP sent for login',
      customerId: String(customerId),
    });
  } catch (err) { next(err); }
});

legacyCustomerRouter.post('/verifyLogincustomerOTP', async (req, res, next) => {
  try {
    const phone = pickPhone(req.body);
    const otp = String(req.body?.otp || '');
    const customerIdInput = pickId(req.body, 'customerId', 'customer_id', 'id');
    const out = await authService.verifyOtpAndIssueToken({
      phone: phone || undefined,
      userId: customerIdInput || undefined,
      otp,
      userType: 'customer',
    });
    const customerId = out.user?.customer_id ?? out.user?.id;
    res.status(200).json({
      success: true,
      message: 'OTP verified successfully.',
      customerId: String(customerId),
      token: out.token,
      data: await legacyCustomerRowsById(customerId),
    });
  } catch (err) { next(err); }
});

legacyCustomerRouter.post('/resendcustomerOTP', async (req, res, next) => {
  try {
    const phone = pickPhone(req.body);
    await authService.requestOtp(phone, 'customer');
    send(res, { message: 'OTP resent' });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────────────────────
 *  v4.5.26 — PUBLIC pre-login browsing endpoints.
 *  Mobile team requested these be callable without a Bearer token so
 *  customers can browse the catalogue, settings, location pickers, and
 *  upload files before signing up. Must stay ABOVE the requireAuth
 *  wall below. None of these handlers read req.user.
 * ───────────────────────────────────────────────────────────── */

/* ---- Public service browsing ----
 *
 * v4.5.37 — port of the OLD app.vayil.in ServiceList handler.
 *
 * Pre-v4.5.37 this endpoint returned a list of category masters
 * (category_id, name, icon) — but the mobile Service_List_Model.dart
 * parses VENDOR SERVICE LISTINGS (id, vendor_id, service_title,
 * service_image, company_name, rating, etc.). The endpoint name is
 * misleading: it's actually "list of vendor offerings, filtered by
 * city / search / category", not "list of categories."
 *
 * Old SQL (Vayil-Backend-main 12 April src/Controllers/Customer.ts):
 *   SELECT vs.*, v.company_name,
 *          IFNULL((SELECT ROUND(AVG(cr.rating), 1) FROM customer_review cr
 *                   WHERE cr.vendor_id = v.id AND cr.status = 1), 0) AS rating,
 *          (SELECT COUNT(*) FROM customer_review cr
 *            WHERE cr.vendor_id = v.id AND cr.status = 1) AS review_count,
 *          sc.name AS category_name
 *   FROM vendor_services vs
 *   JOIN vendors v ON v.id = vs.vendor_id
 *   JOIN service_categories sc ON vs.service_category = sc.id
 *   WHERE vs.is_active = 1 AND v.accept_enquires = 1
 *     AND vs.is_deleted = 0 AND v.is_deleted = 0
 *     [+ AND v.city = :city_id   if `location` body param resolves to a city]
 *     [+ AND (vs.service_title LIKE :search OR v.company_name LIKE :search OR sc.name LIKE :search)]
 *     [+ AND vs.service_category = :category_id]
 *   ORDER BY vs.id DESC
 *
 * Response per item — match the OLD API exactly (22 fields):
 *   id, vendor_id, service_title, service_category, service_subcategory,
 *   description, pricing_type, unit_name, price, service_image,
 *   certificate_url, is_active, show_review, created_at, updated_at,
 *   minimum_fee, is_deleted, company_name, rating, review_count,
 *   booking_text, category_name
 *
 * booking_text is computed (`"<N> bookings"`); old API hardcoded it
 * from a separate COUNT(*) on orders — replicated here.
 */
legacyCustomerRouter.post('/ServiceList', async (req, res, next) => {
  try {
    const { location, search, category_id } = req.body ?? {};

    // Resolve city name → city_id (old API did this lookup)
    let cityId: number | null = null;
    if (location && typeof location === 'string' && location.trim()) {
      const cityRow = await one<any>(
        `SELECT city_id FROM city WHERE city_name = :name AND COALESCE(is_deleted, 0) = 0 LIMIT 1`,
        { name: location.trim() },
      ).catch(() => null);
      if (cityRow?.city_id) cityId = Number(cityRow.city_id);
    }

    // v4.5.38 — `is_active` may be NULL for listings created via the new
    // backend's vendorSvc.createListing which writes `status` instead.
    // Coalesce both so new + legacy listings both surface.
    const where: string[] = [
      `COALESCE(vs.is_active, vs.status, 0) = 1`,
      `COALESCE(vs.is_deleted, 0) = 0`,
      `COALESCE(v.is_deleted, 0) = 0`,
      `v.status IN ('verified', 'approved', 'active', 'kyc_approved')`,
      `COALESCE(v.accept_enquires, 1) = 1`,
    ];
    const params: Record<string, any> = {};

    if (cityId !== null) {
      where.push(`v.city = :city`);
      params.city = cityId;
    }
    if (search && typeof search === 'string' && search.trim()) {
      where.push(`(vs.service_title LIKE :q OR v.company_name LIKE :q OR sc.name LIKE :q)`);
      params.q = `%${search.trim()}%`;
    }
    if (category_id && String(category_id).trim()) {
      where.push(`(vs.service_category = :cat OR vs.category_id = :cat)`);
      params.cat = String(category_id);
    }

    // The new schema mirrors `id` on vendor_services and vendors via
    // migration 004 ADD COLUMN id; `service_category` is stored as the
    // category_id as a string for mobile compat.
    const sql = `
      SELECT
        COALESCE(vs.id, vs.vendor_service_id)              AS id,
        vs.vendor_id                                       AS vendor_id,
        COALESCE(vs.service_title, vs.title)               AS service_title,
        vs.service_category                                AS service_category,
        vs.service_subcategory                             AS service_subcategory,
        vs.description                                     AS description,
        vs.pricing_type                                    AS pricing_type,
        vs.unit_name                                       AS unit_name,
        vs.price                                           AS price,
        COALESCE(vs.service_image, vs.thumbnail)           AS service_image,
        vs.certificate_url                                 AS certificate_url,
        COALESCE(vs.is_active, vs.status, 1)               AS is_active,
        COALESCE(vs.show_review, 1)                        AS show_review,
        vs.created_at                                      AS created_at,
        vs.updated_at                                      AS updated_at,
        vs.minimum_fee                                     AS minimum_fee,
        COALESCE(vs.is_deleted, 0)                         AS is_deleted,
        v.company_name                                     AS company_name,
        IFNULL((SELECT ROUND(AVG(cr.rating), 1)
                  FROM customer_reviews cr
                 WHERE cr.vendor_id = v.vendor_id AND COALESCE(cr.status, 1) = 1), 0) AS rating,
        (SELECT COUNT(*)
           FROM customer_reviews cr
          WHERE cr.vendor_id = v.vendor_id AND COALESCE(cr.status, 1) = 1)            AS review_count,
        (SELECT COUNT(*) FROM orders o WHERE o.vendor_id = v.vendor_id)                AS booking_count,
        sc.name                                            AS category_name
      FROM vendor_services AS vs
      JOIN vendors          AS v  ON v.vendor_id = vs.vendor_id
      LEFT JOIN service_categories AS sc
             ON sc.category_id = CAST(COALESCE(vs.service_category, vs.category_id) AS UNSIGNED)
      WHERE ${where.join(' AND ')}
      ORDER BY COALESCE(vs.id, vs.vendor_service_id) DESC
    `;
    const rows = await query<any>(sql, params);

    // Compute booking_text exactly as the old API did
    let data = rows.map((r: any) => {
      const n = Number(r.booking_count ?? 0);
      const { booking_count, ...item } = r;
      return {
        ...item,
        service_image: imageUrlOrEmpty(item.service_image),
        rating: Number(r.rating ?? 0).toFixed(1),
        booking_text: `${n} ${n === 1 ? 'booking' : 'bookings'}`,
      };
    });

    // Temporary compatibility bridge for the mobile cutover: the TiDB
    // seed may not yet contain the same Coimbatore listings as app.vayil.in.
    if (!data.length) {
      data = await fetchLegacyCustomerServiceList(req.body) ?? data;
    }
    data = data.map((item: any) => ({
      ...item,
      service_image: imageUrlOrEmpty(item?.service_image),
    }));

    res.status(200).json({
      success: true,
      message: 'Service list fetched successfully',
      data,
    });
  } catch (err) { next(err); }
});

legacyCustomerRouter.post('/ServiceInfo', async (req, res, next) => {
  try {
    const legacy = await fetchLegacyCustomerJson('/ServiceInfo', req.body, req.headers.authorization);
    if (legacy?.success && legacy?.data) return res.status(200).json(legacy);

    const serviceId = pickId(req.body, 'service_id', 'serviceId', 'id');
    if (serviceId) {
      const data = await buildLocalServiceInfo(serviceId, pickId(req.body, 'customer_id', 'customerId'));
      if (!data) return res.status(200).json({ success: false, message: 'Service not found' });
      return res.status(200).json({
        success: true,
        message: 'Service details fetched successfully',
        data,
      });
    }

    const categoryId = pickId(req.body, 'category_id', 'categoryId');
    if (!categoryId) throw new ApiError(400, 'category_id required');
    const vendors = await customerSvc.listVendors({ category: categoryId });
    const subs = await query<any>(
      `SELECT * FROM service_subcategories WHERE category_id = :id AND status = true`,
      { id: categoryId },
    );
    send(res, { data: { vendors, subcategories: subs } });
  } catch (err) { next(err); }
});

legacyCustomerRouter.post('/vendorInfo', async (req, res, next) => {
  try {
    const legacy = await fetchLegacyCustomerJson('/vendorInfo', req.body, req.headers.authorization);
    if (legacy?.success && (legacy?.data || legacy?.category || legacy?.service || legacy?.review)) {
      return res.status(200).json(legacy);
    }

    const vendorId = pickId(req.body, 'vendor_id', 'vendorId', 'id');
    if (!vendorId) throw new ApiError(400, 'vendor_id required');
    const out: any = await customerSvc.getVendorWithListings(vendorId);
    // v4.5.35 — mobile bridge: customer's vendor-profile page reads
    // category, service, review at top level (NOT inside data).
    send(res, {
      data:     out,
      category: out?.categories ?? out?.category ?? [],
      service:  out?.services   ?? out?.listings ?? out?.service ?? [],
      review:   out?.reviews    ?? out?.review   ?? [],
    });
  } catch (err) { next(err); }
});

/* ---- Public catalogue lookups (aliases of vendor / common router) ---- */
const publicServiceCategoriesHandler = async (_req: any, res: any, next: any) => {
  try {
    const cats = await query<any>(
      `SELECT id, category_id, name, slug, icon, icon_url, COALESCE(is_active, status) AS is_active
         FROM service_categories
        WHERE COALESCE(is_deleted, 0) = 0
        ORDER BY name ASC`,
    );
    res.status(200).json({ success: true, categories: cats, data: cats });
  } catch (err) { next(err); }
};
legacyCustomerRouter.get('/ServiceCategories',  publicServiceCategoriesHandler);
legacyCustomerRouter.post('/ServiceCategories', publicServiceCategoriesHandler);

legacyCustomerRouter.post('/ServiceSubcategories', async (req, res, next) => {
  try {
    const cid = pickId(req.body, 'category_id', 'categoryId', 'id') || null;
    const rows = cid
      ? await query<any>(
          `SELECT id, subcategory_id, category_id, name, slug
             FROM service_subcategories
            WHERE category_id = :id AND COALESCE(is_deleted, 0) = 0`,
          { id: cid },
        )
      : await query<any>(
          `SELECT id, subcategory_id, category_id, name, slug
             FROM service_subcategories
            WHERE COALESCE(is_deleted, 0) = 0`,
        );
    res.status(200).json({ success: true, subcategories: rows });
  } catch (err) { next(err); }
});

/* ---- Public location pickers ---- */
const customerStatesHandler = async (req: any, res: any, next: any) => {
  try {
    const cid = Number((req.query as any)?.country_id ?? (req.body as any)?.country_id ?? 101);
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
    res.status(200).json({ success: true, states_list: rows, data: rows });
  } catch (err) { next(err); }
};
legacyCustomerRouter.get('/get_states_by_country_id', customerStatesHandler);
legacyCustomerRouter.post('/get_states_by_country_id', customerStatesHandler);

const customerCityHandler = async (req: any, res: any, next: any) => {
  try {
    const sid = (req.body as any)?.state_id ?? (req.body as any)?.city_state_id
      ?? (req.query as any)?.state_id ?? (req.query as any)?.city_state_id;
    const stateName = String((req.body as any)?.state_name || (req.body as any)?.city_state
      || (req.query as any)?.state_name || (req.query as any)?.city_state || '').trim();
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
    res.status(200).json({ success: true, city: rows, data: rows });
  } catch (err) { next(err); }
};
legacyCustomerRouter.post('/get_city', customerCityHandler);
legacyCustomerRouter.get('/get_city', customerCityHandler);

/* ---- Public settings — v4.5.34 ----
 *
 * ⚠️ SECURITY-SENSITIVE HANDLER — READ BEFORE EDITING ⚠️
 *
 * This endpoint INTENTIONALLY exposes `payment_secret`, `smtp_password`,
 * and `smtp_username` in the public, unauthenticated response. The v4.5.23
 * security audit had stripped these via `publicSettingsSafe()`; the user
 * (Praga) re-authorised re-exposure on 2026-06-17 to match the legacy
 * `app.vayil.in` Postman collection contract that the production mobile
 * builds depend on. See:
 *
 *   - RELEASE_NOTES.md v4.5.34 (this commit) — full decision record
 *   - memory/vayil-sensitive-fields.md       — updated policy
 *
 * The authorisation was: "Lets go with option 3 and full revert it and
 * have the exact same as the collection." — chat 2026-06-17, after the
 * risks were spelled out (Razorpay automated-scanner revocation, SMTP
 * reputation damage, permanent-leak-via-archives, no cyber-insurance
 * coverage). The user accepted the trade and asked to ship.
 *
 * If you are reverting this and putting publicSettingsSafe() back in
 * place, ALSO rotate the credentials immediately — they are considered
 * compromised the moment this endpoint went live (Vercel commit
 * timestamp). Steps:
 *   1. Generate new RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET in Razorpay
 *      dashboard; update Vercel env; redeploy.
 *   2. Generate new SMTP password; update Vercel env; coordinate with
 *      mail provider.
 *   3. Force-expire any cached `/customer/getSettings` response (Vercel
 *      edge cache, Cloudflare, etc).
 *
 * Dual-shape envelope kept (data + categories) from v4.5.31 so both old
 * and new clients parse the same payload.
 */
async function publicSettingsHandler(_req: any, res: any, next: any) {
  try {
    const row: Record<string, any> = (await one<any>('SELECT * FROM settings LIMIT 1')) || {};
    // Env fallbacks for fields that may be NULL in the freshly-seeded
    // TiDB row. DB column wins if set (`||` prefers truthy DB value).
    const razorpayPublicKey = row.payment_key    || process.env.RAZORPAY_KEY_ID     || null;
    const razorpaySecret    = row.payment_secret || process.env.RAZORPAY_KEY_SECRET || null;
    const smtpPwd           = row.smtp_password  || process.env.SMTP_PASSWORD       || null;
    const smtpUser          = row.smtp_username  || process.env.SMTP_USERNAME       || row.smtp_from_email || null;
    const enriched: Record<string, any> = {
      ...row,                                                // ⚠ raw row -- NOT denylisted (intentional, see header)
      payment_key:    razorpayPublicKey,                     // legacy alias
      razorpay_key:   razorpayPublicKey,                     // canonical name
      payment_secret: razorpaySecret,                        // ⚠ Razorpay merchant secret — exposed by design
      payment_name:   row.payment_name || 'Razorpay',
      smtp_username:  smtpUser,                              // ⚠ mail server username — exposed by design
      smtp_password:  smtpPwd,                               // ⚠ mail server password — exposed by design
      currency:       row.currency || 'INR',
    };
    send(res, {
      data: enriched,            // new envelope
      categories: [enriched],    // legacy mobile envelope (v4.5.31 bridge)
    });
  } catch (err) { next(err); }
}
legacyCustomerRouter.get('/getSettings', publicSettingsHandler);
legacyCustomerRouter.post('/getSettings', publicSettingsHandler);

/* ---- Public uploads (anonymous prefix; soft-auth tags the customer if a
 *      token was sent, otherwise stores under guest/<ip>). v4.5.26.
 *      NB: per-IP throttling lives in the global rate-limit middleware in
 *      index.ts; if abuse becomes a problem we add a dedicated limiter here.
 */
legacyCustomerRouter.post('/upload_files',
  softAuth(),
  upload.any(),
  async (req: AuthRequest, res, next) => {
    try {
      const { legacyUploadResponse, uploadFiles } = await import('../utils/uploads');
      const { validateProfileImage } = await import('../utils/imageValidation');
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (!files.length) throw new ApiError(400, 'no files in request');
      // v4.5.28 — when kind=profile, enforce the same caps as the web
      // ProfileImageUploader (JPG/PNG/WebP, <= 5 MB, 256..4096 px square-ish).
      // Throws ApiError(400, ...) with a human-readable message that the
      // mobile app can show verbatim.
      if (req.body?.kind === 'profile') files.forEach(validateProfileImage);
      const prefix = req.user?.id ? `customer-${req.user.id}` : `guest-${(req.ip || 'anon').replace(/[^a-z0-9]/gi, '')}`;
      const urls = await uploadFiles(files as any, { prefix });
      send(res, legacyUploadResponse(urls));
    } catch (err) { next(err); }
  },
);

/* ─────────────────────────────────────────────────────────────
 *  Authenticated customer endpoints from here down.
 * ───────────────────────────────────────────────────────────── */
legacyCustomerRouter.use(requireAuth(['customer']));

legacyCustomerRouter.post('/saveCustomerInfo', async (req: AuthRequest, res, next) => {
  try {
    await customerSvc.updateCustomer(req.user!.id, {
      name: req.body?.name, email: req.body?.email, city: req.body?.city,
      address: req.body?.address, pincode: req.body?.pincode,
      profile_image: req.body?.profile_image || req.body?.profile_photo,
      profile_photo: req.body?.profile_photo,
      fcm_token: req.body?.fcm_token,
    });
    res.status(200).json({
      success: true,
      message: 'Customer details saved',
      data: await legacyCustomerRowsById(req.user!.id),
    });
  } catch (err) { next(err); }
});

const handleGetCustomerInfo = async (req: AuthRequest, res: any, next: any) => {
  try {
    res.status(200).json({
      success: true,
      message: 'Customer details',
      data: await legacyCustomerRowsById(req.user!.id),
    });
  } catch (err) { next(err); }
};
legacyCustomerRouter.get('/getCustomerInfo', handleGetCustomerInfo);
legacyCustomerRouter.post('/getCustomerInfo', handleGetCustomerInfo);

/* ───── Service browsing endpoints moved to public block above (v4.5.26) ───── */

/* ───── Enquiries ───── */
legacyCustomerRouter.post('/sendEnquiry', async (req: AuthRequest, res, next) => {
  try {
    const enquiry = await enquirySvc.createEnquiry({
      customer_id: req.user!.id,
      vendor_id: pickId(req.body, 'vendor_id', 'vendorId') || null,
      service_id: pickId(req.body, 'service_id', 'serviceId') || null,
      category: req.body?.category || null,
      description: req.body?.description || req.body?.message || '',
      location: req.body?.location || null,
      email: req.body?.email || null,
      budget: req.body?.budget ? toNumberSafe(req.body.budget) : null,
      location_lat: req.body?.location_lat ? toNumberSafe(req.body.location_lat) : null,
      location_lng: req.body?.location_lng ? toNumberSafe(req.body.location_lng) : null,
      preferred_date: req.body?.preferred_date || null,
    });
    await exec(
      `UPDATE enquiries
          SET first_name = COALESCE(:firstName, first_name),
              last_name = COALESCE(:lastName, last_name),
              phone = COALESCE(:phone, phone),
              files = COALESCE(:files, files),
              message = COALESCE(:message, message),
              status_int = COALESCE(status_int, 1)
        WHERE enquiry_id = :id`,
      {
        id: enquiry?.enquiry_id,
        firstName: req.body?.first_name ?? null,
        lastName: req.body?.last_name ?? null,
        phone: req.body?.phone ?? null,
        files: req.body?.files ?? req.body?.file ?? null,
        message: req.body?.message ?? req.body?.description ?? null,
      },
    ).catch(() => undefined);
    res.status(200).json({ success: true, message: 'Enquiry sent to vendor' });
  } catch (err) { next(err); }
});

legacyCustomerRouter.post('/enquiryList', async (req: AuthRequest, res, next) => {
  try {
    res.status(200).json({ success: true, data: await legacyCustomerEnquiryRows(req.user!.id) });
  } catch (err) { next(err); }
});

legacyCustomerRouter.post('/enquiryDetails', async (req: AuthRequest, res, next) => {
  try {
    const enquiryId = pickId(req.body, 'enquiry_id', 'enquiryId', 'id');
    if (!enquiryId) throw new ApiError(400, 'enquiry_id required');
    res.status(200).json({ success: true, data: await legacyCustomerEnquiryRows(req.user!.id, enquiryId) });
  } catch (err) { next(err); }
});

/* ───── Quotes ───── */
legacyCustomerRouter.post('/QuotationList', async (req: AuthRequest, res, next) => {
  try {
    const enquiryId = pickId(req.body, 'enquiry_id', 'enquiryId');
    if (!enquiryId) throw new ApiError(400, 'enquiry_id required');
    // Ownership check via service helper.
    await enquirySvc.getEnquiryForCustomer(req.user!.id, enquiryId);
    const quotes = await quoteSvc.listQuotes(enquiryId);
    send(res, { data: quotes });
  } catch (err) { next(err); }
});

legacyCustomerRouter.post('/updateQuotation', async (req: AuthRequest, res, next) => {
  try {
    const quotationId = pickId(req.body, 'quotation_id', 'quotationId', 'id');
    if (!quotationId) throw new ApiError(400, 'quotation_id required');
    const action = String(req.body?.action || req.body?.status || '').toLowerCase();
    const out = action === 'reject' || action === 'rejected'
      ? await quoteSvc.rejectQuote(req.user!.id, quotationId, req.body?.reason || req.body?.message)
      : await quoteSvc.acceptQuote(req.user!.id, quotationId);
    send(res, { message: `Quote ${out.status}`, data: out });
  } catch (err) { next(err); }
});

/* ───── Payments — placeOrder + payment_update use canonical escrow ───── */
legacyCustomerRouter.post('/placeOrder', async (req: AuthRequest, res, next) => {
  try {
    const enquiryId = toNumberSafe(pickId(req.body, 'enquiry_id', 'enquiryId'));
    const orderId = toNumberSafe(pickId(req.body, 'order_id', 'orderId'));
    const milestoneId = toNumberSafe(pickId(req.body, 'milestone_id', 'milestoneId', 'plan_id'));
    const amount = toNumberSafe(req.body?.amount);
    if (!amount) throw new ApiError(400, 'amount required');
    const purpose = (req.body?.purpose
      || (milestoneId ? 'milestone' : enquiryId ? 'quote' : 'materials')) as paymentSvc.Purpose;
    const idempotency_key = String(
      req.body?.idempotency_key || req.headers['idempotency-key'] || `mob-${req.user!.id}-${Date.now()}`,
    );
    const out = await paymentSvc.createPaymentIntent({
      customerId: req.user!.id,
      amount,
      purpose,
      enquiry_id: enquiryId || undefined,
      order_id: orderId || undefined,
      milestone_id: milestoneId || undefined,
      material_ids: Array.isArray(req.body?.material_ids) ? req.body.material_ids.map(Number) : undefined,
      idempotency_key,
    });
    send(res, {
      message: 'Order created',
      data: out,
      razorpay_order_id: out.razorpay_order_id,
      intent_id: out.intent_id,
      amount: out.amount,
    }, 201);
  } catch (err) { next(err); }
});

legacyCustomerRouter.post('/payment_update', async (req: AuthRequest, res, next) => {
  try {
    const rzOrder = String(req.body?.razorpay_order_id || req.body?.order_id || '');
    const rzPayment = String(req.body?.razorpay_payment_id || req.body?.payment_id || '');
    const rzSig = String(req.body?.razorpay_signature || req.body?.signature || '');
    if (!rzOrder || !rzPayment || !rzSig) {
      throw new ApiError(400, 'razorpay_order_id, razorpay_payment_id, razorpay_signature required');
    }
    const out = await paymentSvc.verifyAndHold({
      customerId: req.user!.id,
      razorpay_order_id: rzOrder,
      razorpay_payment_id: rzPayment,
      razorpay_signature: rzSig,
    });
    send(res, { message: 'Payment verified', data: out });
  } catch (err) { next(err); }
});

legacyCustomerRouter.post('/orderDetails', async (req: AuthRequest, res, next) => {
  try {
    const orderId = pickId(req.body, 'order_id', 'orderId', 'id');
    if (!orderId) throw new ApiError(400, 'order_id required');
    await projectSvc.assertOrderBelongsToCustomer(orderId, req.user!.id);
    const out: any = await projectSvc.getProject(orderId);
    // v4.5.35 — mobile bridge (same as vendorOrderDetails):
    // workflow timeline reads `steps`, header reads `ordersMain`, plan reads `order_plan`.
    const project = out?.project ?? {};
    const plan    = out?.plan    ?? [];
    send(res, {
      data:       out,
      steps:      plan,
      ordersMain: project,
      order_plan: plan,
    });
  } catch (err) { next(err); }
});

legacyCustomerRouter.post('/getPaymentDetails', async (req: AuthRequest, res, next) => {
  try {
    const orderId = pickId(req.body, 'order_id', 'orderId');
    if (!orderId) throw new ApiError(400, 'order_id required');
    const out: any = await paymentSvc.getOrderPaymentSummary(req.user!.id, orderId);
    // v4.5.35 — mobile bridge (mirrors vendorPaymentSummary):
    // Customer_Payment_Details_Model reads the same 9 top-level keys.
    const intents: any[] = out?.intents ?? [];
    const servicePayment  = intents.filter((i) => (i.purpose ?? i.type ?? '').toLowerCase().includes('service') || !i.purpose);
    const materialPayment = intents.filter((i) => (i.purpose ?? i.type ?? '').toLowerCase().includes('material'));
    const totalMaterialAmount = materialPayment.reduce((s, i) => s + Number(i.amount), 0);
    const totalPlanAmount     = servicePayment.reduce((s, i) => s + Number(i.amount), 0);
    // v4.5.36 — see legacyVendor.ts vendorPaymentSummary for URL rationale.
    const invoiceBase = process.env.INVOICE_URL_BASE || 'https://app.vayil.in/admin/invoice/';
    send(res, {
      data:                out,
      TotalAmount:         Number(out?.total ?? 0).toFixed(2),
      TotalPaidAmount:     Number(out?.paid ?? 0).toFixed(2),
      TotalMaterialAmount: totalMaterialAmount.toFixed(2),
      TotalPlanAmount:     totalPlanAmount.toFixed(2),
      servicePayment,
      materialPayment,
      invoice_url:         invoiceBase,
      https:               invoiceBase.startsWith('https'),
    });
  } catch (err) { next(err); }
});

legacyCustomerRouter.post('/NeedPaymentSummary', async (req: AuthRequest, res, next) => {
  try {
    const orderId = pickId(req.body, 'order_id', 'orderId');
    if (!orderId) throw new ApiError(400, 'order_id required');
    await projectSvc.assertOrderBelongsToCustomer(orderId, req.user!.id);
    const [plan, materials] = await Promise.all([
      query<any>(`SELECT * FROM order_plan WHERE order_id = :id ORDER BY plan_id ASC`, { id: orderId }).catch(() => []),
      query<any>(`SELECT * FROM order_plan_materials WHERE order_id = :id ORDER BY id ASC`, { id: orderId })
        .catch(() => query<any>(`SELECT * FROM materials WHERE order_id = :id ORDER BY material_id ASC`, { id: orderId }).catch(() => [])),
    ]);
    const planTotal = plan.reduce((sum: number, row: any) => sum + Number(row.amount ?? 0), 0);
    const planBalance = plan.reduce((sum: number, row: any) => sum + Number(row.balance_cost ?? row.balance ?? 0), 0);
    const materialsTotal = materials.reduce((sum: number, row: any) => sum + Number(row.total_cost ?? row.total ?? 0), 0);
    const materialsBalance = materials.reduce((sum: number, row: any) => sum + Number(row.balance_cost ?? row.balance ?? 0), 0);
    res.status(200).json({
      success: true,
      plan,
      planoverall: [{ total_amount: planTotal.toFixed(2), total_balance_cost: planBalance.toFixed(2) }],
      materials,
      materialsoverall: [{ total_cost_amount: materialsTotal.toFixed(2), total_balance_cost: materialsBalance.toFixed(2) }],
    });
  } catch (err) { next(err); }
});

legacyCustomerRouter.post('/finalStep', async (req: AuthRequest, res, next) => {
  try {
    const orderId = pickId(req.body, 'order_id', 'orderId');
    if (!orderId) throw new ApiError(400, 'order_id required');
    const out = await projectSvc.signoffOrder(
      orderId, req.user!.id,
      req.body?.rating ? toNumberSafe(req.body.rating) : undefined,
      req.body?.comment || undefined,
    );
    // Release any held escrow.
    const intents = await query<any>(
      `SELECT intent_id FROM payment_intents WHERE order_id = :id AND status = 'escrow_held'`,
      { id: orderId },
    );
    for (const i of intents) await paymentSvc.releaseEscrow(i.intent_id);
    send(res, { message: 'Order completed', data: out });
  } catch (err) { next(err); }
});

/* ───── Reviews ───── */
legacyCustomerRouter.post('/addReview', async (req: AuthRequest, res, next) => {
  try {
    const review = await reviewSvc.addReview({
      customer_id: req.user!.id,
      vendor_id: pickId(req.body, 'vendor_id', 'vendorId'),
      order_id: pickId(req.body, 'order_id', 'orderId') || undefined,
      rating: toNumberSafe(req.body?.rating),
      title: req.body?.title,
      comment: req.body?.comment || req.body?.review || req.body?.feedback,
    });
    send(res, { message: 'Review submitted', data: review }, 201);
  } catch (err) { next(err); }
});

/* ───── Notifications ───── */
legacyCustomerRouter.post('/customerNotificationList', async (req: AuthRequest, res, next) => {
  try {
    const data = await notifSvc.list('customer', req.user!.id);
    send(res, { data });
  } catch (err) { next(err); }
});

/* ───── Cart ───── */
legacyCustomerRouter.post('/addToCart', async (req: AuthRequest, res, next) => {
  try {
    const out = await customerSvc.addToCart(req.user!.id, {
      vendor_id: pickId(req.body, 'vendor_id', 'vendorId') || undefined,
      service_id: pickId(req.body, 'service_id', 'serviceId') || undefined,
      quantity: req.body?.quantity ? toNumberSafe(req.body.quantity) : 1,
      price: req.body?.price ? toNumberSafe(req.body.price) : 0,
      service_title: req.body?.service_title || req.body?.title,
      metadata: req.body?.metadata,
    });
    send(res, { message: 'Added to cart', data: out }, 201);
  } catch (err) { next(err); }
});

legacyCustomerRouter.post('/getCart', async (req: AuthRequest, res, next) => {
  try {
    const data = await customerSvc.getCart(req.user!.id);
    send(res, { data });
  } catch (err) { next(err); }
});

legacyCustomerRouter.post('/removeCartItem', async (req: AuthRequest, res, next) => {
  try {
    const cartId = pickId(req.body, 'cart_id', 'cartId', 'id');
    if (!cartId) throw new ApiError(400, 'cart_id required');
    const out = await customerSvc.removeCartItem(req.user!.id, cartId);
    send(res, { message: 'Removed', data: out });
  } catch (err) { next(err); }
});

legacyCustomerRouter.post('/clearCart', async (req: AuthRequest, res, next) => {
  try {
    const out = await customerSvc.clearCart(req.user!.id);
    send(res, { message: 'Cart cleared', data: out });
  } catch (err) { next(err); }
});

/* ───── File upload ─────
 *  Mobile posts multipart with one or more files in field "file" /
 *  "files". We store filenames in-memory + return URLs the client can
 *  POST back as `profile_image` / `kyc_document_url` / etc. The actual
 *  storage adapter is plugged via utils/uploads in production; for now
 *  we return a data URL so the upload contract works locally.
 */
/* upload_files + getSettings moved to public block above (v4.5.26) */

/* Soft-auth-only utility — lets the app warm up without a token. */
legacyCustomerRouter.get('/_ping', softAuth(), (_req, res) => res.json({ ok: true, t: Date.now() }));

/* ─────────────────────────────────────────────────────────────
 *  v4.5.2 — close out Option A gaps: 5 missing customer endpoints
 *  the Postman collection (Vayil.json) expects but our v4.5 didn't
 *  mount.
 * ───────────────────────────────────────────────────────────── */

/* ServiceCategories / ServiceSubcategories moved to public block above (v4.5.26) */

/** POST /customer/sendQuotation — customer accepts/rejects vendor's quote.
 *  Mobile collection calls this the "Update Quote" action; semantically
 *  identical to our existing /customer/updateQuotation alias. */
legacyCustomerRouter.post('/sendQuotation', async (req: AuthRequest, res, next) => {
  try {
    const quotationId = pickId(req.body, 'quotation_id', 'quotationId', 'id');
    if (!quotationId) throw new ApiError(400, 'quotation_id required');
    const action = String(req.body?.action || req.body?.status || 'accept').toLowerCase();
    const out = (action === 'reject' || action === 'rejected')
      ? await quoteSvc.rejectQuote(req.user!.id, quotationId, req.body?.reason || req.body?.message)
      : await quoteSvc.acceptQuote(req.user!.id, quotationId);
    send(res, { message: `Quote ${out.status}`, data: out });
  } catch (err) { next(err); }
});

/** POST /customer/getPlan — customer reads project plan by order_id. */
legacyCustomerRouter.post('/getPlan', async (req: AuthRequest, res, next) => {
  try {
    const orderId = pickId(req.body, 'order_id', 'orderId', 'id');
    if (!orderId) throw new ApiError(400, 'order_id required');
    await projectSvc.assertOrderBelongsToCustomer(orderId, req.user!.id);
    const out: any = await projectSvc.getProject(orderId);
    // v4.5.35 — mobile bridge: Customer_Get_Plan_Model reads
    // steps, ordermaterials, ordersMain, review at top level.
    const project = out?.project ?? {};
    const plan    = out?.plan    ?? [];
    const materials = await query<any>(
      `SELECT * FROM order_materials WHERE order_id = :id ORDER BY material_id ASC`,
      { id: orderId },
    ).catch(() => []);
    const reviews = await query<any>(
      `SELECT * FROM customer_reviews WHERE order_id = :id ORDER BY review_id ASC`,
      { id: orderId },
    ).catch(() => []);
    send(res, {
      data:           out,
      steps:          plan,
      ordermaterials: materials,
      ordersMain:     project,
      review:         reviews,
    });
  } catch (err) { next(err); }
});

/** POST /customer/CustomerupdatePlan — customer requests plan changes /
 *  approves the submitted plan. action='approve'|'revision'. */
legacyCustomerRouter.post('/CustomerupdatePlan', async (req: AuthRequest, res, next) => {
  try {
    let orderId = pickId(req.body, 'order_id', 'orderId', 'id');
    if (!orderId && (req.body?.plan_id || Array.isArray(req.body?.plans))) {
      const planId = pickId(req.body, 'plan_id') || (Array.isArray(req.body?.plans) ? pickId(req.body.plans[0], 'plan_id', 'id') : '');
      if (planId) {
        const row = await one<any>(`SELECT order_id FROM order_plan WHERE plan_id = :id OR id = :id LIMIT 1`, { id: planId }).catch(() => null);
        if (row?.order_id) orderId = String(row.order_id);
      }
    }
    if (!orderId) throw new ApiError(400, 'order_id required');
    await projectSvc.assertOrderBelongsToCustomer(orderId, req.user!.id);
    const action = String(req.body?.action || 'approve').toLowerCase();
    const out = (action === 'reject' || action === 'revision' || action === 'request_revision')
      ? await projectSvc.setPlanStatusByCustomer(orderId, 'reject', req.body?.reason)
      : await projectSvc.setPlanStatusByCustomer(orderId, 'approve');
    send(res, { message: `Plan ${out.status}`, data: out });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────────────────────
 *  v4.5.35 — Phase 2 missing customer endpoints from old backend.
 * ───────────────────────────────────────────────────────────── */

/** POST /customer/listReviews — customer browses reviews for a vendor.
 *  Body: { vendor_id }. Public-style (vendor_id from body, not token)
 *  but kept under customer auth since the screen lives inside login. */
legacyCustomerRouter.post('/listReviews', async (req: AuthRequest, res, next) => {
  try {
    const vendorId = pickId(req.body, 'vendor_id', 'vendorId', 'id');
    if (!vendorId) throw new ApiError(400, 'vendor_id required');
    const data = await reviewSvc.listVendorReviews(vendorId);
    send(res, { data });
  } catch (err) { next(err); }
});
