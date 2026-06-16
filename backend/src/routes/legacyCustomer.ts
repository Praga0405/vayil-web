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
/** Send a legacy mobile success response. Mobile parses `success`, `message`,
 *  `data`, `result`, and `token` — include whichever apply. */
function send(res: any, payload: { message?: string; data?: any; result?: any; token?: string; [k: string]: any } = {}, status = 200) {
  return res.status(status).json({ success: true, message: payload.message ?? 'Success', ...payload });
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
    const otp = String(req.body?.otp || req.body?.otpcode || '');
    const out = await authService.verifyOtpAndIssueToken({
      phone, otp, userType: 'customer', name: req.body?.name,
    });
    send(res, {
      message: 'OTP verified',
      data: out.user,
      token: out.token,
      customer_id: out.user?.customer_id,
    });
  } catch (err) { next(err); }
});

legacyCustomerRouter.post('/logincustomerWithOTP', async (req, res, next) => {
  try {
    const phone = pickPhone(req.body);
    const out = await authService.requestOtp(phone, 'customer');
    send(res, { message: 'Login OTP sent', data: out });
  } catch (err) { next(err); }
});

legacyCustomerRouter.post('/verifyLogincustomerOTP', async (req, res, next) => {
  try {
    const phone = pickPhone(req.body);
    const otp = String(req.body?.otp || '');
    const out = await authService.verifyOtpAndIssueToken({ phone, otp, userType: 'customer' });
    send(res, {
      message: 'Login successful', data: out.user, token: out.token,
      customer_id: out.user?.customer_id,
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

/* ---- Public service browsing ---- */
legacyCustomerRouter.post('/ServiceList', async (_req, res, next) => {
  try {
    const cats = await query<any>(
      `SELECT category_id, name, icon FROM service_categories WHERE status = true ORDER BY category_id ASC`
    );
    send(res, { data: cats });
  } catch (err) { next(err); }
});

legacyCustomerRouter.post('/ServiceInfo', async (req, res, next) => {
  try {
    const categoryId = pickId(req.body, 'category_id', 'categoryId', 'id');
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
    const vendorId = pickId(req.body, 'vendor_id', 'vendorId', 'id');
    if (!vendorId) throw new ApiError(400, 'vendor_id required');
    const out = await customerSvc.getVendorWithListings(vendorId);
    send(res, { data: out });
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
    send(res, { data: cats });
  } catch (err) { next(err); }
};
legacyCustomerRouter.get('/ServiceCategories',  publicServiceCategoriesHandler);
legacyCustomerRouter.post('/ServiceCategories', publicServiceCategoriesHandler);

legacyCustomerRouter.post('/ServiceSubcategories', async (req, res, next) => {
  try {
    const cid = pickId(req.body, 'category_id', 'categoryId') || null;
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
    send(res, { data: rows });
  } catch (err) { next(err); }
});

/* ---- Public location pickers ---- */
legacyCustomerRouter.get('/get_states_by_country_id', async (req, res, next) => {
  try {
    const cid = Number((req.query as any)?.country_id ?? 101);
    const rows = await query<any>(
      `SELECT id, name, country_id, country_code, state_code FROM states
        WHERE country_id = :cid AND COALESCE(is_deleted,0)=0 AND status=1 ORDER BY name`,
      { cid } as any,
    );
    send(res, { data: rows });
  } catch (err) { next(err); }
});

legacyCustomerRouter.post('/get_city', async (req, res, next) => {
  try {
    const sid = (req.body as any)?.state_id ?? (req.body as any)?.city_state_id;
    const rows = sid
      ? await query<any>(
          `SELECT city_id, city_name, city_state, city_state_id FROM city
            WHERE city_state_id = :sid AND COALESCE(is_deleted,0)=0 AND status=1 ORDER BY city_name`,
          { sid },
        )
      : await query<any>(
          `SELECT city_id, city_name, city_state, city_state_id FROM city
            WHERE COALESCE(is_deleted,0)=0 AND status=1 ORDER BY city_name`,
        );
    send(res, { data: rows });
  } catch (err) { next(err); }
});

/* ---- Public settings (deny-listed via publicSettingsSafe) ----
 *
 * v4.5.31 — dual-shape compatibility bridge.
 *
 * The OLD app.vayil.in stack returned `{ success, categories: [row] }`
 * with secrets exposed. The NEW stack returned `{ success, message, data }`
 * with secrets stripped (v4.5.23). That envelope change broke the
 * existing mobile build, which reads `categories[0].payment_key` etc.
 *
 * This handler now emits BOTH shapes in a single response:
 *   - `data: row`           — canonical envelope used by /settings,
 *                             new mobile builds, the web client
 *   - `categories: [row]`   — back-compat for the unmigrated mobile
 *                             app's existing JSON model
 *
 * Both arrays/objects point at the same `enriched` payload, so a value
 * read via either path always agrees. Secrets stay stripped in both
 * (publicSettingsSafe runs before the row is reused).
 *
 * The mobile team can keep its existing decoder for now and migrate to
 * the canonical shape at their own pace. Eventually we can drop the
 * `categories` mirror — but only after they confirm every shipped build
 * has been updated. Don't add a deprecation timer here; coordinate
 * before removing.
 */
async function publicSettingsHandler(_req: any, res: any, next: any) {
  try {
    const row = await one<any>('SELECT * FROM settings LIMIT 1');
    const safe = publicSettingsSafe(row);
    // v4.5.32 — fill in legacy field aliases from env so the mobile app
    // gets a non-null value at the old field names even though the new
    // TiDB Cloud `settings` row has them as NULL (the old MySQL DB at
    // app.vayil.in had years of admin-populated values; the freshly
    // seeded prod DB doesn't, yet).
    //
    // Without this, the mobile build reads `categories[0].payment_key`
    // and gets null -> Razorpay checkout init fails -> "payment broken".
    // The values come from the same env vars the backend already trusts
    // (RAZORPAY_KEY_ID is the *public* key — never the secret).
    //
    // Once the production settings row is populated via admin, the DB
    // values win automatically (the `||` chain prefers a truthy DB
    // value over the env fallback).
    const razorpayPublicKey = (safe as any).payment_key || process.env.RAZORPAY_KEY_ID || null;
    const enriched = {
      ...safe,
      payment_key:  razorpayPublicKey,                     // legacy alias
      razorpay_key: razorpayPublicKey,                     // canonical name
      payment_name: (safe as any).payment_name || 'Razorpay',
      currency:     (safe as any).currency || 'INR',
    };
    send(res, {
      data: enriched,            // new shape
      categories: [enriched],    // legacy mobile shape (v4.5.31 bridge)
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
      const { uploadFiles } = await import('../utils/uploads');
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
      send(res, { message: 'Uploaded', data: urls, urls });
    } catch (err) { next(err); }
  },
);

/* ─────────────────────────────────────────────────────────────
 *  Authenticated customer endpoints from here down.
 * ───────────────────────────────────────────────────────────── */
legacyCustomerRouter.use(requireAuth(['customer']));

legacyCustomerRouter.post('/saveCustomerInfo', async (req: AuthRequest, res, next) => {
  try {
    const customer = await customerSvc.updateCustomer(req.user!.id, {
      name: req.body?.name, email: req.body?.email, city: req.body?.city,
      address: req.body?.address, pincode: req.body?.pincode,
      profile_image: req.body?.profile_image, fcm_token: req.body?.fcm_token,
    });
    send(res, { message: 'Profile updated', data: customer });
  } catch (err) { next(err); }
});

const handleGetCustomerInfo = async (req: AuthRequest, res: any, next: any) => {
  try {
    const customer = await customerSvc.getCustomer(req.user!.id);
    send(res, { data: customer, customer_id: customer.customer_id });
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
    send(res, { message: 'Enquiry sent', data: enquiry, enquiry_id: enquiry?.enquiry_id }, 201);
  } catch (err) { next(err); }
});

legacyCustomerRouter.post('/enquiryList', async (req: AuthRequest, res, next) => {
  try {
    const enquiries = await enquirySvc.listCustomerEnquiries(req.user!.id);
    send(res, { data: enquiries });
  } catch (err) { next(err); }
});

legacyCustomerRouter.post('/enquiryDetails', async (req: AuthRequest, res, next) => {
  try {
    const enquiryId = pickId(req.body, 'enquiry_id', 'enquiryId', 'id');
    if (!enquiryId) throw new ApiError(400, 'enquiry_id required');
    const out = await enquirySvc.getEnquiryForCustomer(req.user!.id, enquiryId);
    send(res, { data: out });
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
    const out = await projectSvc.getProject(orderId);
    send(res, { data: out });
  } catch (err) { next(err); }
});

legacyCustomerRouter.post('/getPaymentDetails', async (req: AuthRequest, res, next) => {
  try {
    const orderId = pickId(req.body, 'order_id', 'orderId');
    if (!orderId) throw new ApiError(400, 'order_id required');
    const out = await paymentSvc.getOrderPaymentSummary(req.user!.id, orderId);
    send(res, { data: out });
  } catch (err) { next(err); }
});

legacyCustomerRouter.post('/NeedPaymentSummary', async (req: AuthRequest, res, next) => {
  try {
    const orderId = pickId(req.body, 'order_id', 'orderId');
    if (!orderId) throw new ApiError(400, 'order_id required');
    const out = await paymentSvc.getOrderPaymentSummary(req.user!.id, orderId);
    send(res, { data: { ...out, needed: out.remaining } });
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
    const out = await projectSvc.getProject(orderId);
    send(res, { data: out });
  } catch (err) { next(err); }
});

/** POST /customer/CustomerupdatePlan — customer requests plan changes /
 *  approves the submitted plan. action='approve'|'revision'. */
legacyCustomerRouter.post('/CustomerupdatePlan', async (req: AuthRequest, res, next) => {
  try {
    const orderId = pickId(req.body, 'order_id', 'orderId', 'id');
    if (!orderId) throw new ApiError(400, 'order_id required');
    await projectSvc.assertOrderBelongsToCustomer(orderId, req.user!.id);
    const action = String(req.body?.action || 'approve').toLowerCase();
    const out = (action === 'reject' || action === 'revision' || action === 'request_revision')
      ? await projectSvc.setPlanStatusByCustomer(orderId, 'reject', req.body?.reason)
      : await projectSvc.setPlanStatusByCustomer(orderId, 'approve');
    send(res, { message: `Plan ${out.status}`, data: out });
  } catch (err) { next(err); }
});
