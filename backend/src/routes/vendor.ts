import { Router } from 'express';
import { z } from 'zod';
import { exec, one, query, transaction } from '../db';
import { requireAuth } from '../middleware/auth';
import { AuthRequest } from '../types';
import { ApiError, ok } from '../utils/http';

export const vendorRouter = Router();
vendorRouter.use(requireAuth(['vendor']));

vendorRouter.get('/me', async (req: AuthRequest, res, next) => {
  try { ok(res, { vendor: await one<any>('SELECT * FROM vendors WHERE vendor_id = :id', { id: req.user!.id }) }); } catch (err) { next(err); }
});

vendorRouter.put('/me', async (req: AuthRequest, res, next) => {
  try {
    const body = z.object({ name: z.string().optional(), company_name: z.string().optional(), email: z.string().email().optional(), city: z.string().optional(), gst_number: z.string().optional(), is_gst_registered: z.boolean().optional() }).parse(req.body);
    await exec(`UPDATE vendors SET name = COALESCE(:name, name), company_name = COALESCE(:company_name, company_name), email = COALESCE(:email, email), city = COALESCE(:city, city), gst_number = COALESCE(:gst_number, gst_number), is_gst_registered = COALESCE(:is_gst_registered, is_gst_registered) WHERE vendor_id = :id`, { ...body, id: req.user!.id });
    ok(res, { vendor: await one<any>('SELECT * FROM vendors WHERE vendor_id = :id', { id: req.user!.id }) });
  } catch (err) { next(err); }
});

vendorRouter.get('/dashboard', async (req: AuthRequest, res, next) => {
  try {
    const [projects, enquiries, wallet] = await Promise.all([
      query<any>('SELECT * FROM orders WHERE vendor_id = :id ORDER BY order_id DESC LIMIT 10', { id: req.user!.id }),
      query<any>('SELECT * FROM enquiries WHERE vendor_id = :id ORDER BY enquiry_id DESC LIMIT 10', { id: req.user!.id }),
      one<any>('SELECT * FROM vendor_wallet WHERE vendor_id = :id', { id: req.user!.id }),
    ]);
    ok(res, { projects, enquiries, wallet });
  } catch (err) { next(err); }
});

vendorRouter.get('/enquiries', async (req: AuthRequest, res, next) => {
  try { ok(res, { enquiries: await query<any>('SELECT * FROM enquiries WHERE vendor_id = :id ORDER BY enquiry_id DESC', { id: req.user!.id }) }); } catch (err) { next(err); }
});

vendorRouter.get('/enquiries/:id', async (req: AuthRequest, res, next) => {
  try {
    const enquiry = await one<any>('SELECT * FROM enquiries WHERE enquiry_id = :id AND vendor_id = :vendorId', { id: req.params.id, vendorId: req.user!.id });
    const quotes = await query<any>('SELECT * FROM quotation WHERE enquiry_id = :id AND vendor_id = :vendorId', { id: req.params.id, vendorId: req.user!.id });
    ok(res, { enquiry, quotes });
  } catch (err) { next(err); }
});

vendorRouter.post('/enquiries/:id/quotes', async (req: AuthRequest, res, next) => {
  try {
    const body = z.object({ amount: z.number(), message: z.string().optional(), estimatedDays: z.number().optional(), validUntil: z.string().optional() }).parse(req.body);
    const result = await exec(`INSERT INTO quotation (enquiry_id, vendor_id, amount, message, estimated_days, valid_until, status, created_at) VALUES (:enquiryId, :vendorId, :amount, :message, :estimatedDays, :validUntil, 'sent', NOW())`, { ...body, enquiryId: req.params.id, vendorId: req.user!.id });
    await exec(`UPDATE enquiries SET status = 'quoted' WHERE enquiry_id = :id`, { id: req.params.id });
    ok(res, { quote: await one<any>('SELECT * FROM quotation WHERE quotation_id = :id', { id: result.insertId }) }, 201);
  } catch (err) { next(err); }
});

