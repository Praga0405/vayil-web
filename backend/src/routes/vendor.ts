import { Router } from 'express';
import { z } from 'zod';
import { exec, one, query, transaction } from '../db';
import { requireApprovedVendor, requireAuth } from '../middleware/auth';
import { AuthRequest } from '../types';
import { ApiError, ok } from '../utils/http';
import * as vendorSvc from '../services/vendorService';

export const vendorRouter = Router();
vendorRouter.use(requireAuth(['vendor']));
vendorRouter.use(requireApprovedVendor({ allowPaths: ['/me', '/kyc', '/submit-for-review'] }));

vendorRouter.get('/me', async (req: AuthRequest, res, next) => {
  try { ok(res, { vendor: await one<any>('SELECT * FROM vendors WHERE vendor_id = :id', { id: req.user!.id }) }); } catch (err) { next(err); }
});

vendorRouter.put('/me', async (req: AuthRequest, res, next) => {
  try {
    const body = z.object({ name: z.string().optional(), company_name: z.string().optional(), email: z.string().email().optional(), city: z.string().optional(), gst_number: z.string().optional(), is_gst_registered: z.boolean().optional() }).parse(req.body);
    // mysql2 rejects bound `undefined` — normalise every optional to null.
    const params = {
      id:                req.user!.id,
      name:              body.name              ?? null,
      company_name:      body.company_name      ?? null,
      email:             body.email             ?? null,
      city:              body.city              ?? null,
      gst_number:        body.gst_number        ?? null,
      is_gst_registered: body.is_gst_registered ?? null,
    };
    await exec(`UPDATE vendors SET name = COALESCE(:name, name), company_name = COALESCE(:company_name, company_name), email = COALESCE(:email, email), city = COALESCE(:city, city), gst_number = COALESCE(:gst_number, gst_number), is_gst_registered = COALESCE(:is_gst_registered, is_gst_registered) WHERE vendor_id = :id`, params);
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
    // Join the customer so the vendor sees a real name (not "Customer #11").
    // Phone is revealed once the vendor has accepted the enquiry — before
    // that we mask it to discourage off-platform contact.
    const enquiry = await one<any>(
      `SELECT e.*,
              c.name      AS customer_name,
              c.email     AS customer_email,
              c.city      AS customer_city,
              c.profile_image AS customer_profile_image,
              CASE WHEN e.status IN ('accepted','quoted','active','completed')
                   THEN COALESCE(c.phone, c.mobile)
                   ELSE NULL
              END         AS customer_phone
         FROM enquiries e
         LEFT JOIN customers c ON c.customer_id = e.customer_id
        WHERE e.enquiry_id = :id AND e.vendor_id = :vendorId`,
      { id: req.params.id, vendorId: req.user!.id },
    );
    const quotes = await query<any>(
      'SELECT * FROM quotation WHERE enquiry_id = :id AND vendor_id = :vendorId',
      { id: req.params.id, vendorId: req.user!.id },
    );
    ok(res, { enquiry, quotes });
  } catch (err) { next(err); }
});

