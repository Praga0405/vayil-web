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
import { requireApprovedVendor, requireAuth } from '../middleware/auth';
import { AuthRequest } from '../types';
import { exec, one, query } from '../db';
import { publicSettingsSafe } from './common';
import { uniqueCityRows } from '../utils/city';

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
function pickNullable(b: any, ...keys: string[]): string | null {
  const value = pickId(b, ...keys);
  return value || null;
}
function pickCsv(b: any, ...keys: string[]): string | null {
  for (const k of keys) {
    const value = b?.[k];
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean).join(',');
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.map((v) => String(v).trim()).filter(Boolean).join(',');
      } catch { /* plain CSV */ }
      return trimmed;
    }
    return String(value);
  }
  return null;
}
function num(v: any, fb = 0): number {
  if (v === undefined || v === null || v === '') return fb;
  const n = Number(v); return Number.isFinite(n) ? n : fb;
}
function optionalNum(v: any): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
function numberListFromBody(b: any, ...keys: string[]): number[] | undefined {
  const value = pickCsv(b, ...keys);
  if (!value) return undefined;
  const ids = value.split(',').map((v) => Number(v.trim())).filter((v) => Number.isFinite(v));
  return ids.length ? ids : undefined;
}
function mobileFlag(v: any): number | null {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'y' ? 1 : 0;
}
function activeFlag(v: any): boolean | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  return v === '1' || v === 1 || v === true || v === 'true';
}
async function defaultBankHolder(vendorId: number | string) {
  const row = await one<any>(
    `SELECT COALESCE(NULLIF(full_name, ''), NULLIF(owner_name, ''), NULLIF(name, ''),
                     NULLIF(company_name, ''), 'Vendor') AS holder
       FROM vendors WHERE vendor_id = :id LIMIT 1`,
    { id: vendorId },
  ).catch(() => null);
  return row?.holder || 'Vendor';
}
function send(res: any, payload: any = {}, status = 200) {
  return res.status(status).json({ success: true, message: payload.message ?? 'Success', ...payload });
}

async function legacyVendorRowsById(vendorId: number | string) {
  return query<any>(
    `SELECT COALESCE(id, vendor_id) AS id, name, COALESCE(ph_code, '+91') AS ph_code,
            COALESCE(phone, mobile) AS phone, email, company_name,
            COALESCE(full_name, owner_name, name) AS full_name, state, city, pincode, address,
            COALESCE(profile_photo, profile_image) AS profile_photo,
            service_tag, service_category, sub_service,
            COALESCE(years_of_experience, experience_years) AS years_of_experience,
            COALESCE(short_bio, about) AS short_bio, languages, area_of_service,
            working_hours_from, working_hours_to, COALESCE(willing_to_travel, 0) AS willing_to_travel,
            tools_available, certifications, status, kyc_id_type, kyc_id_number,
            COALESCE(kyc_id_image, kyc_document_url) AS kyc_id_image, kyc_selfie,
            COALESCE(kyc_status, status) AS kyc_status, kyc_submitted_at, kyc_verified_at,
            COALESCE(device_id, '') AS device_id, otp, otp_expires_at, otp_attempts,
            last_otp_sent_at, COALESCE(accept_enquires, 1) AS accept_enquires,
            created_at, updated_at, COALESCE(terms_accept, 1) AS terms_accept,
            COALESCE(is_deleted, 0) AS is_deleted
       FROM vendors
      WHERE vendor_id = :id OR id = :id
      LIMIT 1`,
    { id: vendorId },
  );
}

async function legacyVendorIdByPhone(phone: string) {
  const row = await one<any>(
    `SELECT COALESCE(id, vendor_id) AS id
       FROM vendors
      WHERE phone = :phone OR mobile = :phone
      ORDER BY COALESCE(is_deleted, 0) ASC,
        CASE
          WHEN status IN ('verified', 'approved', 'active') THEN 0
          WHEN status IN ('pending', 'pending_approval') THEN 1
          ELSE 2
        END ASC,
        COALESCE(id, vendor_id) ASC
      LIMIT 1`,
    { phone },
  ).catch(() => null);
  return row?.id ?? null;
}

function legacyVendorServiceSelect(includeAggregates: boolean) {
  return `
    SELECT
      COALESCE(vs.id, vs.vendor_service_id) AS id,
      vs.vendor_id,
      COALESCE(vs.service_title, vs.title) AS service_title,
      COALESCE(vs.service_category, vs.category_id) AS service_category,
      COALESCE(vs.service_subcategory, vs.subcategory_id) AS service_subcategory,
      vs.description,
      vs.pricing_type,
      COALESCE(vs.unit_name, vs.unit) AS unit_name,
      vs.price,
      COALESCE(vs.service_image, vs.thumbnail) AS service_image,
      vs.certificate_url,
      COALESCE(vs.is_active, vs.status, 1) AS is_active,
      COALESCE(vs.show_review, 1) AS show_review,
      vs.created_at,
      vs.updated_at,
      vs.minimum_fee,
      COALESCE(vs.is_deleted, 0) AS is_deleted
      ${includeAggregates ? `,
      v.company_name,
      IFNULL((SELECT ROUND(AVG(cr.rating), 1)
                FROM customer_reviews cr
               WHERE cr.vendor_id = v.vendor_id AND COALESCE(cr.status, 1) = 1), 0) AS rating,
      (SELECT COUNT(*)
         FROM customer_reviews cr
        WHERE cr.vendor_id = v.vendor_id AND COALESCE(cr.status, 1) = 1) AS review_count` : ''}
    FROM vendor_services vs
    ${includeAggregates ? 'LEFT JOIN vendors v ON v.vendor_id = vs.vendor_id' : ''}
  `;
}

function normalizeVendorServiceRow(row: any, includeAggregates = false) {
  const out: any = { ...row };
  if (includeAggregates) out.rating = Number(row?.rating ?? 0).toFixed(1);
  return out;
}

async function legacyVendorServiceRows(vendorId: number | string, serviceId?: string, includeAggregates = false) {
  const where = serviceId
    ? `vs.vendor_id = :vendorId AND (vs.vendor_service_id = :serviceId OR vs.id = :serviceId)`
    : `vs.vendor_id = :vendorId`;
  const rows = await query<any>(
    `${legacyVendorServiceSelect(includeAggregates)}
      WHERE ${where} AND COALESCE(vs.is_deleted, 0) = 0
      ORDER BY COALESCE(vs.id, vs.vendor_service_id) DESC`,
    { vendorId, serviceId },
  );
  return rows.map((row) => normalizeVendorServiceRow(row, includeAggregates));
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

function intOrNull(value: any): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function intOrDefault(value: any, fallback = 1): number {
  return intOrNull(value) ?? fallback;
}

function numberOrNull(value: any): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function decimalString(value: any, fallback = '0.00'): string {
  if (value === undefined || value === null || value === '') return fallback;
  const text = String(value).trim();
  if (!text || text.toLowerCase() === 'null' || text.toLowerCase() === 'undefined') return fallback;
  const n = Number(text);
  return Number.isFinite(n) ? n.toFixed(2) : fallback;
}

function integerString(value: any, fallback = '0'): string {
  if (value === undefined || value === null || value === '') return fallback;
  const text = String(value).trim();
  if (!text || text.toLowerCase() === 'null' || text.toLowerCase() === 'undefined') return fallback;
  const n = Number(text);
  return Number.isFinite(n) ? String(Math.trunc(n)) : fallback;
}

function stringOrNull(value: any): string | null {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value);
  return text;
}

