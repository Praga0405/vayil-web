import { Router } from 'express';
import { z } from 'zod';
import { exec, one, query, transaction } from '../db';
import { requireAuth } from '../middleware/auth';
import { idempotent } from '../middleware/idempotency';
import { AuthRequest } from '../types';
import { ApiError, ok } from '../utils/http';
import { calculateTax } from '../services/tax';
import { releaseEscrow } from './payments';

export const customerRouter = Router();
customerRouter.use(requireAuth(['customer']));

customerRouter.get('/me', async (req: AuthRequest, res, next) => {
  try {
    const customer = await one<any>('SELECT * FROM customers WHERE customer_id = :id', { id: req.user!.id });
    ok(res, { customer });
  } catch (err) { next(err); }
});

customerRouter.put('/me', async (req: AuthRequest, res, next) => {
  try {
    const body = z.object({ name: z.string().optional(), email: z.string().email().optional(), city: z.string().optional(), address: z.string().optional() }).parse(req.body);
    await exec(`UPDATE customers SET name = COALESCE(:name, name), email = COALESCE(:email, email), city = COALESCE(:city, city), address = COALESCE(:address, address) WHERE customer_id = :id`, { ...body, id: req.user!.id });
    const customer = await one<any>('SELECT * FROM customers WHERE customer_id = :id', { id: req.user!.id });
    ok(res, { customer });
  } catch (err) { next(err); }
});

customerRouter.get('/vendors', async (req, res, next) => {
  try {
    const vendors = await query<any>(`SELECT vendor_id AS id, name, company_name, city, rating, status FROM vendors WHERE status = 'verified' ORDER BY vendor_id DESC LIMIT 100`);
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
    const body = z.object({ vendorId: z.any().optional(), serviceId: z.any().optional(), category: z.string().optional(), description: z.string().min(5), location: z.string().optional(), email: z.string().email().optional() }).parse(req.body);
    const result = await exec(
      `INSERT INTO enquiries (customer_id, vendor_id, service_id, category, description, location, email, status, created_at)
       VALUES (:customerId, :vendorId, :serviceId, :category, :description, :location, :email, 'new', NOW())`,
      { ...body, customerId: req.user!.id }
    );
    const enquiry = await one<any>('SELECT * FROM enquiries WHERE enquiry_id = :id', { id: result.insertId });
    ok(res, { enquiry }, 201);
  } catch (err) { next(err); }
});

customerRouter.get('/enquiries/:id', async (req: AuthRequest, res, next) => {
  try {
    const enquiry = await one<any>('SELECT * FROM enquiries WHERE enquiry_id = :id AND customer_id = :customerId', { id: req.params.id, customerId: req.user!.id });
    const quotes = await query<any>('SELECT * FROM quotation WHERE enquiry_id = :id ORDER BY quotation_id DESC', { id: req.params.id });
    ok(res, { enquiry, quotes });
  } catch (err) { next(err); }
});

customerRouter.get('/projects', async (req: AuthRequest, res, next) => {
  try {
    const projects = await query<any>('SELECT * FROM orders WHERE customer_id = :id ORDER BY order_id DESC', { id: req.user!.id });
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
    await exec(`UPDATE order_plan SET customer_status = 'approved', updated_at = NOW() WHERE plan_id = :milestoneId AND order_id = :id`, { milestoneId: req.params.milestoneId, id: req.params.id });
    ok(res, { message: 'Milestone approved' });
  } catch (err) { next(err); }
});

customerRouter.get('/payments', async (req: AuthRequest, res, next) => {
  try {
    const payments = await query<any>('SELECT * FROM payment_log WHERE customer_id = :id ORDER BY id DESC', { id: req.user!.id });
    ok(res, { payments });
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
        `UPDATE quotation SET status = 'accepted' WHERE quotation_id = ?`,
        [quotation_id],
      );
      // Reject any sibling quotes on the same enquiry so the customer can't
      // accept two at once.
      await conn.query(
        `UPDATE quotation SET status = 'rejected'
           WHERE enquiry_id = ? AND quotation_id <> ? AND status = 'sent'`,
        [enquiry_id, quotation_id],
      );
      await conn.query(
        `UPDATE enquiries SET status = 'accepted' WHERE enquiry_id = ?`,
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
      `UPDATE quotation SET status = 'rejected', message = COALESCE(:reason, message)
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
      `SELECT COUNT(*) AS n FROM order_plan WHERE order_id = :id AND customer_status = 'approved'`,
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