vendorRouter.post('/enquiries/:id/quotes', async (req: AuthRequest, res, next) => {
  try {
    const body = z.object({
      amount: z.number(),
      message: z.string().optional(),
      estimatedDays: z.number().optional(),
      validUntil: z.string().optional(),
    }).parse(req.body);

    // v4.5.23 — Ownership check. Previously this INSERT only used the
    // calling vendor's id as the vendor_id but never verified that the
    // enquiry was actually addressed to them. A vendor who knew (or
    // guessed) another vendor's enquiry_id could post a quote on it.
    // Also defends against quoting on rejected/cancelled enquiries.
    const enquiry = await one<any>(
      `SELECT enquiry_id, status FROM enquiries
        WHERE enquiry_id = :id AND vendor_id = :vendorId LIMIT 1`,
      { id: req.params.id, vendorId: req.user!.id },
    );
    if (!enquiry) throw new ApiError(404, 'Enquiry not found');
    if (['rejected', 'cancelled', 'completed'].includes(String(enquiry.status).toLowerCase())) {
      throw new ApiError(400, `Cannot quote on a ${enquiry.status} enquiry`);
    }

    // Coerce undefined → null so mysql2 named-placeholders don't blow up.
    const result = await exec(
      `INSERT INTO quotation
         (enquiry_id, vendor_id, amount, message, estimated_days, valid_until, status, created_at)
       VALUES (:enquiryId, :vendorId, :amount, :message, :estimatedDays, :validUntil, 'sent', NOW())`,
      {
        enquiryId:     req.params.id,
        vendorId:      req.user!.id,
        amount:        body.amount,
        message:       body.message       ?? null,
        estimatedDays: body.estimatedDays ?? null,
        validUntil:    body.validUntil    ?? null,
      },
    );
    await exec(`UPDATE enquiries SET status = 'quoted' WHERE enquiry_id = :id`, { id: req.params.id });
    ok(res, { quote: await one<any>('SELECT * FROM quotation WHERE quotation_id = :id', { id: result.insertId }) }, 201);
  } catch (err) { next(err); }
});

vendorRouter.get('/projects', async (req: AuthRequest, res, next) => {
  try {
    // JOIN customer name + roll up plan status + escrow totals so the
    // vendor's "Ongoing Jobs" cards show real values (not "Customer #X
    // · ₹0 paid · NOT STARTED"). Same shape the detail endpoint now
    // returns so adaptJob behaves identically in both contexts.
    const projects = await query<any>(
      `SELECT o.*,
              c.name AS customer_name,
              c.profile_image AS customer_profile_image,
              COALESCE(esc.escrow_total, 0) AS escrow_total,
              COALESCE(esc.escrow_held,   0) AS escrow_held,
              COALESCE(esc.escrow_released, 0) AS escrow_released,
              CASE
                WHEN plan.has_revision    > 0 THEN 'REVISION_REQUESTED'
                WHEN plan.all_approved    > 0 AND plan.pending_count = 0 THEN 'APPROVED'
                WHEN plan.pending_count   > 0 THEN 'SUBMITTED'
                WHEN plan.total_count     > 0 THEN 'APPROVED'
                ELSE 'NOT_STARTED'
              END AS plan_status_rollup
         FROM orders o
         LEFT JOIN customers c ON c.customer_id = o.customer_id
         LEFT JOIN (
           SELECT order_id,
                  SUM(amount) AS escrow_total,
                  SUM(CASE WHEN status = 'escrow_held'   THEN amount ELSE 0 END) AS escrow_held,
                  SUM(CASE WHEN status = 'released'      THEN amount ELSE 0 END) AS escrow_released
             FROM payment_intents
            WHERE status IN ('escrow_held','released')
            GROUP BY order_id
         ) esc ON esc.order_id = o.order_id
         LEFT JOIN (
           SELECT order_id,
                  COUNT(*) AS total_count,
                  SUM(CASE WHEN customer_status = 'pending'             THEN 1 ELSE 0 END) AS pending_count,
                  SUM(CASE WHEN customer_status = 'approved'            THEN 1 ELSE 0 END) AS all_approved,
                  SUM(CASE WHEN customer_status = 'revision_requested'  THEN 1 ELSE 0 END) AS has_revision
             FROM order_plan
            GROUP BY order_id
         ) plan ON plan.order_id = o.order_id
        WHERE o.vendor_id = :id
        ORDER BY o.order_id DESC`,
      { id: req.user!.id },
    );
    ok(res, { projects });
  } catch (err) { next(err); }
});

