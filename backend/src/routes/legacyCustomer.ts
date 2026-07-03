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
import { exec, one, query, transaction } from '../db';
import { publicSettingsSafe } from './common';
import { uniqueCityRows } from '../utils/city';
import { createRazorpayOrder } from '../utils/razorpay';

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
function hasBodyKey(b: any, ...keys: string[]): boolean {
  return keys.some((key) => Object.prototype.hasOwnProperty.call(b ?? {}, key));
}
function pickString(b: any, ...keys: string[]): string {
  for (const key of keys) {
    if (hasBodyKey(b, key)) return String(b?.[key] ?? '');
  }
  return '';
}
function jsonStringOrNull(value: any): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}
function objectFromJsonish(value: any): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}
function arrayFromJsonish(value: any): any[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}
function legacyPlaceOrderPayload(body: any): boolean {
  return hasBodyKey(body, 'order_amount', 'payment_type', 'platform_cost', 'tax_cost')
    || String(body?.payment_type || '').toLowerCase() === 'place_order';
}
function legacyPaymentUpdatePayload(body: any): boolean {
  return hasBodyKey(body, 'payment_data', 'payment_amount', 'base_amount', 'convenience_fee_cost')
    || ['material', 'plan'].includes(String(body?.payment_type || '').toLowerCase());
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

function intOrNull(value: any): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
function intOrDefault(value: any, fallback = 1): number {
  return intOrNull(value) ?? fallback;
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
  const n = Number(value);
  return Number.isFinite(n) ? String(Math.trunc(n)) : fallback;
}
function stringOrEmpty(value: any): string {
  if (value === undefined || value === null) return '';
  return String(value);
}
function normalizeNumericFields<T extends Record<string, any>>(row: T, keys: string[]): T {
  const out: Record<string, any> = { ...row };
  for (const key of keys) out[key] = intOrNull(row[key]);
  return out as T;
}
function normalizeCustomerPlanRow(row: any) {
  const out = normalizeNumericFields(row, ['id', 'plan_id', 'order_id', 'customer_id', 'vendor_id', 'mandatory']);
  out.id = intOrNull(row.id) ?? intOrNull(row.plan_id);
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
function normalizeCustomerMaterialRow(row: any) {
  const out = normalizeNumericFields(row, ['id', 'material_id', 'order_id']);
  out.id = intOrNull(row.id) ?? intOrNull(row.material_id);
  out.plan_id = row.plan_id === undefined || row.plan_id === null ? null : String(row.plan_id);
  out.title = stringOrEmpty(row.title ?? row.name);
  out.unit_type = stringOrEmpty(row.unit_type ?? row.unit);
  out.quantity = decimalString(row.quantity ?? row.qty);
  out.qty = decimalString(row.qty ?? row.quantity);
  out.rate = decimalString(row.rate ?? row.unit_cost);
  out.unit_cost = decimalString(row.unit_cost ?? row.rate);
  out.total = decimalString(row.total ?? row.total_cost);
  out.total_cost = decimalString(row.total_cost ?? row.total);
  out.balance_cost = decimalString(row.balance_cost);
  out.m_tax = decimalString(row.m_tax);
  out.m_tax_cost = decimalString(row.m_tax_cost);
  out.m_platform_cost = decimalString(row.m_platform_cost);
  out.m_convenience_cost = decimalString(row.m_convenience_cost);
  out.m_final_amount = decimalString(row.m_final_amount ?? row.total_cost ?? row.total);
  out.payment_status = stringOrEmpty(row.payment_status ?? row.status);
  out.status = stringOrEmpty(row.status ?? row.payment_status);
  return out;
}
function normalizeCustomerStepLogRow(row: any) {
  const out = normalizeNumericFields(row, ['id', 'order_id', 'step', 'performed_by_id']);
  const current = row?.step_status === undefined || row?.step_status === null
    ? ''
    : String(row.step_status);
  out.step_status = current && /^\d+$/.test(current) ? current : String(out.step ?? current ?? '');
  return out;
}
async function legacyCustomerMaterialRows(orderId: number | string) {
  const primary = await query<any>(
    `SELECT * FROM order_plan_materials WHERE order_id = :id ORDER BY id ASC`,
    { id: orderId },
  ).catch(() => []);
  const fallback = await query<any>(
    `SELECT * FROM materials WHERE order_id = :id ORDER BY material_id ASC`,
    { id: orderId },
  ).catch(() => []);
  return (primary.length ? primary : fallback).map(normalizeCustomerMaterialRow);
}
async function legacyCustomerReviewRows(orderId: number | string) {
  const fromPlural = await query<any>(
    `SELECT COALESCE(cr.review_id, cr.id) AS id,
            cr.order_id,
            cr.customer_id,
            cr.vendor_id,
            cr.service_id,
            cr.rating,
            COALESCE(cr.review_description, cr.comment) AS review_description,
            COALESCE(cr.status, 1) AS status,
            cr.created_at,
            cr.updated_at,
            c.name AS customer_name
       FROM customer_reviews cr
       LEFT JOIN customers c ON c.customer_id = cr.customer_id OR c.id = cr.customer_id
      WHERE cr.order_id = :id
      ORDER BY COALESCE(cr.review_id, cr.id) ASC`,
    { id: orderId },
  ).catch(() => []);
  if (fromPlural.length) return fromPlural.map((row) => normalizeNumericFields(row, ['id', 'order_id', 'customer_id', 'vendor_id', 'service_id', 'rating', 'status']));
  return query<any>(
    `SELECT COALESCE(cr.review_id, cr.id) AS id,
            cr.order_id,
            cr.customer_id,
            cr.vendor_id,
            cr.service_id,
            cr.rating,
            cr.review_description,
            COALESCE(cr.status, 1) AS status,
            cr.created_at,
            cr.updated_at,
            c.name AS customer_name
       FROM customer_review cr
       LEFT JOIN customers c ON c.customer_id = cr.customer_id OR c.id = cr.customer_id
      WHERE cr.order_id = :id
      ORDER BY COALESCE(cr.review_id, cr.id) ASC`,
    { id: orderId },
  ).then((rows) => rows.map((row) => normalizeNumericFields(row, ['id', 'order_id', 'customer_id', 'vendor_id', 'service_id', 'rating', 'status']))).catch(() => []);
}
async function legacyCustomerProjectDetailPayload(orderId: number | string) {
  const out: any = await projectSvc.getProject(orderId);
  const plans = (out?.plan ?? []).map(normalizeCustomerPlanRow);
  const project = out?.project ?? {};
  const [steps, materials, orderMain, reviews] = await Promise.all([
    query<any>(
      `SELECT id, order_id, step, step_status, performed_by, performed_by_id, remarks, created_at, updated_at
         FROM order_step_logs
        WHERE order_id = :id
        ORDER BY step ASC, id ASC`,
      { id: orderId },
    ).then((rows) => rows.map(normalizeCustomerStepLogRow)).catch(() => []),
    legacyCustomerMaterialRows(orderId),
    one<any>(
      `SELECT COALESCE(o.id, o.order_id) AS id,
              CAST(o.service_id AS UNSIGNED) AS service_id,
              CAST(o.vendor_id AS UNSIGNED) AS vendor_id,
              CAST(o.customer_id AS UNSIGNED) AS customer_id,
              v.company_name,
              COALESCE(vs.service_title, vs.title) AS service_title,
              vs.price,
              COALESCE(vs.unit_name, vs.unit) AS unit_name,
              vs.pricing_type,
              vs.description,
              COALESCE(vs.service_image, vs.thumbnail, '') AS service_image,
              vs.minimum_fee
         FROM orders o
         LEFT JOIN vendors v ON v.vendor_id = o.vendor_id OR v.id = o.vendor_id
         LEFT JOIN vendor_services vs ON vs.vendor_service_id = o.service_id OR vs.id = o.service_id
        WHERE o.order_id = :id
        LIMIT 1`,
      { id: orderId },
    ).catch(() => null),
    legacyCustomerReviewRows(orderId),
  ]);
  return {
    data: plans,
    project,
    steps,
    ordermaterials: materials,
    ordersMain: orderMain ? [orderMain] : [],
    order_plan: plans,
    review: reviews,
  };
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
    `SELECT COALESCE(id, customer_id) AS id,
            COALESCE(name, '') AS name,
            COALESCE(email, '') AS email,
            COALESCE(ph_code, '+91') AS ph_code,
            COALESCE(phone, mobile, '') AS phone,
            COALESCE(status, '') AS status,
            created_at,
            updated_at,
            COALESCE(CAST(state AS CHAR), '') AS state,
            COALESCE(CAST(city AS CHAR), '') AS city,
            COALESCE(CAST(pincode AS CHAR), '') AS pincode,
            COALESCE(address, '') AS address,
            COALESCE(profile_photo, profile_image, '') AS profile_photo,
            COALESCE(device_id, '') AS device_id,
            COALESCE(otp, '') AS otp,
            COALESCE(CAST(otp_expires_at AS CHAR), '') AS otp_expires_at,
            COALESCE(otp_attempts, 0) AS otp_attempts,
            COALESCE(CAST(last_otp_sent_at AS CHAR), '') AS last_otp_sent_at,
            COALESCE(terms_accept, 1) AS terms_accept,
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

function normalizeQuotationRow(row: any) {
  const out = normalizeNumericFields(row, [
    'id',
    'quotation_id',
    'enquiry_id',
    'customer_id',
    'vendor_id',
    'service_id',
    'estimated_days',
  ]);
  out.status = intOrDefault(row.status_int ?? row.status);
  if ('status_int' in out) out.status_int = intOrDefault(row.status_int ?? out.status);
  return out;
}

function normalizeOrderRow(row: any) {
  const out = normalizeNumericFields(row, [
    'id',
    'order_id',
    'customer_id',
    'vendor_id',
    'enquiry_id',
    'quotation_id',
    'service_id',
  ]);
  out.id = intOrNull(row.id) ?? intOrNull(row.order_id);
  out.status = intOrDefault(row.status_int ?? row.status);
  if ('status_int' in out) out.status_int = intOrDefault(row.status_int ?? out.status);
  out.ordersteps = (row.ordersteps ?? []).map(normalizeCustomerStepLogRow);
  return out;
}

function normalizeEnquiryRow(row: any) {
  const out = normalizeNumericFields(row, [
    'enquiry_id',
    'customer_id',
    'vendor_id',
    'service_id',
  ]);
  out.status = intOrDefault(row.status);
  out.quotations = (row.quotations ?? []).map(normalizeQuotationRow);
  out.orders = (row.orders ?? []).map(normalizeOrderRow);
  return out;
}

async function legacyQuotationRows(enquiryId: number | string) {
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
  return rows.map(normalizeQuotationRow);
}

async function legacyCustomerOrderRows(enquiryId: number | string) {
  const orders = await query<any>(
    `SELECT * FROM orders WHERE enquiry_id = :id ORDER BY order_id DESC`,
    { id: enquiryId },
  ).catch(() => []);
  if (!orders.length) return [];

  const orderIds = orders
    .map((order: any) => intOrNull(order.order_id) ?? intOrNull(order.id))
    .filter((id: number | null): id is number => id !== null);
  const steps = orderIds.length
    ? await query<any>(
        `SELECT id, order_id, step, step_status, performed_by, performed_by_id,
                remarks, created_at, updated_at
           FROM order_step_logs
          WHERE order_id IN (:ids)
          ORDER BY order_id ASC, step ASC, id ASC`,
        { ids: orderIds },
      ).catch(() => [])
    : [];

  return orders.map((order: any) => {
    const id = intOrNull(order.id) ?? intOrNull(order.order_id);
    const orderId = intOrNull(order.order_id) ?? id;
    return {
      ...order,
      id,
      ordersteps: steps.filter((step: any) => Number(step.order_id) === Number(orderId)),
    };
  });
}

async function legacyCustomerEnquiryRows(customerId: number | string, enquiryId?: string) {
  const where = enquiryId
    ? `e.customer_id = :customerId AND e.enquiry_id = :enquiryId`
    : `e.customer_id = :customerId`;
  const rows = await query<any>(
    `SELECT CAST(COALESCE(e.id, e.enquiry_id) AS UNSIGNED) AS enquiry_id,
            CAST(e.customer_id AS UNSIGNED) AS customer_id,
            COALESCE(e.first_name, c.name) AS first_name,
            COALESCE(e.last_name, '') AS last_name,
            COALESCE(e.email, c.email) AS email,
            COALESCE(e.phone, c.phone, c.mobile) AS phone,
            COALESCE(e.message, e.description) AS message,
            e.files,
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
            COALESCE(vs.unit_name, vs.unit) AS unit_name,
            vs.pricing_type,
            vs.description AS description,
            COALESCE(vs.service_image, vs.thumbnail) AS service_image,
            vs.minimum_fee
       FROM enquiries e
       LEFT JOIN customers c ON c.customer_id = e.customer_id
       LEFT JOIN vendors v ON v.vendor_id = e.vendor_id
       LEFT JOIN vendor_services vs ON vs.vendor_service_id = e.service_id OR vs.id = e.service_id
       LEFT JOIN status_master sm ON sm.id = CAST(${enquiryStatusExpr('e')} AS UNSIGNED)
      WHERE ${where}
      ORDER BY COALESCE(e.id, e.enquiry_id) DESC`,
    { customerId, enquiryId },
  );
  return Promise.all(rows.map(async (row: any) => {
    return normalizeEnquiryRow({
      ...row,
      quotations: await legacyQuotationRows(row.enquiry_id),
      orders: await legacyCustomerOrderRows(row.enquiry_id),
    });
  }));
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
    const vendorRows = await query<any>(
      `SELECT
          COALESCE(id, vendor_id) AS id,
          name,
          COALESCE(ph_code, '+91') AS ph_code,
          COALESCE(phone, mobile, '') AS phone,
          email,
          company_name,
          COALESCE(full_name, owner_name, name) AS full_name,
          COALESCE(CAST(state AS CHAR), '') AS state,
          COALESCE(CAST(city AS CHAR), '') AS city,
          COALESCE(CAST(pincode AS CHAR), '') AS pincode,
          COALESCE(address, '') AS address,
          COALESCE(profile_photo, profile_image, '') AS profile_photo,
          COALESCE(CAST(service_tag AS CHAR), '') AS service_tag,
          COALESCE(CAST(service_category AS CHAR), '') AS service_category,
          COALESCE(CAST(sub_service AS CHAR), '') AS sub_service,
          COALESCE(years_of_experience, experience_years, 0) AS years_of_experience,
          COALESCE(short_bio, about, '') AS short_bio,
          COALESCE(languages, '') AS languages,
          COALESCE(area_of_service, '') AS area_of_service,
          COALESCE(working_hours_from, '') AS working_hours_from,
          COALESCE(working_hours_to, '') AS working_hours_to,
          COALESCE(willing_to_travel, 0) AS willing_to_travel,
          COALESCE(tools_available, '') AS tools_available,
          CAST(IFNULL((SELECT ROUND(AVG(cr.rating), 1)
                         FROM customer_reviews cr
                        WHERE cr.vendor_id = vendors.vendor_id AND COALESCE(cr.status, 1) = 1), 0) AS CHAR) AS rating,
          (SELECT COUNT(*)
             FROM customer_reviews cr
            WHERE cr.vendor_id = vendors.vendor_id AND COALESCE(cr.status, 1) = 1) AS review_count
        FROM vendors
       WHERE (vendor_id = :id OR id = :id)
         AND COALESCE(is_deleted, 0) = 0
       LIMIT 1`,
      { id: vendorId },
    );
    if (!vendorRows.length) {
      return res.status(200).json({ success: false, message: 'Vendor not found' });
    }

    const where = [
      `COALESCE(vs.is_active, vs.status, 1) = 1`,
      `COALESCE(vs.is_deleted, 0) = 0`,
      `COALESCE(v.is_deleted, 0) = 0`,
      `vs.vendor_id = :vendorId`,
    ];
    const params: Record<string, any> = { vendorId };
    const categoryId = pickId(req.body, 'category_id', 'categoryId');
    if (categoryId) {
      where.push(`COALESCE(vs.service_category, vs.category_id) = :categoryId`);
      params.categoryId = categoryId;
    }
    const serviceRows = await query<any>(
      `${legacyServiceSelect}
        WHERE ${where.join(' AND ')}
        ORDER BY COALESCE(vs.id, vs.vendor_service_id) DESC`,
      params,
    ).catch(() => []);
    const service = serviceRows.map((row: any) => {
      const item = normalizeLegacyService(row, true);
      item.booking_count = Number(row?.booking_count ?? 0);
      return item;
    });
    const category = await query<any>(
      `SELECT
          CAST(sc.category_id AS UNSIGNED) AS category_id,
          sc.name AS category_name,
          sc.icon_url,
          COUNT(vs.vendor_service_id) AS service_count
        FROM vendor_services vs
        INNER JOIN service_categories sc
          ON sc.category_id = CAST(COALESCE(vs.service_category, vs.category_id) AS UNSIGNED)
       WHERE vs.vendor_id = :vendorId
         AND COALESCE(vs.is_active, vs.status, 1) = 1
         AND COALESCE(vs.is_deleted, 0) = 0
       GROUP BY sc.category_id, sc.name, sc.icon_url
       ORDER BY sc.name ASC`,
      { vendorId },
    ).catch(() => []);
    const showReviews = service.some((row: any) => String(row?.show_review ?? '1') === '1');
    const review = showReviews
      ? await query<any>(
          `SELECT
              CAST(COALESCE(cr.id, cr.review_id) AS UNSIGNED) AS id,
              CAST(cr.customer_id AS UNSIGNED) AS customer_id,
              CAST(cr.vendor_id AS UNSIGNED) AS vendor_id,
              CAST(cr.service_id AS UNSIGNED) AS service_id,
              CAST(cr.rating AS UNSIGNED) AS rating,
              cr.review_description,
              CAST(COALESCE(cr.status, 1) AS UNSIGNED) AS status,
              cr.created_at,
              cr.updated_at,
              c.name AS customer_name
             FROM customer_reviews cr
             LEFT JOIN customers c ON c.customer_id = cr.customer_id OR c.id = cr.customer_id
            WHERE cr.vendor_id = :vendorId
              AND COALESCE(cr.status, 1) = 1
            ORDER BY COALESCE(cr.id, cr.review_id) DESC`,
          { vendorId },
        ).catch(() => [])
      : [];

    return res.status(200).json({
      success: true,
      data: vendorRows,
      category,
      service,
      review,
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
    const uniqueRows = uniqueCityRows(rows);
    res.status(200).json({ success: true, city: uniqueRows, data: uniqueRows });
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
      name: req.body?.name, email: req.body?.email,
      state: req.body?.state ?? req.body?.state_id ?? req.body?.stateId,
      city: req.body?.city,
      address: req.body?.address, pincode: req.body?.pincode,
      profile_image: req.body?.profile_image || req.body?.profile_photo || req.body?.profile_photo_url,
      profile_photo: req.body?.profile_photo || req.body?.profile_photo_url,
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
    const data = await legacyCustomerEnquiryRows(req.user!.id, enquiryId);
    if (!data.length) {
      res.status(200).json({ success: false, message: 'Enquiry not found', data: [] });
      return;
    }
    res.status(200).json({ success: true, data });
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

async function createLegacyPlaceOrder(req: AuthRequest) {
  const body = req.body ?? {};
  const required: Array<{ name: string; keys: string[]; allowEmpty?: boolean }> = [
    { name: 'enquiry_id', keys: ['enquiry_id', 'enquiryId'] },
    { name: 'quote_id', keys: ['quote_id', 'quotation_id', 'quoteId', 'quotationId'] },
    { name: 'service_id', keys: ['service_id', 'serviceId'] },
    { name: 'vendor_id', keys: ['vendor_id', 'vendorId'] },
    { name: 'message', keys: ['message'], allowEmpty: true },
    { name: 'files', keys: ['files'], allowEmpty: true },
    { name: 'currency', keys: ['currency'] },
    { name: 'payment_id', keys: ['payment_id', 'razorpay_payment_id'], allowEmpty: true },
    { name: 'payment_json', keys: ['payment_json'], allowEmpty: true },
    { name: 'payment_status', keys: ['payment_status', 'paymentStatus'] },
    { name: 'order_amount', keys: ['order_amount', 'orderAmount', 'amount'] },
    { name: 'payment_type', keys: ['payment_type', 'paymentType'] },
    { name: 'platform_cost', keys: ['platform_cost', 'platformCost'] },
    { name: 'tax_cost', keys: ['tax_cost', 'taxCost'] },
  ];
  const missing = required
    .filter((item) => !item.keys.some((key) => hasBodyKey(body, key))
      || (!item.allowEmpty && !pickString(body, ...item.keys).trim()))
    .map((item) => item.name);
  if (missing.length) throw new ApiError(400, `Missing required fields: ${missing.join(', ')}`);

  const customerId = req.user!.id;
  const enquiryId = toNumberSafe(pickId(body, 'enquiry_id', 'enquiryId'));
  const quoteId = toNumberSafe(pickId(body, 'quote_id', 'quotation_id', 'quoteId', 'quotationId'));
  const serviceId = toNumberSafe(pickId(body, 'service_id', 'serviceId'));
  const vendorId = toNumberSafe(pickId(body, 'vendor_id', 'vendorId'));
  const amount = toNumberSafe(body?.order_amount ?? body?.orderAmount ?? body?.amount);
  if (!enquiryId || !quoteId || !serviceId || !vendorId || !amount) {
    throw new ApiError(400, 'enquiry_id, quote_id, service_id, vendor_id and order_amount are required');
  }

  const enquiry = await one<any>(
    `SELECT enquiry_id, customer_id, vendor_id, service_id
       FROM enquiries
      WHERE enquiry_id = :enquiryId AND customer_id = :customerId
      LIMIT 1`,
    { enquiryId, customerId },
  );
  if (!enquiry) throw new ApiError(403, 'Enquiry not found');
  if (enquiry.vendor_id && Number(enquiry.vendor_id) !== vendorId) throw new ApiError(400, 'vendor_id mismatch');

  const quote = await one<any>(
    `SELECT quotation_id, id, enquiry_id, vendor_id, amount, status
       FROM quotation
      WHERE enquiry_id = :enquiryId
        AND (quotation_id = :quoteId OR id = :quoteId)
      LIMIT 1`,
    { enquiryId, quoteId },
  );
  if (!quote) throw new ApiError(404, 'Quote not found');

  const currency = pickString(body, 'currency') || 'INR';
  const paymentJsonBody = objectFromJsonish(body?.payment_json);
  const paymentId = pickString(body, 'payment_id', 'razorpay_payment_id')
    || String(paymentJsonBody.razorpay_payment_id || '');
  const paymentJson = jsonStringOrNull(body?.payment_json);
  const paymentStatus = pickString(body, 'payment_status', 'paymentStatus') || 'pending';
  const paymentStatusLower = paymentStatus.toLowerCase();
  const isPaid = ['success', 'paid', 'completed'].includes(paymentStatusLower) && !!paymentId;
  const paymentType = pickString(body, 'payment_type', 'paymentType') || 'place_order';
  const message = pickString(body, 'message');
  const files = pickString(body, 'files');
  const platformCost = toNumberSafe(body?.platform_cost ?? body?.platformCost);
  const taxCost = toNumberSafe(body?.tax_cost ?? body?.taxCost);
  const convenienceFeeCost = toNumberSafe(body?.convenience_fee_cost ?? body?.convenienceFeeCost);
  const baseAmount = toNumberSafe(
    body?.base_amount ?? body?.baseAmount,
    Math.max(0, amount - platformCost - taxCost - convenienceFeeCost) || amount,
  );
  const paymentKey = pickString(body, 'payment_key', 'razorpay_key', 'key_id');
  const paymentSecret = pickString(body, 'payment_secret', 'razorpay_secret', 'key_secret');
  const idempotencyKey = String(
    body?.idempotency_key ||
    req.headers['idempotency-key'] ||
    `legacy-place-${customerId}-${enquiryId}-${quoteId}-${amount}`,
  ).slice(0, 100);

  const existingIntent = await one<any>(
    `SELECT intent_id, razorpay_order_id
       FROM payment_intents
      WHERE idempotency_key = :key
      LIMIT 1`,
    { key: idempotencyKey },
  ).catch(() => null);
  const existingRazorpayOrderId = String(
    body?.razorpay_order_id || paymentJsonBody.razorpay_order_id || '',
  ).trim();
  const razorpayOrder = existingIntent?.razorpay_order_id
    ? { id: existingIntent.razorpay_order_id, amount: Math.round(amount * 100), currency, status: 'created' }
    : isPaid
      ? {
          id: existingRazorpayOrderId || `paid_${paymentId}`.slice(0, 120),
          amount: Math.round(amount * 100),
          currency,
          status: 'paid',
        }
    : await createRazorpayOrder({
        amount,
        currency,
        receipt: idempotencyKey.slice(0, 40),
        notes: {
          customer_id: String(customerId),
          enquiry_id: String(enquiryId),
          quote_id: String(quoteId),
          payment_type: paymentType,
        },
        keyId: paymentKey || undefined,
        keySecret: paymentSecret || undefined,
      });

  let orderId = 0;
  let intentId = existingIntent?.intent_id ? Number(existingIntent.intent_id) : 0;
  await transaction(async (conn) => {
    const [existingOrders]: any = await conn.query(
      `SELECT order_id FROM orders
        WHERE customer_id = ?
          AND enquiry_id = ?
          AND (quotation_id = ? OR quote_id = ?)
        LIMIT 1`,
      [customerId, enquiryId, quoteId, quoteId],
    );
    const existingOrderId = Array.isArray(existingOrders) ? existingOrders[0]?.order_id : null;
    if (existingOrderId) {
      orderId = Number(existingOrderId);
      await conn.query(
        `UPDATE orders
            SET vendor_id = ?, quotation_id = ?, quote_id = ?, service_id = ?,
                message = ?, files = ?, amount = ?, order_amount = ?,
                currency = ?, payment_id = ?, payment_json = ?, payment_status = ?,
                status = CASE WHEN ? = 'success' THEN 'active' ELSE COALESCE(status, 'pending') END
          WHERE order_id = ?`,
        [
          vendorId, quoteId, quoteId, serviceId,
          message, files, amount, String(body?.order_amount ?? body?.orderAmount ?? body?.amount),
          currency, paymentId, paymentJson, paymentStatus,
          paymentStatusLower, orderId,
        ],
      );
    } else {
      const [insertOrder]: any = await conn.query(
        `INSERT INTO orders
           (customer_id, vendor_id, enquiry_id, quotation_id, quote_id, service_id,
            message, files, amount, order_amount, currency, payment_id,
            payment_json, payment_status, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          customerId, vendorId, enquiryId, quoteId, quoteId, serviceId,
          message, files, amount, String(body?.order_amount ?? body?.orderAmount ?? body?.amount),
          currency, paymentId, paymentJson, paymentStatus,
          paymentStatusLower === 'success' ? 'active' : 'pending',
        ],
      );
      orderId = Number(insertOrder.insertId);
      await conn.query(`UPDATE orders SET id = order_id WHERE order_id = ? AND (id IS NULL OR id = 0)`, [orderId]);
    }

    await conn.query(`UPDATE quotation SET status = 'accepted' WHERE quotation_id = ? OR id = ?`, [quoteId, quoteId]);
    await conn.query(`UPDATE enquiries SET status = 'accepted' WHERE enquiry_id = ?`, [enquiryId]);
    const [stepRows]: any = await conn.query(
      `SELECT id FROM order_step_logs WHERE order_id = ? AND step = 1 LIMIT 1`,
      [orderId],
    );
    if (!Array.isArray(stepRows) || stepRows.length === 0) {
      await conn.query(
        `INSERT INTO order_step_logs (order_id, step, step_status, performed_by, performed_by_id, remarks)
         VALUES (?, 1, '1', 'CUSTOMER', ?, 'Order placed')`,
        [orderId, customerId],
      );
    }

    if (intentId) {
      await conn.query(
        `UPDATE payment_intents
            SET order_id = ?, enquiry_id = ?, amount = ?, status = ?,
                razorpay_order_id = ?, razorpay_payment_id = COALESCE(?, razorpay_payment_id)
          WHERE intent_id = ?`,
        [orderId, enquiryId, amount, isPaid ? 'escrow_held' : 'initiated', razorpayOrder.id, paymentId || null, intentId],
      );
    } else {
      const [insertIntent]: any = await conn.query(
        `INSERT INTO payment_intents
           (idempotency_key, customer_id, order_id, enquiry_id, amount, purpose, status,
            razorpay_order_id, razorpay_payment_id)
         VALUES (?, ?, ?, ?, ?, 'quote', ?, ?, ?)`,
        [idempotencyKey, customerId, orderId, enquiryId, amount, isPaid ? 'escrow_held' : 'initiated', razorpayOrder.id, paymentId || null],
      );
      intentId = Number(insertIntent.insertId);
    }

    if (isPaid && intentId) {
      const [existingHoldRows]: any = await conn.query(
        `SELECT entry_id FROM escrow_ledger WHERE intent_id = ? AND direction = 'hold' LIMIT 1`,
        [intentId],
      );
      if (!Array.isArray(existingHoldRows) || existingHoldRows.length === 0) {
        await conn.query(
          `INSERT INTO escrow_ledger (intent_id, order_id, vendor_id, amount, direction, reason)
           VALUES (?, ?, ?, ?, 'hold', ?)`,
          [intentId, orderId, vendorId, amount, paymentType],
        );
      }
    }

    await conn.query(
      `INSERT INTO payment_log
         (order_id, customer_id, vendor_id, amount, status, provider, provider_payment_id,
          notes, currency, payment_id, payment_json, payment_status, base_amount,
          payment_amount, payment_date, payment_data, payment_type, convenience_fee_cost,
          platform_cost, tax_cost)
       VALUES (?, ?, ?, ?, ?, 'razorpay', ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?)`,
      [
        orderId, customerId, vendorId, amount, paymentStatus, paymentId || null,
        message, currency, paymentId || null, paymentJson, paymentStatus,
        baseAmount, amount, paymentJson, paymentType, convenienceFeeCost, platformCost, taxCost,
      ],
    );
  });

  try {
    await notifSvc.notify({
      recipient_type: 'vendor',
      recipient_id: vendorId,
      type: 'order_placed',
      title: 'New order placed',
      body: 'A customer has placed an order for your service.',
      data: { order_id: orderId, enquiry_id: enquiryId, quote_id: quoteId, service_id: serviceId },
    });
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error('[customer/placeOrder] notification_failed', {
      order_id: orderId,
      enquiry_id: enquiryId,
      vendor_id: vendorId,
      message: err?.message || String(err),
    });
  }

  return {
    id: orderId,
    order_id: orderId,
    customer_id: Number(customerId),
    vendor_id: vendorId,
    enquiry_id: enquiryId,
    quote_id: quoteId,
    quotation_id: quoteId,
    service_id: serviceId,
    message,
    files,
    currency,
    payment_id: paymentId,
    payment_json: body?.payment_json ?? '',
    payment_status: paymentStatus,
    order_amount: String(body?.order_amount ?? body?.orderAmount ?? body?.amount),
    base_amount: baseAmount,
    amount,
    payment_type: paymentType,
    convenience_fee_cost: String(body?.convenience_fee_cost ?? body?.convenienceFeeCost ?? ''),
    platform_cost: String(body?.platform_cost ?? body?.platformCost),
    tax_cost: String(body?.tax_cost ?? body?.taxCost),
    intent_id: intentId,
    razorpay_order_id: razorpayOrder.id,
    razorpay_amount: razorpayOrder.amount,
    razorpay_currency: razorpayOrder.currency,
    payment_key: paymentKey || null,
    razorpay_key: paymentKey || null,
  };
}