function stringOrEmpty(value: any): string {
  if (value === undefined || value === null) return '';
  return String(value);
}

function deriveServiceTime(...values: any[]): string | null {
  for (const value of values) {
    if (value === undefined || value === null || value === '') continue;
    const text = String(value).trim();
    if (!text || text.toLowerCase() === 'null' || text.toLowerCase() === 'undefined') continue;
    const duration = text.match(/\b(\d+(?:\.\d+)?)\s*(?:day|days|hr|hrs|hour|hours|week|weeks|month|months)\b/i);
    return duration?.[1] || text;
  }
  return '';
}

function normalizeNumericFields<T extends Record<string, any>>(row: T, keys: string[]): T {
  const out: Record<string, any> = { ...row };
  for (const key of keys) out[key] = intOrNull(row[key]);
  return out as T;
}

function normalizeMoneyFields<T extends Record<string, any>>(row: T, keys: string[]): T {
  const out: Record<string, any> = { ...row };
  for (const key of keys) out[key] = numberOrNull(row[key]);
  return out as T;
}

function normalizeStringFields<T extends Record<string, any>>(row: T, keys: string[]): T {
  const out: Record<string, any> = { ...row };
  for (const key of keys) out[key] = stringOrNull(row[key]);
  return out as T;
}

function normalizeVendorQuotationRow(row: any) {
  let out = normalizeNumericFields(row, [
    'id',
    'quotation_id',
    'enquiry_id',
    'customer_id',
    'vendor_id',
    'service_id',
    'estimated_days',
  ]);
  out = normalizeStringFields(out, [
    'amount',
    'final_amount',
    'total',
    'advance_amount',
    'gst_amount',
    'platform_fee',
    'service_time',
    'message',
    'files',
    'created_at',
    'status_name',
  ]);
  out.service_time = deriveServiceTime(row.service_time, row.estimated_days, row.message);
  out.status = intOrDefault(row.status_int ?? row.status);
  if ('status_int' in out) out.status_int = intOrDefault(row.status_int ?? out.status);
  return out;
}

function normalizeVendorOrderRow(row: any) {
  let out = normalizeNumericFields(row, [
    'id',
    'order_id',
    'customer_id',
    'vendor_id',
    'enquiry_id',
    'quotation_id',
    'service_id',
  ]);
  out.id = intOrNull(row.id) ?? intOrNull(row.order_id);
  out = normalizeMoneyFields(out, ['amount', 'total', 'paid_amount', 'balance_amount']);
  out.files = stringOrEmpty(row.files);
  out.message = stringOrEmpty(row.message);
  out.payment_status = stringOrNull(row.payment_status);
  out.status = intOrDefault(row.status_int ?? row.status);
  if ('status_int' in out) out.status_int = intOrDefault(row.status_int ?? out.status);
  return out;
}

function normalizeVendorStepLogRow(row: any) {
  return normalizeNumericFields(row, ['id', 'order_id', 'step', 'performed_by_id']);
}

function normalizeVendorLegacyOrderStepRow(row: any) {
  const out: any = { ...row };
  const current = stringOrNull(out.step_status);
  out.step_status = current && /^\d+$/.test(current) ? current : String(out.step ?? current ?? '');
  return out;
}

function normalizeVendorPlanRow(row: any) {
  const out = normalizeNumericFields(row, [
    'id',
    'plan_id',
    'order_id',
    'customer_id',
    'vendor_id',
    'status',
    'mandatory',
  ]);
  out.amount = decimalString(row.amount);
  out.percentage = decimalString(row.percentage ?? row.amount_percentage);
  out.amount_percentage = intOrDefault(row.amount_percentage ?? row.percentage, 0);
  out.balance_cost = decimalString(row.balance_cost);
  out.completion_days = integerString(row.completion_days ?? row.days);
  out.days = intOrDefault(row.days ?? row.completion_days, 0);
  out.status = intOrDefault(row.status, 0);
  out.mandatory = intOrDefault(row.mandatory, 0);
  return out;
}

function normalizeVendorMaterialRow(row: any) {
  const out = normalizeNumericFields(row, ['id', 'material_id', 'order_id', 'plan_id']);
  out.id = intOrNull(row.id) ?? intOrNull(row.material_id);
  out.title = stringOrEmpty(row.title ?? row.name);
  out.unit_type = stringOrEmpty(row.unit_type ?? row.unit);
  out.quantity = decimalString(row.quantity ?? row.qty);
  out.qty = decimalString(row.qty ?? row.quantity);
  out.rate = decimalString(row.rate ?? row.unit_cost);
  out.unit_cost = decimalString(row.unit_cost ?? row.rate);
  out.total = decimalString(row.total ?? row.total_cost);
  out.total_cost = decimalString(row.total_cost ?? row.total);
  out.balance_cost = decimalString(row.balance_cost);
  out.m_final_amount = decimalString(row.m_final_amount ?? row.total_cost ?? row.total);
  out.amount = decimalString(row.amount ?? row.total ?? row.total_cost);
  return out;
}