vendorRouter.get('/projects', async (req: AuthRequest, res, next) => {
  try { ok(res, { projects: await query<any>('SELECT * FROM orders WHERE vendor_id = :id ORDER BY order_id DESC', { id: req.user!.id }) }); } catch (err) { next(err); }
});

vendorRouter.get('/projects/:id', async (req: AuthRequest, res, next) => {
  try {
    const project = await one<any>('SELECT * FROM orders WHERE order_id = :id AND vendor_id = :vendorId', { id: req.params.id, vendorId: req.user!.id });
    const plan = await query<any>('SELECT * FROM order_plan WHERE order_id = :id ORDER BY plan_id ASC', { id: req.params.id });
    ok(res, { project, plan });
  } catch (err) { next(err); }
});

vendorRouter.post('/kyc', async (req: AuthRequest, res, next) => {
  try {
    const { proofType, proofNumber, documentUrl } = req.body;
    await exec(`UPDATE vendors SET proof_type = :proofType, proof_number = :proofNumber, kyc_document_url = :documentUrl, status = 'kyc_submitted' WHERE vendor_id = :id`, { proofType, proofNumber, documentUrl, id: req.user!.id });
    ok(res, { message: 'KYC submitted' });
  } catch (err) { next(err); }
});

vendorRouter.get('/earnings', async (req: AuthRequest, res, next) => {
  try {
    const wallet = await one<any>('SELECT * FROM vendor_wallet WHERE vendor_id = :id', { id: req.user!.id });
    const transactions = await query<any>('SELECT * FROM vendor_transactions WHERE vendor_id = :id ORDER BY id DESC LIMIT 50', { id: req.user!.id });
    ok(res, { wallet, transactions });
  } catch (err) { next(err); }
});

vendorRouter.get('/listings', async (req: AuthRequest, res, next) => {
  try { ok(res, { listings: await query<any>('SELECT * FROM vendor_services WHERE vendor_id = :id ORDER BY vendor_service_id DESC', { id: req.user!.id }) }); } catch (err) { next(err); }
});