async function applyLegacyPaymentBalanceUpdate(conn: any, paymentType: string, orderId: number, paymentData: any[], availableAmount: number) {
  const type = String(paymentType || '').toLowerCase();
  const table = type === 'material'
    ? 'order_plan_materials'
    : type === 'plan'
      ? 'order_plan'
      : '';
  if (!table || !paymentData.length || availableAmount <= 0) return paymentData;

  let remaining = availableAmount;
  const updatedRows: any[] = [];
  for (const item of paymentData) {
    const id = toNumberSafe(item?.id ?? item?.plan_id ?? item?.material_id);
    if (!id) {
      updatedRows.push(item);
      continue;
    }
    const [rows]: any = await conn.query(
      table === 'order_plan_materials'
        ? `SELECT id, balance_cost, total_cost FROM order_plan_materials WHERE id = ? AND order_id = ? LIMIT 1`
        : `SELECT COALESCE(plan_id, id) AS id, balance_cost, amount FROM order_plan
            WHERE (plan_id = ? OR id = ?) AND order_id = ? LIMIT 1`,
      table === 'order_plan_materials' ? [id, orderId] : [id, id, orderId],
    );
    const dbRow = Array.isArray(rows) ? rows[0] : null;
    const currentBalance = toNumberSafe(
      dbRow?.balance_cost ?? item?.balance_cost ?? item?.total_cost ?? item?.amount,
      0,
    );
    const applyAmount = Math.min(remaining, currentBalance || remaining);
    const nextBalance = Math.max(0, currentBalance - applyAmount);
    remaining = Math.max(0, remaining - applyAmount);
    if (table === 'order_plan_materials') {
      await conn.query(
        `UPDATE order_plan_materials
            SET balance_cost = ?,
                payment_status = CASE WHEN ? = 0 THEN 'PAID' ELSE COALESCE(payment_status, 'UNPAID') END,
                status = CASE WHEN ? = 0 THEN 'PAID' ELSE COALESCE(status, 'UNPAID') END,
                updated_at = NOW()
          WHERE id = ? AND order_id = ?`,
        [nextBalance, nextBalance, nextBalance, id, orderId],
      );
    } else {
      await conn.query(
        `UPDATE order_plan
            SET balance_cost = ?,
                status = CASE WHEN ? = 0 THEN 10 ELSE COALESCE(status, 1) END,
                updated_at = NOW()
          WHERE (plan_id = ? OR id = ?) AND order_id = ?`,
        [nextBalance, nextBalance, id, id, orderId],
      );
    }
    updatedRows.push({ ...item, balance_cost: nextBalance.toFixed(2) });
    if (remaining <= 0) {
      updatedRows.push(...paymentData.slice(updatedRows.length));
      break;
    }
  }
  return updatedRows;
}