async function legacyVendorProjectDetailPayload(orderId: number | string) {
  const data = await projectSvc.getProject(orderId);
  const plans = ((data as any)?.plan ?? []).map(normalizeVendorPlanRow);
  const project = (data as any)?.project ?? {};
  const [steps, materials, orderMain] = await Promise.all([
    query<any>(
      `SELECT id, order_id, step, step_status, performed_by, performed_by_id, remarks, created_at, updated_at
         FROM order_step_logs
        WHERE order_id = :id
        ORDER BY step ASC, id ASC`,
      { id: orderId },
    ).catch(() => []),
    materialSvc.listMaterials(orderId).then((rows) => rows.map(normalizeVendorMaterialRow)).catch(() => []),
    one<any>(
      `SELECT COALESCE(o.id, o.order_id) AS id,
              o.order_id,
              CAST(o.vendor_id AS UNSIGNED) AS vendor_id,
              CAST(o.service_id AS UNSIGNED) AS service_id,
              CAST(o.customer_id AS UNSIGNED) AS customer_id,
              c.name AS customer_name,
              COALESCE(c.phone, c.mobile) AS customer_phone,
              COALESCE(c.ph_code, '+91') AS customer_ph_code,
              v.company_name,
              COALESCE(vs.service_title, vs.title) AS service_title,
              vs.price,
              COALESCE(vs.unit_name, vs.unit) AS unit_name,
              vs.pricing_type,
              vs.description,
              COALESCE(vs.service_image, vs.thumbnail, '') AS service_image,
              vs.minimum_fee
         FROM orders o
         LEFT JOIN customers c ON c.customer_id = o.customer_id OR c.id = o.customer_id
         LEFT JOIN vendors v ON v.vendor_id = o.vendor_id OR v.id = o.vendor_id
         LEFT JOIN vendor_services vs ON vs.vendor_service_id = o.service_id OR vs.id = o.service_id
        WHERE o.order_id = :id
        LIMIT 1`,
      { id: orderId },
    ).catch(() => null),
  ]);
  return {
    data: plans,
    project,
    steps: steps.map(normalizeVendorStepLogRow),
    ordermaterials: materials,
    ordersMain: orderMain ? [orderMain] : [],
    order_plan: plans,
  };
}

function normalizeVendorEnquiryRow(row: any) {
  let out = normalizeNumericFields(row, [
    'enquiry_id',
    'customer_id',
    'vendor_id',
    'service_id',
  ]);
  out = normalizeStringFields(out, [
    'price',
    'minimum_fee',
    'budget',
    'phone',
    'pincode',
    'state',
    'city',
    'service_category',
    'sub_service',
    'years_of_experience',
    'willing_to_travel',
    'service_time',
  ]);
  out.status = intOrDefault(row.status);
  if ('is_active' in out) out.is_active = intOrNull(row.is_active);
  out.quotations = (row.quotations ?? []).map(normalizeVendorQuotationRow);
  out.service_time = deriveServiceTime(
    out.service_time,
    ...out.quotations.map((quotation: any) => quotation?.service_time),
  );
  return out;
}

async function legacyVendorQuotationRows(enquiryId: number | string) {
  const rows = await query<any>(
    `SELECT CAST(COALESCE(q.id, q.quotation_id) AS UNSIGNED) AS id,
            CAST(q.quotation_id AS UNSIGNED) AS quotation_id,
            CAST(q.enquiry_id AS UNSIGNED) AS enquiry_id,
            CAST(q.customer_id AS UNSIGNED) AS customer_id,
            CAST(q.vendor_id AS UNSIGNED) AS vendor_id,
            q.message, q.files, COALESCE(q.amount, q.final_amount, q.total) AS amount,
            q.service_time, CAST(${enquiryStatusExpr('q')} AS UNSIGNED) AS status, q.created_at,
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
       LEFT JOIN status_master sm ON sm.id = CAST(${enquiryStatusExpr('q')} AS UNSIGNED)
      WHERE q.enquiry_id = :id
      ORDER BY COALESCE(q.id, q.quotation_id) DESC`,
    { id: enquiryId },
  ).catch(() => []);
  return rows.map(normalizeVendorQuotationRow);
}

async function legacyVendorEnquiryRows(vendorId: number | string) {
  const rows = await query<any>(
    `SELECT CAST(COALESCE(e.id, e.enquiry_id) AS UNSIGNED) AS enquiry_id,
            CAST(e.customer_id AS UNSIGNED) AS customer_id,
            c.name AS customer_name,
            COALESCE(e.first_name, c.name) AS first_name,
            COALESCE(e.last_name, '') AS last_name,
            COALESCE(e.email, c.email) AS email,
            COALESCE(e.phone, c.phone, c.mobile) AS phone,
            COALESCE(CAST(c.state AS CHAR), '') AS state,
            COALESCE(CAST(c.city AS CHAR), '') AS city,
            COALESCE(CAST(c.pincode AS CHAR), '') AS pincode,
            COALESCE(e.message, e.description) AS message,
            e.files,
            e.budget,
            CAST(${enquiryStatusExpr('e')} AS UNSIGNED) AS status,
            e.created_at,
            CAST(e.service_id AS UNSIGNED) AS service_id,
            CAST(e.vendor_id AS UNSIGNED) AS vendor_id,
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
            vs.minimum_fee,
            COALESCE(vs.service_category, CAST(vs.category_id AS CHAR)) AS service_category,
            COALESCE(vs.service_subcategory, CAST(vs.subcategory_id AS CHAR)) AS sub_service,
            COALESCE(vs.is_active, vs.status, 1) AS is_active,
            COALESCE(vs.unit_name, vs.unit) AS unit_name,
            vs.pricing_type,
            vs.description,
            COALESCE(vs.service_image, vs.thumbnail) AS service_image
       FROM enquiries e
       LEFT JOIN customers c ON c.customer_id = e.customer_id
       LEFT JOIN vendors v ON v.vendor_id = e.vendor_id
       LEFT JOIN vendor_services vs ON vs.vendor_service_id = e.service_id OR vs.id = e.service_id
       LEFT JOIN status_master sm ON sm.id = CAST(${enquiryStatusExpr('e')} AS UNSIGNED)
      WHERE e.vendor_id = :vendorId
      ORDER BY COALESCE(e.id, e.enquiry_id) DESC`,
    { vendorId },
  );
  return Promise.all(rows.map(async (row: any) => normalizeVendorEnquiryRow({
    ...row,
    quotations: await legacyVendorQuotationRows(row.enquiry_id),
  })));
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
    const vendorIdInput = pickId(req.body, 'vendorId', 'vendor_id', 'id');
    const otp = String(req.body?.otp || req.body?.otpcode || '');
    const out = await authService.verifyOtpAndIssueToken({
      phone: phone || undefined,
      userId: vendorIdInput || undefined,
      otp,
      userType: 'vendor',
      name: req.body?.name || req.body?.company_name,
    });
    const vendorId = out.user?.vendor_id ?? out.user?.id;
    res.status(200).json({
      success: true,
      message: 'OTP verified successfully.',
      vendorId: String(vendorId),
      token: out.token,
      data: await legacyVendorRowsById(vendorId),
    });
  } catch (err) { next(err); }
});

legacyVendorRouter.post('/vendor-login-otp', async (req, res, next) => {
  try {
    const phone = pickPhone(req.body);
    const out = await authService.requestLoginOtp(phone, 'vendor');
    const vendorId = out.user?.vendor_id ?? out.user?.id;
    res.status(200).json({
      success: true,
      message: 'OTP sent for login',
      vendorId: String(vendorId),
    });
  } catch (err) { next(err); }
});