vendorRouter.post('/listings', async (req: AuthRequest, res, next) => {
  try {
    const body = z.object({ title: z.string(), description: z.string().optional(), price: z.number().optional(), unit: z.string().optional(), category_id: z.any().optional() }).parse(req.body);
    const result = await exec(`INSERT INTO vendor_services (vendor_id, title, description, price, unit, category_id, status, created_at) VALUES (:vendorId, :title, :description, :price, :unit, :category_id, 1, NOW())`, { ...body, vendorId: req.user!.id });
    ok(res, { listing: await one<any>('SELECT * FROM vendor_services WHERE vendor_service_id = :id', { id: result.insertId }) }, 201);
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────────────────────
 *  P0 additions — accept/reject, plan CRUD, materials,
 *  milestone updates, payment requests.
 *  All vendor-scoped; ownership enforced inside each handler.
 * ───────────────────────────────────────────────────────────── */

// Helper: ensure the order belongs to this vendor before mutating.
async function assertOrderBelongs(orderId: string | number | undefined | string[], vendorId: number | string) {
  const row = await one<any>(
    `SELECT order_id FROM orders WHERE order_id = :id AND vendor_id = :vendorId LIMIT 1`,
    { id: String(orderId ?? ''), vendorId },
  );
  if (!row) throw new ApiError(404, 'Order not found');
}

/* ── Enquiry accept / reject ─────────────────────────────── */
vendorRouter.post('/enquiries/:id/accept', async (req: AuthRequest, res, next) => {
  try {
    const result: any = await exec(
      `UPDATE enquiries SET status = 'accepted', accepted_at = NOW()
         WHERE enquiry_id = :id AND vendor_id = :vendorId`,
      { id: req.params.id, vendorId: req.user!.id },
    );
    if (!result.affectedRows) throw new ApiError(404, 'Enquiry not found');
    ok(res, { enquiry_id: Number(req.params.id), status: 'accepted' });
  } catch (err) { next(err); }
});

vendorRouter.post('/enquiries/:id/reject', async (req: AuthRequest, res, next) => {
  try {
    const reason = z.object({ reason: z.string().optional() }).parse(req.body).reason || null;
    const result: any = await exec(
      `UPDATE enquiries SET status = 'rejected', rejected_at = NOW(), reject_reason = :reason
         WHERE enquiry_id = :id AND vendor_id = :vendorId`,
      { id: req.params.id, vendorId: req.user!.id, reason },
    );
    if (!result.affectedRows) throw new ApiError(404, 'Enquiry not found');
    ok(res, { enquiry_id: Number(req.params.id), status: 'rejected' });
  } catch (err) { next(err); }
});

/* ── Plan CRUD + submit ──────────────────────────────────── */
const milestoneSchema = z.object({
  plan_id:     z.number().int().optional(),
  title:       z.string().min(1),
  description: z.string().optional(),
  amount:      z.number().nonnegative(),
  days:        z.number().int().nonnegative().default(0),
  percentage:  z.number().nonnegative().default(0),
  mandatory:   z.boolean().default(true),
});

vendorRouter.post('/projects/:id/plan', async (req: AuthRequest, res, next) => {
  try {
    const orderId = req.params.id;
    await assertOrderBelongs(orderId, req.user!.id);
    const milestones = z.array(milestoneSchema).min(1).parse(req.body.milestones || []);
    const total = milestones.reduce((s, m) => s + (m.percentage || 0), 0);
    if (Math.round(total) !== 100) throw new ApiError(400, `Milestone percentages must total 100 (got ${total})`);

    await transaction(async (conn) => {
      await conn.query(`DELETE FROM order_plan WHERE order_id = ?`, [orderId]);
      for (const m of milestones) {
        await conn.query(
          `INSERT INTO order_plan (order_id, title, description, amount, days, percentage, mandatory,
                                    vendor_status, customer_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', 'pending')`,
          [orderId, m.title, m.description || null, m.amount, m.days, m.percentage, m.mandatory ? 1 : 0],
        );
      }
    });
    const plan = await query<any>(`SELECT * FROM order_plan WHERE order_id = :id ORDER BY plan_id ASC`, { id: orderId });
    ok(res, { plan }, 201);
  } catch (err) { next(err); }
});

vendorRouter.put('/projects/:id/plan', async (req: AuthRequest, res, next) => {
  try {
    const orderId = req.params.id;
    await assertOrderBelongs(orderId, req.user!.id);
    const milestones = z.array(milestoneSchema).parse(req.body.milestones || []);
    await transaction(async (conn) => {
      for (const m of milestones) {
        if (!m.plan_id) continue;
        await conn.query(
          `UPDATE order_plan SET title = ?, description = ?, amount = ?, days = ?,
                                  percentage = ?, mandatory = ?
             WHERE plan_id = ? AND order_id = ?`,
          [m.title, m.description || null, m.amount, m.days, m.percentage, m.mandatory ? 1 : 0, m.plan_id, orderId],
        );
      }
    });
    const plan = await query<any>(`SELECT * FROM order_plan WHERE order_id = :id ORDER BY plan_id ASC`, { id: orderId });
    ok(res, { plan });
  } catch (err) { next(err); }
});

vendorRouter.post('/projects/:id/plan/submit', async (req: AuthRequest, res, next) => {
  try {
    const orderId = req.params.id;
    await assertOrderBelongs(orderId, req.user!.id);
    const totalPct = await one<{ total: number | string }>(
      `SELECT COALESCE(SUM(percentage), 0) AS total FROM order_plan WHERE order_id = :id`,
      { id: orderId },
    );
    if (Math.round(Number(totalPct?.total ?? 0)) !== 100) {
      throw new ApiError(400, 'Plan total must equal 100% before submit');
    }
    const lastVersion = await one<{ v: number }>(
      `SELECT COALESCE(MAX(version), 0) AS v FROM plan_submissions WHERE order_id = :id`,
      { id: orderId },
    );
    await transaction(async (conn) => {
      await conn.query(
        `INSERT INTO plan_submissions (order_id, version, status) VALUES (?, ?, 'submitted')`,
        [orderId, Number(lastVersion?.v ?? 0) + 1],
      );
      await conn.query(
        `UPDATE order_plan SET vendor_status = 'submitted', customer_status = 'pending'
           WHERE order_id = ?`,
        [orderId],
      );
    });
    ok(res, { order_id: Number(orderId), status: 'submitted' });
  } catch (err) { next(err); }
});

/* ── Materials CRUD ──────────────────────────────────────── */
const materialSchema = z.object({
  name:     z.string().min(1),
  quantity: z.number().nonnegative().default(1),
  unit:     z.string().default('pc'),
  rate:     z.number().nonnegative().default(0),
  status:   z.enum(['UNPAID', 'AWAITING_PAYMENT', 'PAID']).default('UNPAID'),
});

vendorRouter.get('/projects/:id/materials', async (req: AuthRequest, res, next) => {
  try {
    await assertOrderBelongs(req.params.id, req.user!.id);
    const materials = await query<any>(
      `SELECT * FROM materials WHERE order_id = :id ORDER BY material_id ASC`,
      { id: req.params.id },
    );
    ok(res, { materials });
  } catch (err) { next(err); }
});

vendorRouter.post('/projects/:id/materials', async (req: AuthRequest, res, next) => {
  try {
    await assertOrderBelongs(req.params.id, req.user!.id);
    const m = materialSchema.parse(req.body);
    const total = Number((m.quantity * m.rate).toFixed(2));
    const result: any = await exec(
      `INSERT INTO materials (order_id, name, quantity, unit, rate, total, status)
       VALUES (:orderId, :name, :quantity, :unit, :rate, :total, :status)`,
      { orderId: req.params.id, ...m, total },
    );
    const material = await one<any>(`SELECT * FROM materials WHERE material_id = :id`, { id: result.insertId });
    ok(res, { material }, 201);
  } catch (err) { next(err); }
});

vendorRouter.put('/projects/:id/materials/:materialId', async (req: AuthRequest, res, next) => {
  try {
    await assertOrderBelongs(req.params.id, req.user!.id);
    const m = materialSchema.partial().parse(req.body);
    const cur = await one<any>(
      `SELECT * FROM materials WHERE material_id = :id AND order_id = :orderId`,
      { id: req.params.materialId, orderId: req.params.id },
    );
    if (!cur) throw new ApiError(404, 'Material not found');
    const merged = { ...cur, ...m } as any;
    const total = Number((Number(merged.quantity) * Number(merged.rate)).toFixed(2));
    await exec(
      `UPDATE materials SET name = :name, quantity = :quantity, unit = :unit, rate = :rate,
                             total = :total, status = :status
         WHERE material_id = :id`,
      { id: req.params.materialId, name: merged.name, quantity: merged.quantity,
        unit: merged.unit, rate: merged.rate, total, status: merged.status },
    );
    const material = await one<any>(`SELECT * FROM materials WHERE material_id = :id`, { id: req.params.materialId });
    ok(res, { material });
  } catch (err) { next(err); }
});

/* ── Milestone updates / completion / payment-request ───── */
vendorRouter.post('/milestones/:id/updates', async (req: AuthRequest, res, next) => {
  try {
    const { comment, image_urls } = z.object({
      comment: z.string().optional(),
      image_urls: z.array(z.string().url()).optional(),
    }).parse(req.body);
    // Verify ownership through order_plan → orders.
    const owner = await one<any>(
      `SELECT o.vendor_id FROM order_plan p JOIN orders o ON o.order_id = p.order_id
        WHERE p.plan_id = :id LIMIT 1`,
      { id: req.params.id },
    );
    if (!owner || Number(owner.vendor_id) !== Number(req.user!.id)) throw new ApiError(404, 'Milestone not found');
    const result: any = await exec(
      `INSERT INTO milestone_updates (plan_id, vendor_id, comment, image_urls)
       VALUES (:planId, :vendorId, :comment, :images)`,
      { planId: req.params.id, vendorId: req.user!.id, comment: comment || null, images: image_urls ? JSON.stringify(image_urls) : null },
    );
    const update = await one<any>(`SELECT * FROM milestone_updates WHERE update_id = :id`, { id: result.insertId });
    ok(res, { update }, 201);
  } catch (err) { next(err); }
});

vendorRouter.post('/milestones/:id/complete', async (req: AuthRequest, res, next) => {
  try {
    const owner = await one<any>(
      `SELECT o.vendor_id, p.order_id FROM order_plan p JOIN orders o ON o.order_id = p.order_id
        WHERE p.plan_id = :id LIMIT 1`,
      { id: req.params.id },
    );
    if (!owner || Number(owner.vendor_id) !== Number(req.user!.id)) throw new ApiError(404, 'Milestone not found');
    await exec(
      `UPDATE order_plan SET vendor_status = 'completed', updated_at = NOW() WHERE plan_id = :id`,
      { id: req.params.id },
    );
    ok(res, { plan_id: Number(req.params.id), status: 'completed' });
  } catch (err) { next(err); }
});

vendorRouter.post('/milestones/:id/payment-request', async (req: AuthRequest, res, next) => {
  try {
    const owner = await one<any>(
      `SELECT o.vendor_id, o.order_id, p.amount FROM order_plan p JOIN orders o ON o.order_id = p.order_id
        WHERE p.plan_id = :id LIMIT 1`,
      { id: req.params.id },
    );
    if (!owner || Number(owner.vendor_id) !== Number(req.user!.id)) throw new ApiError(404, 'Milestone not found');
    await exec(
      `UPDATE order_plan SET customer_status = 'awaiting_payment' WHERE plan_id = :id`,
      { id: req.params.id },
    );
    ok(res, { plan_id: Number(req.params.id), status: 'awaiting_payment', amount: Number(owner.amount) });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────────────────────
 *  Vendor self-service: submit for admin review.
 *  Called by the web app right after a new vendor finishes the
 *  sign-up / onboarding form. Drops the vendor into
 *  vendor_review_queue and fires an optional notification to the
 *  admin portal so the ops team can pick it up for manual KYC.
 * ───────────────────────────────────────────────────────────── */
vendorRouter.post('/submit-for-review', async (req: AuthRequest, res, next) => {
  try {
    const vendorId = Number(req.user!.id);
    const reason = z.object({ note: z.string().optional() }).parse(req.body || {}).note ?? null;

    const vendor = await one<any>(`SELECT * FROM vendors WHERE vendor_id = :id`, { id: vendorId });
    if (!vendor) throw new ApiError(404, 'Vendor not found');

    // Flip the vendor row into kyc_submitted state so /Admin/GetVendorList
    // (and the existing mobile app) can pick it up via the status filter.
    await exec(
      `UPDATE vendors SET status = 'kyc_submitted', rejection_reason = NULL WHERE vendor_id = :id`,
      { id: vendorId },
    );

    // Upsert into the review queue. The unique key (vendor_id, status)
    // means re-submitting an already-pending vendor doesn't duplicate.
    let queueId: number;
    const existing = await one<any>(
      `SELECT id FROM vendor_review_queue WHERE vendor_id = :id AND status = 'PENDING' LIMIT 1`,
      { id: vendorId },
    );
    if (existing) {
      queueId = existing.id;
      await exec(
        `UPDATE vendor_review_queue SET submitted_at = NOW(), reviewer_note = :note WHERE id = :id`,
        { id: queueId, note: reason },
      );
    } else {
      const result: any = await exec(
        `INSERT INTO vendor_review_queue (vendor_id, status, source, reviewer_note)
         VALUES (:vendorId, 'PENDING', 'web_signup', :note)`,
        { vendorId, note: reason },
      );
      queueId = result.insertId;
    }

    // Fire-and-forget notification to the admin portal (env-configurable).
    // We don't block the response on it — failure is logged + retryable.
    const { notifyAdminNewVendor } = await import('../utils/adminNotify');
    notifyAdminNewVendor({ queueId, vendorId, vendor }).catch(() => { /* swallow */ })

    ok(res, {
      queue_id:  queueId,
      vendor_id: vendorId,
      status:    'PENDING',
      message:   'Submitted for admin verification',
    }, 201);
  } catch (err) { next(err); }
});