async function handleLegacyPaymentUpdate(req: AuthRequest) {
  const body = req.body ?? {};
  const orderId = toNumberSafe(pickId(body, 'order_id', 'orderId'));
  if (!orderId) throw new ApiError(400, 'order_id required');
  const customerId = req.user!.id;
  const order = await one<any>(
    `SELECT order_id, customer_id, vendor_id
       FROM orders
      WHERE (order_id = :orderId OR id = :orderId)
        AND customer_id = :customerId
      LIMIT 1`,
    { orderId, customerId },
  );
  if (!order) throw new ApiError(404, 'Order not found');

  const paymentStatus = pickString(body, 'payment_status', 'paymentStatus') || 'success';
  if (paymentStatus.toLowerCase() === 'failed') {
    return { message: 'Payment failed' };
  }

  const paymentJsonBody = objectFromJsonish(body?.payment_json);
  const paymentData = arrayFromJsonish(body?.payment_data);
  const paymentId = pickString(body, 'payment_id', 'razorpay_payment_id')
    || String(paymentJsonBody.razorpay_payment_id || '');
  const paymentType = pickString(body, 'payment_type', 'paymentType') || 'material';
  const paymentAmount = toNumberSafe(body?.payment_amount ?? body?.paymentAmount ?? body?.amount);
  const convenienceFeeCost = toNumberSafe(body?.convenience_fee_cost ?? body?.convenienceFeeCost);
  const platformCost = toNumberSafe(body?.platform_cost ?? body?.platformCost);
  const taxCost = toNumberSafe(body?.tax_cost ?? body?.taxCost);
  const baseAmount = toNumberSafe(
    body?.base_amount ?? body?.baseAmount,
    Math.max(0, paymentAmount - convenienceFeeCost - platformCost - taxCost),
  );
  const balanceApplyAmount = Math.max(0, paymentAmount - convenienceFeeCost - platformCost - taxCost) || baseAmount || paymentAmount;
  const currency = pickString(body, 'currency') || 'INR';
  const notes = pickString(body, 'notes') || `${paymentType} payment`;
  const paymentJson = jsonStringOrNull(body?.payment_json);

  await transaction(async (conn) => {
    const updatedPaymentData = await applyLegacyPaymentBalanceUpdate(
      conn,
      paymentType,
      orderId,
      paymentData,
      balanceApplyAmount,
    );
    const paymentDataJson = updatedPaymentData.length ? JSON.stringify(updatedPaymentData) : jsonStringOrNull(body?.payment_data);
    await conn.query(
      `INSERT INTO payment_log
         (order_id, customer_id, vendor_id, amount, status, provider, provider_payment_id,
          notes, currency, payment_id, payment_json, payment_status, convenience_fee_cost,
          base_amount, payment_amount, payment_date, payment_data, payment_type,
          platform_cost, tax_cost)
       VALUES (?, ?, ?, ?, ?, 'razorpay', ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?)`,
      [
        orderId, customerId, Number(order.vendor_id), paymentAmount, paymentStatus,
        paymentId || null, notes, currency, paymentId || null, paymentJson,
        paymentStatus, convenienceFeeCost, baseAmount, paymentAmount,
        paymentDataJson, paymentType, platformCost, taxCost,
      ],
    );
  });

  try {
    await notifSvc.notify({
      recipient_type: 'vendor',
      recipient_id: Number(order.vendor_id),
      type: 'payment_update',
      title: 'Payment received',
      body: 'A customer payment was updated for your order.',
      data: { order_id: orderId, payment_type: paymentType, payment_id: paymentId },
    });
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error('[customer/payment_update] notification_failed', {
      order_id: orderId,
      vendor_id: Number(order.vendor_id),
      message: err?.message || String(err),
    });
  }

  return { message: 'Place Order Successfully' };
}

