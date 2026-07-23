import { Router } from 'express';
import { z } from 'zod';
import { exec, one, query, transaction } from '../db';
import { requireAuth } from '../middleware/auth';
import { idempotent } from '../middleware/idempotency';
import { AuthRequest } from '../types';
import { ApiError, ok } from '../utils/http';
import { calculateTax } from '../services/tax';
import { releaseEscrow } from './payments';
import * as customerSvc from '../services/customerService';
import * as enquirySvc from '../services/enquiryService';

export const customerRouter = Router();
customerRouter.use(requireAuth(['customer']));

function blankToNull(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

customerRouter.get('/me', async (req: AuthRequest, res, next) => {
  try {
    const customer = await one<any>('SELECT * FROM customers WHERE customer_id = :id', { id: req.user!.id });
    ok(res, { customer });
  } catch (err) { next(err); }
});

customerRouter.put('/me', async (req: AuthRequest, res, next) => {
  try {
    const body = z.object({
      name: z.string().optional(),
      customer_name: z.string().optional(),
      email: z.string().optional(),
      email_id: z.string().optional(),
      state: z.union([z.string(), z.number()]).optional(),
      state_id: z.union([z.string(), z.number()]).optional(),
      city: z.union([z.string(), z.number()]).optional(),
      city_id: z.union([z.string(), z.number()]).optional(),
      address: z.string().optional(),
      pincode: z.union([z.string(), z.number()]).optional(),
      profile_image: z.string().optional(),
      profile_photo: z.string().optional(),
      fcm_token: z.string().optional(),
    }).parse(req.body);
    const stateValue = body.state ?? body.state_id;
    const cityValue = body.city ?? body.city_id;

    const customer = await customerSvc.updateCustomer(req.user!.id, {
      name: blankToNull(body.name ?? body.customer_name),
      email: blankToNull(body.email ?? body.email_id),
      state: blankToNull(stateValue),
      city: blankToNull(cityValue),
      address: blankToNull(body.address),
      pincode: blankToNull(body.pincode),
      profile_image: blankToNull(body.profile_image ?? body.profile_photo),
      profile_photo: blankToNull(body.profile_photo ?? body.profile_image),
      fcm_token: blankToNull(body.fcm_token),
    });
    ok(res, { customer });
  } catch (err) { next(err); }
});

customerRouter.get('/vendors', async (req, res, next) => {
  try {
    const vendors = await query<any>(
      `SELECT vendor_id AS id, name, company_name, city, rating, status
         FROM vendors
        WHERE status IN ('verified', 'approved', 'active', 'kyc_approved')
        ORDER BY vendor_id DESC LIMIT 100`,
    );
    ok(res, { vendors });
  } catch (err) { next(err); }
});

customerRouter.get('/vendors/:id', async (req, res, next) => {
  try {
    const vendor = await one<any>('SELECT * FROM vendors WHERE vendor_id = :id', { id: req.params.id });
    const listings = await query<any>('SELECT * FROM vendor_services WHERE vendor_id = :id AND status = 1', { id: req.params.id });
    ok(res, { vendor, listings });
  } catch (err) { next(err); }
});

customerRouter.get('/enquiries', async (req: AuthRequest, res, next) => {
  try {
    const enquiries = await query<any>('SELECT * FROM enquiries WHERE customer_id = :id ORDER BY enquiry_id DESC', { id: req.user!.id });
    ok(res, { enquiries });
  } catch (err) { next(err); }
});

customerRouter.post('/enquiries', async (req: AuthRequest, res, next) => {
  try {
    const body = z.object({
      vendorId: z.any().optional(), vendor_id: z.any().optional(),
      serviceId: z.any().optional(), service_id: z.any().optional(),
      category: z.string().optional(), description: z.string().min(5),
      location: z.string().optional(), email: z.string().email().optional(),
      files: z.string().optional(), preferred_date: z.string().optional(),
    }).parse(req.body);
    const requestedVendorId = body.vendorId ?? body.vendor_id ?? null;
    const requestedServiceId = body.serviceId ?? body.service_id ?? null;
    if (!requestedVendorId) throw new ApiError(400, 'vendor_id required');
    if (!requestedServiceId) throw new ApiError(400, 'service_id required');
    const listing = requestedServiceId
      ? await one<any>(
          `SELECT vendor_id, COALESCE(NULLIF(service_title, ''), NULLIF(title, ''), 'Home Service') AS service_title
             FROM vendor_services
            WHERE (vendor_service_id = :id OR id = :id)
              AND COALESCE(is_deleted, 0) = 0
            LIMIT 1`,
          { id: requestedServiceId },
        )
      : null;
    if (!listing) throw new ApiError(404, 'Service not found');
    if (listing && requestedVendorId && Number(listing.vendor_id) !== Number(requestedVendorId)) {
      throw new ApiError(400, 'Service does not belong to the selected vendor');
    }
    const customer = await one<any>(
      `SELECT name, email, COALESCE(phone, mobile) AS phone
         FROM customers WHERE customer_id = :id LIMIT 1`,
      { id: req.user!.id },
    );
    const saved = await enquirySvc.createEnquiry({
      customer_id: req.user!.id,
      vendor_id: listing?.vendor_id ?? requestedVendorId,
      service_id: requestedServiceId,
      category: listing?.service_title ?? body.category ?? null,
      description: body.description,
      location: body.location ?? null,
      email: body.email ?? customer?.email ?? null,
      preferred_date: body.preferred_date ?? null,
      first_name: customer?.name ?? 'Customer',
      last_name: '',
      phone: customer?.phone ?? '',
      message: body.description,
      files: body.files ?? '',
    });
    ok(res, { enquiry: saved }, 201);
  } catch (err) { next(err); }
});

customerRouter.get('/enquiries/:id', async (req: AuthRequest, res, next) => {
  try {
    const enquiry = await one<any>(
      `SELECT e.*,
              COALESCE(NULLIF(v.company_name, ''), NULLIF(v.name, ''), 'Vendor') AS company_name,
              COALESCE(NULLIF(vs.service_title, ''), NULLIF(vs.title, ''),
                       NULLIF(vsl.service_title, ''), NULLIF(vsl.title, ''),
                       NULLIF(e.category, ''), 'Home Service') AS service_title
         FROM enquiries e
         LEFT JOIN vendors v ON v.vendor_id = e.vendor_id
         LEFT JOIN vendor_services vs ON vs.vendor_service_id = e.service_id
         LEFT JOIN vendor_services vsl ON vsl.id = e.service_id AND vs.vendor_service_id IS NULL
        WHERE e.enquiry_id = :id AND e.customer_id = :customerId`,
      { id: req.params.id, customerId: req.user!.id },
    );
    if (!enquiry) throw new ApiError(404, 'Enquiry not found');
    const quotes = await query<any>('SELECT * FROM quotation WHERE enquiry_id = :id ORDER BY quotation_id DESC', { id: req.params.id });
    ok(res, { enquiry, quotes });
  } catch (err) { next(err); }
});

customerRouter.get('/projects', async (req: AuthRequest, res, next) => {
  try {
    const projects = await query<any>(
      `SELECT o.*,
              COALESCE(NULLIF(v.company_name, ''), NULLIF(v.name, ''), 'Vendor') AS company_name,
              COALESCE(NULLIF(vs.service_title, ''), NULLIF(vs.title, ''),
                       NULLIF(e.category, ''), 'Home Service') AS service_title,
              e.category,
              COALESCE(pay.paid_base_amount, 0) AS paid_base_amount
         FROM orders o
         LEFT JOIN enquiries e ON e.enquiry_id = o.enquiry_id
         LEFT JOIN vendors v ON v.vendor_id = o.vendor_id
         LEFT JOIN vendor_services vs ON vs.vendor_service_id = COALESCE(o.service_id, e.service_id)
         LEFT JOIN (
           SELECT order_id, SUM(COALESCE(base_amount, amount)) AS paid_base_amount
             FROM payment_intents
            WHERE status IN ('escrow_held', 'released')
            GROUP BY order_id
         ) pay ON pay.order_id = o.order_id
        WHERE o.customer_id = :id
        ORDER BY o.order_id DESC`,
      { id: req.user!.id },
    );
    ok(res, { projects });
  } catch (err) { next(err); }
});

customerRouter.get('/projects/:id', async (req: AuthRequest, res, next) => {
  try {
    const project = await one<any>('SELECT * FROM orders WHERE order_id = :id AND customer_id = :customerId', { id: req.params.id, customerId: req.user!.id });
    const plan = await query<any>('SELECT * FROM order_plan WHERE order_id = :id ORDER BY plan_id ASC', { id: req.params.id });
    ok(res, { project, plan });
  } catch (err) { next(err); }
});

customerRouter.post('/projects/:id/milestones/:milestoneId/approve', async (req: AuthRequest, res, next) => {
  try {
    // v4.5.23 — Ownership check. Previously this UPDATE only matched on
    // `plan_id` + `order_id` without verifying that the order belongs to
    // the calling customer. A customer who knew (or guessed) another
    // customer's order_id + plan_id could approve milestones on someone
    // else's project. Authorization bug — closed here.
    const owns = await one<any>(
      `SELECT order_id FROM orders WHERE order_id = :id AND customer_id = :customerId LIMIT 1`,
      { id: req.params.id, customerId: req.user!.id },
    );
    if (!owns) throw new ApiError(404, 'Project not found');
    await exec(
      `UPDATE order_plan
          SET customer_status = 'approved', updated_at = NOW()
        WHERE plan_id = :milestoneId AND order_id = :id`,
      { milestoneId: req.params.milestoneId, id: req.params.id },
    );
    ok(res, { message: 'Milestone approved' });
  } catch (err) { next(err); }
});

customerRouter.get('/payments', async (req: AuthRequest, res, next) => {
  try {
    // v4.5.3: read from payment_intents (current source of truth) so the
    // project detail page can compute "Paid (in escrow)". Falls back to
    // legacy payment_log only if the canonical table has nothing for
    // this customer (so pre-v4 historical rows still surface).
    const intents = await query<any>(
      `SELECT intent_id AS id, customer_id, order_id, enquiry_id, milestone_id,
              quotation_id, COALESCE(base_amount, amount) AS base_amount,
              amount, payment_option, purpose, status,
              razorpay_order_id, razorpay_payment_id, created_at
         FROM payment_intents
        WHERE customer_id = :id
        ORDER BY intent_id DESC`,
      { id: req.user!.id },
    );
    if (intents.length > 0) return ok(res, { payments: intents });
    const legacy = await query<any>(
      `SELECT * FROM payment_log WHERE customer_id = :id ORDER BY id DESC`,
      { id: req.user!.id },
    );
    ok(res, { payments: legacy });
  } catch (err) { next(err); }
});

customerRouter.post('/tax-preview', async (req, res, next) => {
  try {
    const tax = calculateTax(req.body);
    ok(res, { tax });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────────────────────
 *  P0 additions — plan approval/revision, materials list+pay,
 *  signoff, rework, milestone payment request shortcut.
 * ───────────────────────────────────────────────────────────── */

async function assertProjectBelongs(orderId: string | number | undefined | string[], customerId: number | string) {
  const row = await one<any>(
    `SELECT order_id FROM orders WHERE order_id = :id AND customer_id = :customerId LIMIT 1`,
    { id: String(orderId ?? ''), customerId },
  );
  if (!row) throw new ApiError(404, 'Project not found');
}

/* ── Quote (read) ────────────────────────────────────────── */
customerRouter.get('/quotes/:enquiryId', async (req: AuthRequest, res, next) => {
  try {
    const enquiry = await one<any>(
      `SELECT * FROM enquiries WHERE enquiry_id = :id AND customer_id = :cid`,
      { id: req.params.enquiryId, cid: req.user!.id },
    );
    if (!enquiry) throw new ApiError(404, 'Enquiry not found');
    const quotes = await query<any>(
      `SELECT * FROM quotation WHERE enquiry_id = :id ORDER BY quotation_id DESC`,
      { id: req.params.enquiryId },
    );
    ok(res, { enquiry, quotes });
  } catch (err) { next(err); }
});

/* ── Quote accept / reject (canonical) ───────────────────── */
async function assertQuoteBelongs(quoteId: string | number | undefined | string[], customerId: number | string) {
  const row = await one<any>(
    `SELECT q.quotation_id, q.enquiry_id
       FROM quotation q
       JOIN enquiries e ON e.enquiry_id = q.enquiry_id
      WHERE q.quotation_id = :id AND e.customer_id = :customerId
      LIMIT 1`,
    { id: String(quoteId ?? ''), customerId },
  );
  if (!row) throw new ApiError(404, 'Quote not found');
  return row as { quotation_id: number; enquiry_id: number };
}

customerRouter.post('/quotes/:quoteId/accept', async (req: AuthRequest, res, next) => {
  try {
    const { quotation_id, enquiry_id } = await assertQuoteBelongs(req.params.quoteId, req.user!.id);
    await transaction(async (conn) => {
      await conn.query(
        `UPDATE quotation SET status = 'accepted', status_int = 2 WHERE quotation_id = ?`,
        [quotation_id],
      );
      // Reject any sibling quotes on the same enquiry so the customer can't
      // accept two at once.
      await conn.query(
        `UPDATE quotation SET status = 'rejected', status_int = 3
           WHERE enquiry_id = ? AND quotation_id <> ? AND status = 'sent'`,
        [enquiry_id, quotation_id],
      );
      await conn.query(
        `UPDATE enquiries SET status = 'accepted', status_int = 2 WHERE enquiry_id = ?`,
        [enquiry_id],
      );
    });
    ok(res, { quotation_id, enquiry_id, status: 'accepted' });
  } catch (err) { next(err); }
});

customerRouter.post('/quotes/:quoteId/reject', async (req: AuthRequest, res, next) => {
  try {
    const { quotation_id, enquiry_id } = await assertQuoteBelongs(req.params.quoteId, req.user!.id);
    const reason = z.object({ reason: z.string().optional() }).parse(req.body || {}).reason ?? null;
    await exec(
      `UPDATE quotation SET status = 'rejected', status_int = 3, message = COALESCE(:reason, message)
         WHERE quotation_id = :id`,
      { id: quotation_id, reason },
    );
    ok(res, { quotation_id, enquiry_id, status: 'rejected', reason });
  } catch (err) { next(err); }
});

/* ── Plan approve / revision ─────────────────────────────── */
customerRouter.post('/projects/:id/plan/approve', async (req: AuthRequest, res, next) => {
  try {
    await assertProjectBelongs(req.params.id, req.user!.id);
    await transaction(async (conn) => {
      await conn.query(
        `UPDATE order_plan SET customer_status = 'approved' WHERE order_id = ?`,
        [req.params.id],
      );
      await conn.query(
        `UPDATE plan_submissions SET status = 'approved', reviewed_at = NOW()
           WHERE order_id = ? AND status = 'submitted'`,
        [req.params.id],
      );
    });
    ok(res, { order_id: Number(req.params.id), status: 'plan_approved' });
  } catch (err) { next(err); }
});

customerRouter.post('/projects/:id/plan/request-revision', async (req: AuthRequest, res, next) => {
  try {
    await assertProjectBelongs(req.params.id, req.user!.id);
    const { reason } = z.object({ reason: z.string().min(1) }).parse(req.body);
    await transaction(async (conn) => {
      await conn.query(
        `UPDATE order_plan SET customer_status = 'revision_requested', revision_reason = ?
           WHERE order_id = ?`,
        [reason, req.params.id],
      );
      await conn.query(
        `UPDATE plan_submissions SET status = 'revision_requested', reviewed_at = NOW(),
                                       reviewer_note = ?
           WHERE order_id = ? AND status = 'submitted'`,
        [reason, req.params.id],
      );
    });
    ok(res, { order_id: Number(req.params.id), status: 'revision_requested', reason });
  } catch (err) { next(err); }
});

/* ── Materials (customer view + pay) ─────────────────────── */
customerRouter.get('/projects/:id/materials', async (req: AuthRequest, res, next) => {
  try {
    await assertProjectBelongs(req.params.id, req.user!.id);
    const planApproved = await one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM order_plan WHERE order_id = :id AND customer_status IN ('approved', 'awaiting_payment')`,
      { id: req.params.id },
    );
    const locked = !planApproved || Number(planApproved.n) === 0;
    const materials = await query<any>(
      `SELECT * FROM materials WHERE order_id = :id ORDER BY material_id ASC`,
      { id: req.params.id },
    );
    ok(res, { materials, locked });
  } catch (err) { next(err); }
});

// Convenience endpoint: bundles "create payment order for selected materials".
// Frontend can also hit /payments/create-order directly with purpose='materials'.
customerRouter.post('/projects/:id/materials/payment-order',
  idempotent(),
  async (req: AuthRequest, res, next) => {
  try {
    await assertProjectBelongs(req.params.id, req.user!.id);
    const { material_ids } = z.object({ material_ids: z.array(z.number().int()).min(1) }).parse(req.body);
    const rows = await query<any>(
      `SELECT material_id, total FROM materials WHERE order_id = :id AND material_id IN (:ids)`,
      { id: req.params.id, ids: material_ids } as any,
    );
    if (rows.length !== material_ids.length) throw new ApiError(400, 'One or more materials not found');
    const subtotal = rows.reduce((s, r) => s + Number(r.total), 0);
    const tax = calculateTax({ baseAmount: subtotal });
    // Mark items awaiting_payment optimistically — payment verification flips to PAID.
    await exec(
      `UPDATE materials SET status = 'AWAITING_PAYMENT' WHERE material_id IN (:ids)`,
      { ids: material_ids } as any,
    );
    ok(res, { subtotal, tax, total: tax.customerTotal, material_ids });
  } catch (err) { next(err); }
});

/* ── Sign-off / rework ───────────────────────────────────── */
customerRouter.post('/projects/:id/signoff', async (req: AuthRequest, res, next) => {
  try {
    await assertProjectBelongs(req.params.id, req.user!.id);
    const { rating, comment } = z.object({
      rating: z.number().int().min(1).max(5).optional(),
      comment: z.string().optional(),
    }).parse(req.body);

    await transaction(async (conn) => {
      await conn.query(
        `INSERT INTO signoffs (order_id, customer_id, rating, comment)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE rating = VALUES(rating), comment = VALUES(comment)`,
        [req.params.id, req.user!.id, rating ?? null, comment ?? null],
      );
      await conn.query(
        `UPDATE orders SET status = 'completed' WHERE order_id = ?`,
        [req.params.id],
      );
      // Flip the parent enquiry so the vendor's Enquiries → Completed
      // tab populates (matches projectService.signoffOrder).
      await conn.query(
        `UPDATE enquiries e JOIN orders o ON o.enquiry_id = e.enquiry_id
            SET e.status = 'completed' WHERE o.order_id = ?`,
        [req.params.id],
      );
    });

    // Release any held escrow for this order.
    const intents = await query<any>(
      `SELECT intent_id FROM payment_intents WHERE order_id = :id AND status = 'escrow_held'`,
      { id: req.params.id },
    );
    for (const i of intents) await releaseEscrow(i.intent_id);

    ok(res, { order_id: Number(req.params.id), status: 'completed' });
  } catch (err) { next(err); }
});

customerRouter.post('/projects/:id/rework-request', async (req: AuthRequest, res, next) => {
  try {
    await assertProjectBelongs(req.params.id, req.user!.id);
    const { reason } = z.object({ reason: z.string().min(1) }).parse(req.body);
    const result: any = await exec(
      `INSERT INTO rework_requests (order_id, customer_id, reason) VALUES (:id, :cid, :reason)`,
      { id: req.params.id, cid: req.user!.id, reason },
    );
    ok(res, { rework_id: result.insertId, status: 'open' });
  } catch (err) { next(err); }
});