vendorRouter.get('/projects/:id', async (req: AuthRequest, res, next) => {
  try {
    const project = await one<any>(
      `SELECT o.*, c.name AS customer_name, c.profile_image AS customer_profile_image
         FROM orders o
         LEFT JOIN customers c ON c.customer_id = o.customer_id
        WHERE o.order_id = :id AND o.vendor_id = :vendorId`,
      { id: req.params.id, vendorId: req.user!.id },
    );
    const plan = await query<any>(
      'SELECT * FROM order_plan WHERE order_id = :id ORDER BY plan_id ASC',
      { id: req.params.id },
    );
    // Roll up payment_intents so the vendor's dashboard shows
    // "Paid in escrow" rather than ₹0 until milestones complete.
    const intents = await query<any>(
      `SELECT amount, status, purpose FROM payment_intents
        WHERE order_id = :id AND status IN ('escrow_held','released')`,
      { id: req.params.id },
    );
    const escrow_held    = intents.filter((i: any) => i.status === 'escrow_held')
                                  .reduce((s: number, i: any) => s + Number(i.amount), 0);
    const escrow_released = intents.filter((i: any) => i.status === 'released')
                                  .reduce((s: number, i: any) => s + Number(i.amount), 0);
    ok(res, {
      project, plan,
      escrow: { held: escrow_held, released: escrow_released, total: escrow_held + escrow_released },
    });
  } catch (err) { next(err); }
});

vendorRouter.post('/kyc', async (req: AuthRequest, res, next) => {
  try {
    const proofType = req.body?.proofType ?? req.body?.proof_type ?? req.body?.kyc_id_type ?? null;
    const proofNumber = req.body?.proofNumber ?? req.body?.proof_number ?? req.body?.kyc_id_number ?? null;
    const documentUrl = req.body?.documentUrl ?? req.body?.document_url ?? req.body?.kyc_document_url ?? req.body?.kyc_id_image ?? null;
    const selfieUrl = req.body?.selfieUrl ?? req.body?.selfie_url ?? req.body?.kyc_selfie ?? null;
    await vendorSvc.updateVendor(req.user!.id, {
      proof_type: proofType,
      proof_number: proofNumber,
      kyc_document_url: documentUrl,
      kyc_id_type: proofType,
      kyc_id_number: proofNumber,
      kyc_id_image: documentUrl,
      kyc_selfie: selfieUrl,
      kyc_status: 'pending',
    });
    const { queueId } = await vendorSvc.submitVendorForReview(req.user!.id, 'web_kyc');
    ok(res, { message: 'KYC submitted', queue_id: queueId });
  } catch (err) { next(err); }
});

vendorRouter.get('/earnings', async (req: AuthRequest, res, next) => {
  try {
    const wallet = await one<any>('SELECT * FROM vendor_wallet WHERE vendor_id = :id', { id: req.user!.id });
    // Source transactions from the canonical escrow_ledger (released
    // rows) so the customer sign-off → wallet credit is visible
    // immediately. Falls back to the legacy vendor_transactions table
    // for older vendors who pre-date v4.0.
    const ledgerTxns = await query<any>(
      `SELECT entry_id     AS id,
              intent_id, order_id, vendor_id, amount,
              'CREDIT'     AS type,
              reason       AS reason,
              CONCAT('Escrow release · ',
                COALESCE(NULLIF(reason, ''), 'milestone'),
                COALESCE(CONCAT(' · Order #', order_id), '')
              ) AS description,
              'released'   AS status,
              created_at
         FROM escrow_ledger
        WHERE vendor_id = :id AND direction = 'release'
        ORDER BY entry_id DESC LIMIT 50`,
      { id: req.user!.id },
    );
    const transactions = ledgerTxns.length
      ? ledgerTxns
      : await query<any>(
          'SELECT * FROM vendor_transactions WHERE vendor_id = :id ORDER BY id DESC LIMIT 50',
          { id: req.user!.id },
        );
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

    const { vendor, queueId } = await vendorSvc.submitVendorForReview(vendorId, 'web_signup', reason);

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