/* ───── Payments — placeOrder + payment_update use canonical escrow ───── */
legacyCustomerRouter.post('/placeOrder', async (req: AuthRequest, res, next) => {
  try {
    if (legacyPlaceOrderPayload(req.body)) {
      const data = await createLegacyPlaceOrder(req);
      return send(res, {
        message: 'Place Order Successfully',
        data,
        order_id: data.order_id,
        id: data.id,
        intent_id: data.intent_id,
        razorpay_order_id: data.razorpay_order_id,
        amount: data.amount,
        payment_key: data.payment_key,
        razorpay_key: data.razorpay_key,
      });
    }

    const enquiryId = toNumberSafe(pickId(req.body, 'enquiry_id', 'enquiryId'));
    const orderId = toNumberSafe(pickId(req.body, 'order_id', 'orderId'));
    const milestoneId = toNumberSafe(pickId(req.body, 'milestone_id', 'milestoneId', 'plan_id'));
    const amount = toNumberSafe(req.body?.amount ?? req.body?.order_amount ?? req.body?.orderAmount);
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
      currency: req.body?.currency || undefined,
      idempotency_key,
      payment_key: pickString(req.body, 'payment_key', 'razorpay_key', 'key_id') || undefined,
      payment_secret: pickString(req.body, 'payment_secret', 'razorpay_secret', 'key_secret') || undefined,
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
    if (legacyPaymentUpdatePayload(req.body)) {
      const out = await handleLegacyPaymentUpdate(req);
      return send(res, { message: out.message });
    }
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
    send(res, await legacyCustomerProjectDetailPayload(orderId));
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
    const [rawPlan, materials] = await Promise.all([
      query<any>(`SELECT * FROM order_plan WHERE order_id = :id ORDER BY plan_id ASC`, { id: orderId }).catch(() => []),
      legacyCustomerMaterialRows(orderId),
    ]);
    const plan = rawPlan.map(normalizeCustomerPlanRow);
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
      req.body?.comment || req.body?.review_description || undefined,
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
      comment: req.body?.comment || req.body?.review_description || req.body?.review || req.body?.feedback,
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
    if (!quotationId) {
      const vendorId = pickId(req.body, 'vendor_id', 'vendorId');
      if (!vendorId) throw new ApiError(400, 'quotation_id or vendor_id required');
      const enquiry = await enquirySvc.createEnquiry({
        customer_id: req.user!.id,
        vendor_id: vendorId,
        service_id: pickId(req.body, 'service_id', 'serviceId') || null,
        category: req.body?.category || null,
        description: req.body?.description || req.body?.message || 'Quotation requested',
        location: req.body?.location || null,
        email: req.body?.email || null,
        budget: req.body?.budget ? toNumberSafe(req.body.budget) : null,
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
      return send(res, {
        message: 'Quotation request sent to vendor',
        data: enquiry,
        enquiry_id: enquiry?.enquiry_id,
      });
    }
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
    send(res, await legacyCustomerProjectDetailPayload(orderId));
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
