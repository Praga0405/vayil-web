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
import { one, query } from '../db';

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
legacyVendorRouter.post('/vendorEnuqiryList', async (req: AuthRequest, res, next) => {
  try {
    const data = await enquirySvc.listVendorEnquiries(req.user!.id);
    send(res, { data });
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
    send(res, { message: 'Plan created', data }, 201);
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
    send(res, { data });
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
    send(res, { data });
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
    // For vendor view we want intent rollup.
    const intents = await query<any>(
      `SELECT * FROM payment_intents WHERE order_id = :id ORDER BY intent_id DESC`,
      { id: orderId },
    );
    const held = intents.filter((i: any) => i.status === 'escrow_held').reduce((s: number, i: any) => s + Number(i.amount), 0);
    const released = intents.filter((i: any) => i.status === 'released').reduce((s: number, i: any) => s + Number(i.amount), 0);
    send(res, { data: { intents, held, released } });
  } catch (err) { next(err); }
});

/* ───── Wallet / earnings ───── */
legacyVendorRouter.post('/vendorBalance', async (req: AuthRequest, res, next) => {
  try {
    const wallet = await vendorSvc.getVendorWallet(req.user!.id);
    send(res, { data: wallet, balance: Number(wallet?.balance ?? 0) });
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
    const data = await payoutSvc.getVendorTransactions(req.user!.id);
    send(res, { data });
  } catch (err) { next(err); }
});

legacyVendorRouter.post('/vendorTransHistoryCurMon', async (req: AuthRequest, res, next) => {
  try {
    const data = await payoutSvc.getVendorTransactions(req.user!.id, { currentMonth: true });
    send(res, { data });
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

legacyVendorRouter.post('/vendorlistReviews', async (req: AuthRequest, res, next) => {
  try {
    const data = await reviewSvc.listVendorReviews(req.user!.id);
    send(res, { data });
  } catch (err) { next(err); }
});

/* ───── Settings (vendor view) ───── */
async function vendorSettingsHandler(_req: any, res: any, next: any) {
  try {
    const row = await one<any>('SELECT * FROM settings LIMIT 1');
    send(res, {
      data: {
        ...row,
        razorpay_key: process.env.RAZORPAY_KEY_ID || null,
        currency: 'INR',
      },
    });
  } catch (err) { next(err); }
}
legacyVendorRouter.get('/vendorGetSettings', vendorSettingsHandler);
legacyVendorRouter.post('/vendorGetSettings', vendorSettingsHandler);

/* ───── Upload ───── */
legacyVendorRouter.post('/upload_files',
  upload.any(),
  async (req: AuthRequest, res, next) => {
    try {
      const { uploadFiles } = await import('../utils/uploads');
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      const urls = await uploadFiles(files as any, { prefix: `vendor-${req.user!.id}` });
      send(res, { message: 'Uploaded', data: urls, urls });
    } catch (err) { next(err); }
  },
);