legacyVendorRouter.post('/vendor-login-verify-otp', async (req, res, next) => {
  try {
    const phone = pickPhone(req.body);
    const vendorIdInput = pickId(req.body, 'vendorId', 'vendor_id', 'id');
    const otp = String(req.body?.otp || '');
    const out = await authService.verifyOtpAndIssueToken({
      phone: phone || undefined,
      userId: vendorIdInput || undefined,
      otp,
      userType: 'vendor',
    });
    const vendorId = out.user?.vendor_id ?? out.user?.id;
    res.status(200).json({
      success: true,
      message: 'OTP verified successfully.',
      vendorId: String(vendorId),
      token: out.token,
      data: await legacyVendorRowsById(vendorId),
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
      `SELECT id, language_name, COALESCE(status, 1) AS status, COALESCE(is_deleted, 0) AS is_deleted
         FROM languages
        WHERE COALESCE(is_deleted,0)=0 AND status=1
        ORDER BY language_name`,
    );
    res.status(200).json({ success: true, languages: rows });
  } catch (err) { next(err); }
});
legacyVendorRouter.get('/getTools', async (_req, res, next) => {
  try {
    const rows = await commonQuery<any>(
      `SELECT id, tool_name, tool_slug, description, created_at, updated_at,
              COALESCE(is_deleted, 0) AS is_deleted, COALESCE(status, 1) AS status
         FROM tools_master
        WHERE COALESCE(is_deleted,0)=0 AND status=1 ORDER BY tool_name`,
    );
    res.status(200).json({ success: true, data: rows });
  } catch (err) { next(err); }
});
legacyVendorRouter.get('/listStatus', async (_req, res, next) => {
  try {
    const rows = await commonQuery<any>(
      `SELECT id, status_name, COALESCE(is_active, 1) AS is_active, created_at
         FROM status_master
        WHERE COALESCE(is_deleted,0)=0 AND is_active=1
        ORDER BY id`,
    );
    res.status(200).json({ success: true, data: rows });
  } catch (err) { next(err); }
});
legacyVendorRouter.get('/get_states_by_country_id', async (req, res, next) => {
  try {
    const cid = Number((req.query as any)?.country_id ?? 101);
    const rows = await commonQuery<any>(
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
legacyVendorRouter.post('/get_city', async (req, res, next) => {
  try {
    const sid = (req.body as any)?.state_id ?? (req.body as any)?.city_state_id;
    const stateName = String((req.body as any)?.state_name || (req.body as any)?.city_state || '').trim();
    const rows = sid
      ? await commonQuery<any>(
          `SELECT city_id, city_name, city_state, city_state_id,
                  COALESCE(status, 1) AS status, COALESCE(is_deleted, 0) AS is_deleted
             FROM city
            WHERE city_state_id = :sid AND COALESCE(is_deleted,0)=0 AND status=1 ORDER BY city_name`,
          { sid },
        )
      : stateName
        ? await commonQuery<any>(
            `SELECT city_id, city_name, city_state, city_state_id,
                    COALESCE(status, 1) AS status, COALESCE(is_deleted, 0) AS is_deleted
               FROM city
              WHERE LOWER(city_state) = LOWER(:stateName)
                AND COALESCE(is_deleted,0)=0 AND status=1
              ORDER BY city_name`,
            { stateName },
          )
      : await commonQuery<any>(
          `SELECT city_id, city_name, city_state, city_state_id,
                  COALESCE(status, 1) AS status, COALESCE(is_deleted, 0) AS is_deleted
             FROM city
            WHERE COALESCE(is_deleted,0)=0 AND status=1 ORDER BY city_name`,
        );
    res.status(200).json({ success: true, city: uniqueCityRows(rows) });
  } catch (err) { next(err); }
});
legacyVendorRouter.post('/listProofTypes', async (_req, res, next) => {
  try {
    const rows = await commonQuery<any>(
      `SELECT id, proof_name, COALESCE(status, 1) AS status, created_at, updated_at,
              COALESCE(is_deleted, 0) AS is_deleted
         FROM master_proof_types
        WHERE COALESCE(is_deleted,0)=0 AND status=1 ORDER BY proof_name`,
    );
    res.status(200).json({ success: true, data: rows });
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
      `SELECT id, name, country_id, country_code,
              NULL AS fips_code, NULL AS iso2, state_code, NULL AS type,
              NULL AS latitude, NULL AS longitude,
              created_at, updated_at, NULL AS flag, NULL AS wikiDataId,
              COALESCE(status, 1) AS status, created_at AS created_on,
              updated_at AS updated_on, COALESCE(is_deleted, 0) AS is_deleted
         FROM states
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

/* ─────────────────────────────────────────────────────────────
 *  Authenticated vendor endpoints
 * ───────────────────────────────────────────────────────────── */
legacyVendorRouter.use(requireAuth(['vendor']));
legacyVendorRouter.use(requireApprovedVendor({
  allowPaths: [
    '/step1',
    '/step2',
    '/step3',
    '/step4',
    '/serviceTagStep',
    '/VendorAddServiceTag',
    '/vendorInfo',
    '/upload_files',
  ],
}));

/* ───── Onboarding step1..step4 + serviceTagStep ───── */
async function handleStep(step: number, req: AuthRequest, res: any, next: any) {
  try {
    await vendorSvc.onboardingStep(req.user!.id, step, {
      name: pickNullable(req.body, 'name'),
      company_name: pickNullable(req.body, 'company_name', 'companyName'),
      ph_code: pickNullable(req.body, 'ph_code', 'phone_code'),
      phone: pickNullable(req.body, 'phone', 'mobile', 'mobile_number'),
      email: pickNullable(req.body, 'email'),
      full_name: pickNullable(req.body, 'full_name', 'fullName', 'owner_name', 'ownerName'),
      owner_name: pickNullable(req.body, 'owner_name', 'ownerName', 'full_name', 'fullName'),
      state: pickNullable(req.body, 'state', 'state_id', 'stateId'),
      city: pickNullable(req.body, 'city', 'city_id', 'cityId'),
      address: pickNullable(req.body, 'address'),
      pincode: pickNullable(req.body, 'pincode', 'pin_code', 'pinCode'),
      about: pickNullable(req.body, 'about', 'short_bio', 'shortBio'),
      short_bio: pickNullable(req.body, 'short_bio', 'shortBio', 'about'),
      profile_image: pickNullable(req.body, 'profile_image', 'profile_photo', 'profile_photo_url', 'profilePhoto', 'profilePhotoUrl'),
      profile_photo: pickNullable(req.body, 'profile_photo', 'profile_photo_url', 'profile_image', 'profilePhoto', 'profilePhotoUrl'),
      service_tag: pickCsv(req.body, 'service_tag', 'service_tags', 'serviceTag', 'serviceTags', 'tag_ids', 'tagIds'),
      service_category: pickNullable(req.body, 'service_category', 'serviceCategory', 'category_id', 'categoryId'),
      sub_service: pickNullable(req.body, 'sub_service', 'subService', 'service_subcategory', 'subcategory_id', 'subcategoryId'),
      gst_number: pickNullable(req.body, 'gst_number', 'gstNumber'),
      is_gst_registered: mobileFlag(req.body?.is_gst_registered ?? req.body?.isGstRegistered),
      experience_years: req.body?.experience_years ? num(req.body.experience_years) : null,
      years_of_experience: req.body?.years_of_experience ? num(req.body.years_of_experience) : null,
      certifications: pickCsv(req.body, 'certifications', 'certification_urls', 'certificationUrls'),
      languages: pickCsv(req.body, 'languages'),
      area_of_service: pickCsv(req.body, 'area_of_service', 'areaOfService'),
      working_hours_from: pickNullable(req.body, 'working_hours_from', 'workingHoursFrom'),
      working_hours_to: pickNullable(req.body, 'working_hours_to', 'workingHoursTo'),
      willing_to_travel: mobileFlag(req.body?.willing_to_travel ?? req.body?.willingToTravel),
      tools_available: pickCsv(req.body, 'tools_available', 'toolsAvailable'),
      proof_type: pickNullable(req.body, 'proof_type', 'kyc_id_type', 'id_type'),
      proof_number: pickNullable(req.body, 'proof_number', 'kyc_id_number', 'id_number'),
      kyc_document_url: pickNullable(req.body, 'kyc_document_url', 'kyc_id_image', 'id_image_url', 'document_url', 'documentUrl'),
      kyc_id_type: pickNullable(req.body, 'kyc_id_type', 'proof_type', 'id_type'),
      kyc_id_number: pickNullable(req.body, 'kyc_id_number', 'proof_number', 'id_number'),
      kyc_id_image: pickNullable(req.body, 'kyc_id_image', 'id_image_url', 'kyc_document_url', 'document_url', 'documentUrl'),
      kyc_selfie: pickNullable(req.body, 'kyc_selfie', 'selfie_url', 'selfieUrl', 'selfie'),
      kyc_status: step >= 4 ? 'pending' : pickNullable(req.body, 'kyc_status'),
      fcm_token: pickNullable(req.body, 'fcm_token', 'device_id', 'deviceId'),
    });
    send(res, { message: `Step ${step} saved`, data: await legacyVendorRowsById(req.user!.id) });
  } catch (err) { next(err); }
}
legacyVendorRouter.post('/step1', (req: AuthRequest, res, next) => handleStep(1, req, res, next));
legacyVendorRouter.post('/step2', (req: AuthRequest, res, next) => handleStep(2, req, res, next));
legacyVendorRouter.post('/step3', (req: AuthRequest, res, next) => handleStep(3, req, res, next));
legacyVendorRouter.post('/step4', (req: AuthRequest, res, next) => handleStep(4, req, res, next));

legacyVendorRouter.post('/serviceTagStep', async (req: AuthRequest, res, next) => {
  try {
    const serviceTag = pickCsv(req.body, 'service_tag', 'service_tags', 'serviceTag', 'serviceTags', 'tag_ids', 'tagIds');
    if (!serviceTag) throw new ApiError(400, 'service_tag is required');
    await vendorSvc.onboardingStep(req.user!.id, 0, { service_tag: serviceTag });
    send(res, { message: 'Tag saved', data: await legacyVendorRowsById(req.user!.id) });
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
    const active = activeFlag(req.body?.is_active ?? req.body?.status);
    const out = await vendorSvc.createListing(req.user!.id, {
      title: req.body?.title || req.body?.service_title,
      description: req.body?.description,
      price: req.body?.price ? num(req.body.price) : undefined,
      unit: req.body?.unit || req.body?.unit_name,
      category_id: pickId(req.body, 'category_id', 'categoryId', 'service_category') || undefined,
      subcategory_id: pickId(req.body, 'subcategory_id', 'subcategoryId', 'service_subcategory') || undefined,
      thumbnail: req.body?.thumbnail || req.body?.service_image || req.body?.service_image_url,
      pricing_type: req.body?.pricing_type,
      certificate_url: req.body?.certificate_url || req.body?.certificate,
      minimum_fee: req.body?.minimum_fee ? num(req.body.minimum_fee) : undefined,
      tag_ids: numberListFromBody(req.body, 'tag_ids', 'tagIds'),
      status: active,
    });
    const rows = await legacyVendorServiceRows(req.user!.id, String(out?.vendor_service_id ?? out?.id));
    res.status(200).json({
      success: true,
      message: 'Service listing created successfully',
      data: rows[0] ?? out,
    });
  } catch (err) { next(err); }
});

legacyVendorRouter.post('/updateServiceListing', async (req: AuthRequest, res, next) => {
  try {
    const serviceId = pickId(req.body, 'vendor_service_id', 'service_id', 'serviceId', 'id');
    if (!serviceId) throw new ApiError(400, 'vendor_service_id required');
    const active = activeFlag(req.body?.is_active ?? req.body?.status);
    const out = await vendorSvc.updateListing(req.user!.id, serviceId, {
      title: req.body?.title || req.body?.service_title, description: req.body?.description,
      price: req.body?.price ? num(req.body.price) : undefined,
      unit: req.body?.unit || req.body?.unit_name,
      category_id: pickId(req.body, 'category_id', 'categoryId', 'service_category') || undefined,
      subcategory_id: pickId(req.body, 'subcategory_id', 'subcategoryId', 'service_subcategory') || undefined,
      thumbnail: req.body?.thumbnail || req.body?.service_image || req.body?.service_image_url,
      pricing_type: req.body?.pricing_type,
      certificate_url: req.body?.certificate_url || req.body?.certificate,
      minimum_fee: req.body?.minimum_fee ? num(req.body.minimum_fee) : undefined,
      tag_ids: numberListFromBody(req.body, 'tag_ids', 'tagIds'),
      status: active,
    });
    const rows = await legacyVendorServiceRows(req.user!.id, serviceId);
    res.status(200).json({
      success: true,
      message: 'Service listing updated successfully',
      data: rows[0] ?? out,
    });
  } catch (err) { next(err); }
});

const handleListings = async (req: AuthRequest, res: any, next: any) => {
  try {
    res.status(200).json({
      success: true,
      message: 'Service list fetched successfully',
      data: await legacyVendorServiceRows(req.user!.id, undefined, true),
    });
  } catch (err) { next(err); }
};
legacyVendorRouter.get('/getVendorServiceList', handleListings);
legacyVendorRouter.post('/getVendorServiceList', handleListings);

async function handleServiceStatusUpdate(req: AuthRequest, res: any, next: any) {
  try {
    const serviceId = pickId(req.body, 'vendor_service_id', 'service_id', 'id');
    if (!serviceId) throw new ApiError(400, 'service_id required');
    if (req.body?.show_review !== undefined) {
      const showReview = req.body.show_review === '1' || req.body.show_review === 1 ||
        req.body.show_review === true || req.body.show_review === 'true';
      await exec(
        `UPDATE vendor_services SET show_review = :showReview
          WHERE (vendor_service_id = :id OR id = :id) AND vendor_id = :vid`,
        { showReview: showReview ? 1 : 0, id: serviceId, vid: req.user!.id },
      );
      return res.status(200).json({
        success: true,
        message: showReview ? 'Service Review activated' : 'Service Review deactivated',
      });
    }
    const active = activeFlag(req.body?.is_active ?? req.body?.status) ?? false;
    await vendorSvc.setListingStatus(req.user!.id, serviceId, active);
    res.status(200).json({
      success: true,
      message: active ? 'Service activated' : 'Service deactivated',
    });
  } catch (err) { next(err); }
}
legacyVendorRouter.post('/ServiceStatusUpdate', handleServiceStatusUpdate);
legacyVendorRouter.post('/ServiceReviewStatusUpdate', handleServiceStatusUpdate);

legacyVendorRouter.post('/ServiceDetails', async (req: AuthRequest, res, next) => {
  try {
    const serviceId = pickId(req.body, 'vendor_service_id', 'service_id', 'id');
    if (!serviceId) throw new ApiError(400, 'service_id required');
    res.status(200).json({
      success: true,
      message: 'Service Details',
      data: await legacyVendorServiceRows(req.user!.id, serviceId),
    });
  } catch (err) { next(err); }
});

/* ───── Enquiries ───── */
/* v4.5.36 — mobile compat bridge, now using the EXACT categorization
 * logic from the old app.vayil.in vendorEnuqiryList handler (verified
 * against the April 12 source archive). The original logic is:
 *
 *   request_quotation = enquiry has NO matching order
 *   new_enquiry       = enquiry has an order whose order_step_logs.step === 1
 *   ongoing           = enquiry has an order whose order_step_logs.step === 2
 *
 * Each item carries `quotations` + `orders` arrays nested inside so the
 * mobile UI can render the timeline / quote chips. v4.5.35's initial
 * status-string heuristic was wrong; this replaces it with the real query.
 */
legacyVendorRouter.post('/vendorEnuqiryList', async (req: AuthRequest, res, next) => {
  try {
    const vendorId = req.user!.id;
    const enquiries: any[] = await legacyVendorEnquiryRows(vendorId);
    if (!enquiries.length) {
      return res.status(200).json({ success: true, new_enquiry: [], ongoing: [], request_quotation: [] });
    }
    const enquiryIds = enquiries.map((e) => e.enquiry_id).filter(Boolean);
    const [orderRows, stepLogRows, planRows] = await Promise.all([
      query<any>(`SELECT * FROM orders WHERE enquiry_id IN (:ids)`, { ids: enquiryIds }).catch(() => []),
      query<any>(`SELECT osl.*
                    FROM order_step_logs osl
                    JOIN orders o
                      ON osl.order_id = COALESCE(o.id, o.order_id)
                      OR osl.order_id = o.order_id
                   WHERE o.enquiry_id IN (:ids)`, { ids: enquiryIds }).catch(() => []),
      query<any>(`SELECT op.*
                    FROM order_plan op
                    JOIN orders o
                      ON op.order_id = COALESCE(o.id, o.order_id)
                      OR op.order_id = o.order_id
                   WHERE o.enquiry_id IN (:ids)`, { ids: enquiryIds }).catch(() => []),
    ]);
    const orders = orderRows.map(normalizeVendorOrderRow);
    const stepLogs = stepLogRows.map(normalizeVendorStepLogRow);
    const plans = planRows.map(normalizeVendorPlanRow);
    const new_enquiry: any[] = [];
    const ongoing: any[] = [];
    const request_quotation: any[] = [];
    for (const enquiry of enquiries) {
      const enquiryOrders = orders.filter((o: any) => Number(o.enquiry_id) === Number(enquiry.enquiry_id));
      if (enquiryOrders.length === 0) {
        request_quotation.push({ ...enquiry, orders: [] });
        continue;
      }
      for (const order of enquiryOrders) {
        const orderKeys = [order.id, order.order_id].filter((value) => value !== undefined && value !== null);
        const orderStepLogs = stepLogs.filter((s: any) => orderKeys.some((key) => Number(s.order_id) === Number(key)));
        const ordersteps = orderStepLogs.map(normalizeVendorLegacyOrderStepRow);
        const orderPlans = plans.filter((p: any) => orderKeys.some((key) => Number(p.order_id) === Number(key)));
        const stepLog = orderStepLogs[0];
        const item = {
          ...enquiry,
          orders: [{
            ...order,
            plans:           orderPlans,
            ordersteps,
            order_step_logs: orderStepLogs,
          }],
        };
        if (Number(stepLog?.step) === 1)      new_enquiry.push(item);
        else if (Number(stepLog?.step) === 2) ongoing.push(item);
        // step 3+ (completed) intentionally falls into none of the three
        // visible buckets — matches old behaviour.
      }
    }
    res.status(200).json({ success: true, new_enquiry, ongoing, request_quotation });
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
    await quoteSvc.sendQuote({
      vendor_id: req.user!.id,
      enquiry_id: enquiryId,
      amount: num(req.body?.amount),
      message: req.body?.message,
      estimated_days: req.body?.estimated_days ? num(req.body.estimated_days) : undefined,
      service_time: req.body?.service_time ?? req.body?.serviceTime ?? req.body?.estimated_days ?? undefined,
      valid_until: req.body?.valid_until,
      advance_amount: req.body?.advance_amount ? num(req.body.advance_amount) : undefined,
    });
    res.status(200).json({ success: true, message: 'Quote sent to customer' });
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

function legacyPlanRowsFromBody(body: any): any[] {
  const raw = body?.milestones ?? body?.plan ?? body?.plans;
  const rows = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? (() => { try { return JSON.parse(raw); } catch { return []; } })()
      : [];
  const list = Array.isArray(rows) && rows.length ? rows : [body];
  return list
    .filter((row: any) => row && (pickId(row, 'plan_id', 'id') || row.title || row.amount || row.amount_percentage || row.completion_days || row.status))
    .map((row: any) => ({
      plan_id: pickId(row, 'plan_id', 'planId', 'id') || null,
      title: row.title ?? '',
      description: row.description ?? null,
      amount: optionalNum(row.amount),
      days: optionalNum(row.days ?? row.completion_days ?? row.completionDays),
      percentage: optionalNum(row.percentage ?? row.amount_percentage ?? row.amountPercentage),
      update_photo: row.update_photo ?? row.updatePhoto ?? null,
      update_comments: row.update_comments ?? row.updateComments ?? row.comments ?? null,
      status: optionalNum(row.status),
    }));
}

async function resolveOrderIdFromPlanBody(body: any): Promise<string> {
  let orderId = pickId(body, 'order_id', 'orderId');
  if (orderId) return orderId;
  const rows = legacyPlanRowsFromBody(body);
  const planId = rows.map((r) => r.plan_id).find(Boolean);
  if (!planId) return '';
  const row = await one<any>(
    `SELECT order_id FROM order_plan WHERE plan_id = :id OR id = :id LIMIT 1`,
    { id: planId },
  ).catch(() => null);
  return row?.order_id ? String(row.order_id) : '';
}

async function createLegacyPlanRows(orderId: number | string, rows: any[]) {
  for (const row of rows) {
    if (!row.title && row.amount === undefined && row.percentage === undefined) continue;
    const result: any = await exec(
      `INSERT INTO order_plan
         (order_id, title, description, amount, days, percentage, mandatory,
          vendor_status, customer_status, completion_days, amount_percentage,
          balance_cost, update_photo, update_comments, status, created_at)
       VALUES
         (:orderId, :title, :description, :amount, :days, :percentage, 1,
          'draft', 'pending', :completionDays, :amountPercentage,
          :balanceCost, :updatePhoto, :updateComments, COALESCE(:status, 0), NOW())`,
      {
        orderId,
        title: row.title || 'Plan',
        description: row.description,
        amount: row.amount ?? 0,
        days: row.days ?? 0,
        percentage: row.percentage ?? 0,
        completionDays: row.days === undefined ? null : String(row.days),
        amountPercentage: row.percentage ?? null,
        balanceCost: row.amount ?? 0,
        updatePhoto: row.update_photo,
        updateComments: row.update_comments,
        status: row.status ?? null,
      },
    );
    await exec(`UPDATE order_plan SET id = plan_id WHERE plan_id = :id AND (id IS NULL OR id = 0)`, { id: result.insertId }).catch(() => undefined);
  }
  return query<any>('SELECT * FROM order_plan WHERE order_id = :id ORDER BY plan_id ASC', { id: orderId });
}

async function updateLegacyPlanRows(orderId: number | string, rows: any[]) {
  for (const row of rows) {
    if (!row.plan_id) continue;
    await exec(
      `UPDATE order_plan SET
          title = COALESCE(:title, title),
          description = COALESCE(:description, description),
          amount = COALESCE(:amount, amount),
          days = COALESCE(:days, days),
          percentage = COALESCE(:percentage, percentage),
          completion_days = COALESCE(:completionDays, completion_days),
          amount_percentage = COALESCE(:amountPercentage, amount_percentage),
          balance_cost = COALESCE(:balanceCost, balance_cost),
          update_photo = COALESCE(:updatePhoto, update_photo),
          update_comments = COALESCE(:updateComments, update_comments),
          status = COALESCE(:status, status),
          updated_at = NOW()
        WHERE (plan_id = :planId OR id = :planId) AND order_id = :orderId`,
      {
        orderId,
        planId: row.plan_id,
        title: row.title || null,
        description: row.description ?? null,
        amount: row.amount ?? null,
        days: row.days ?? null,
        percentage: row.percentage ?? null,
        completionDays: row.days === undefined ? null : String(row.days),
        amountPercentage: row.percentage ?? null,
        balanceCost: row.amount ?? null,
        updatePhoto: row.update_photo ?? null,
        updateComments: row.update_comments ?? null,
        status: row.status ?? null,
      },
    );
  }
  return query<any>('SELECT * FROM order_plan WHERE order_id = :id ORDER BY plan_id ASC', { id: orderId });
}

legacyVendorRouter.post('/createPlan', async (req: AuthRequest, res, next) => {
  try {
    const orderId = pickId(req.body, 'order_id', 'orderId');
    if (!orderId) throw new ApiError(400, 'order_id required');
    await projectSvc.assertOrderBelongsToVendor(orderId, req.user!.id);
    const milestones = parseMilestones(req.body);
    const legacyRows = legacyPlanRowsFromBody(req.body);
    const data = milestones.length
      ? await projectSvc.createPlan(orderId, milestones)
      : await createLegacyPlanRows(orderId, legacyRows);
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
    const orderId = await resolveOrderIdFromPlanBody(req.body);
    if (!orderId) throw new ApiError(400, 'order_id required');
    await projectSvc.assertOrderBelongsToVendor(orderId, req.user!.id);
    const data = await updateLegacyPlanRows(orderId, legacyPlanRowsFromBody(req.body));
    send(res, { message: 'Plan updated', data });
  } catch (err) { next(err); }
});

legacyVendorRouter.post('/updatePlanStatus', async (req: AuthRequest, res, next) => {
  try {
    const planId = pickId(req.body, 'plan_id', 'planId', 'id');
    if (planId) {
      const owner = await one<any>(
        `SELECT p.order_id FROM order_plan p JOIN orders o ON o.order_id = p.order_id
          WHERE (p.plan_id = :id OR p.id = :id) AND o.vendor_id = :vendorId LIMIT 1`,
        { id: planId, vendorId: req.user!.id },
      );
      if (!owner) throw new ApiError(404, 'Plan not found');
      const status = optionalNum(req.body?.status);
      await exec(
        `UPDATE order_plan
            SET status = COALESCE(:status, status),
                updated_at = NOW()
          WHERE plan_id = :id OR id = :id`,
        { id: planId, status: status ?? null },
      );
      return send(res, {
        message: 'Plan status updated',
        data: await query<any>('SELECT * FROM order_plan WHERE order_id = :id ORDER BY plan_id ASC', { id: owner.order_id }),
      });
    }
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
    const plans:   any[] = ((data as any)?.plan ?? []).map(normalizeVendorPlanRow);
    const responseData = { ...(data as any), plan: plans };
    const baseAmount = Number(project?.amount ?? 0);
    const usedAmount = plans.reduce((s: number, p: any) => s + Number(p?.amount ?? 0), 0);
    const usedPct = baseAmount > 0 ? Math.round((usedAmount / baseAmount) * 100) : 0;
    send(res, {
      data: responseData,
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
    const explicitOrderId = pickId(req.body, 'order_id', 'orderId');
    const idInput = pickId(req.body, 'id');
    let planId = pickId(req.body, 'plan_id', 'planId');
    let orderId = explicitOrderId;
    if (!orderId && idInput) {
      const owner = await one<any>(
        `SELECT order_id FROM order_plan WHERE plan_id = :id OR id = :id LIMIT 1`,
        { id: idInput },
      );
      if (owner?.order_id) {
        orderId = String(owner.order_id);
        planId = idInput;
      } else {
        orderId = idInput;
      }
    }
    if (!orderId) throw new ApiError(400, 'order_id required');
    await projectSvc.assertOrderBelongsToVendor(orderId, req.user!.id);
    const data = await projectSvc.getProject(orderId);
    const plans = ((data as any)?.plan ?? []).map(normalizeVendorPlanRow);
    const rows = planId
      ? plans.filter((plan: any) => String(plan?.plan_id ?? plan?.id) === String(planId) || String(plan?.id) === String(planId))
      : plans;
    send(res, { data: rows });
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
      name: req.body?.name || req.body?.material_name || req.body?.title || '',
      quantity: req.body?.quantity || req.body?.qty ? num(req.body.quantity ?? req.body.qty) : 1,
      unit: req.body?.unit || req.body?.unit_type || req.body?.unitType,
      rate: req.body?.rate || req.body?.unit_cost ? num(req.body.rate ?? req.body.unit_cost) : 0,
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
      name: req.body?.name || req.body?.material_name || req.body?.title,
      quantity: req.body?.quantity || req.body?.qty ? num(req.body.quantity ?? req.body.qty) : undefined,
      unit: req.body?.unit || req.body?.unit_type || req.body?.unitType,
      rate: req.body?.rate || req.body?.unit_cost ? num(req.body.rate ?? req.body.unit_cost) : undefined,
    });
    send(res, { message: 'Material updated', data: m });
  } catch (err) { next(err); }
});

legacyVendorRouter.post('/vendorgetMaterial', async (req: AuthRequest, res, next) => {
  try {
    const orderId = pickId(req.body, 'order_id', 'orderId');
    if (!orderId) throw new ApiError(400, 'order_id required');
    await projectSvc.assertOrderBelongsToVendor(orderId, req.user!.id);
    const data = (await materialSvc.listMaterials(orderId)).map(normalizeVendorMaterialRow);
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
    send(res, { data: [normalizeVendorMaterialRow(data)] });
  } catch (err) { next(err); }
});

legacyVendorRouter.post('/vendorOrderDetails', async (req: AuthRequest, res, next) => {
  try {
    const orderId = pickId(req.body, 'order_id', 'orderId');
    if (!orderId) throw new ApiError(400, 'order_id required');
    await projectSvc.assertOrderBelongsToVendor(orderId, req.user!.id);
    send(res, await legacyVendorProjectDetailPayload(orderId));
  } catch (err) { next(err); }
});

/** GET /vendor/vendorInfo — vendor self-profile lookup (mobile expects GET). */
legacyVendorRouter.get('/vendorInfo', async (req: AuthRequest, res, next) => {
  try {
    res.status(200).json({ success: true, data: await legacyVendorRowsById(req.user!.id) });
  } catch (err) { next(err); }
});

/* ───── Payment request (vendor → customer) ───── */
legacyVendorRouter.post('/AskPyament', async (req: AuthRequest, res, next) => {
  try {
    let planId = pickId(req.body, 'plan_id', 'planId', 'milestone_id');
    if (!planId) {
      const orderId = pickId(req.body, 'order_id', 'orderId', 'id');
      if (orderId) {
        await projectSvc.assertOrderBelongsToVendor(orderId, req.user!.id);
        const plan = await one<any>(
          `SELECT plan_id FROM order_plan WHERE order_id = :id ORDER BY plan_id DESC LIMIT 1`,
          { id: orderId },
        );
        if (plan?.plan_id) planId = String(plan.plan_id);
      }
    }
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
    // v4.5.36 — invoice_url matches the OLD app.vayil.in literal exactly.
    // Mobile concatenates `${invoiceUrl}${order_id}/${intent_id}` to open
    // the invoice in a webview. We preserve the string so existing builds
    // get the same URL they did pre-migration. Override via env if you
    // ever host the invoice page somewhere new.
    const invoiceBase = process.env.INVOICE_URL_BASE || 'https://app.vayil.in/admin/invoice/';
    send(res, {
      data: { intents, held, released },
      TotalAmount:         totalAmount.toFixed(2),
      TotalPaidAmount:     released.toFixed(2),
      TotalMaterialAmount: totalMaterialAmount.toFixed(2),
      TotalPlanAmount:     totalPlanAmount.toFixed(2),
      servicePayment,
      materialPayment,
      invoice_url:         invoiceBase,
      https:               invoiceBase.startsWith('https'),
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
    const rows = await payoutSvc.getRevenueChart(req.user!.id, req.query?.months ? num(req.query.months) : 12);
    const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const byMonth = new Map(rows.map((r: any) => {
      const monthIndex = String(r.month || '').includes('-')
        ? Number(String(r.month).split('-')[1]) - 1
        : monthNames.indexOf(String(r.month || '').toUpperCase());
      return [monthIndex, Number(r.revenue ?? r.amount ?? 0)];
    }));
    const data = monthNames.map((month, idx) => ({ month, amount: byMonth.get(idx) ?? 0 }));
    res.status(200).json({ success: true, data });
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
    const amount = num(req.body?.amount ?? req.body?.payout_amount ?? req.body?.payoutAmount);
    const out = await payoutSvc.requestPayout(req.user!.id, amount, pickId(req.body, 'bank_id', 'bankId') || undefined, req.body?.note);
    send(res, { message: 'Payout requested', data: out }, 201);
  } catch (err) { next(err); }
});

/* ───── Bank details ───── */
legacyVendorRouter.post('/AddBankDetails', async (req: AuthRequest, res, next) => {
  try {
    const out = await bankSvc.addBankDetails(req.user!.id, {
      account_holder: req.body?.account_holder || req.body?.holder_name || req.body?.account_name || await defaultBankHolder(req.user!.id),
      account_number: req.body?.account_number,
      ifsc_code: req.body?.ifsc_code || req.body?.ifsc,
      bank_name: req.body?.bank_name,
      branch: req.body?.branch,
      upi_id: req.body?.upi_id,
      pan_number: req.body?.pan_number,
      swift_code: req.body?.swift_code,
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
      pan_number: req.body?.pan_number, swift_code: req.body?.swift_code,
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
      pan_number: req.body?.pan_number, swift_code: req.body?.swift_code,
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
      const { legacyUploadResponse, uploadFiles } = await import('../utils/uploads');
      const { validateProfileImage } = await import('../utils/imageValidation');
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (!files.length) throw new ApiError(400, 'no files in request');
      if (req.body?.kind === 'profile') files.forEach(validateProfileImage);
      const urls = await uploadFiles(files as any, { prefix: `vendor-${req.user!.id}` });
      send(res, legacyUploadResponse(urls));
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
