import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { exec, one, query, transaction } from '../db';
import { requireAuth, requireRole } from '../middleware/auth';
import { AuthRequest } from '../types';
import { ApiError, ok } from '../utils/http';

export const opsRouter = Router();
opsRouter.use(requireAuth(['staff']));

opsRouter.get('/dashboard/stats', async (_req, res, next) => {
  try {
    const [c, v, p, kyc, d, todayC, rev, escrow] = await Promise.all([
      one<any>('SELECT COUNT(*) total FROM customers'),
      one<any>('SELECT COUNT(*) total FROM vendors'),
      one<any>("SELECT COUNT(*) total FROM orders WHERE status NOT IN ('completed','cancelled')"),
      one<any>("SELECT COUNT(*) total FROM vendors WHERE status = 'kyc_submitted'"),
      one<any>("SELECT COUNT(*) total FROM disputes WHERE status = 'open'"),
      one<any>('SELECT COUNT(*) total FROM customers WHERE DATE(created_at)=CURDATE()'),
      one<any>('SELECT COALESCE(SUM(amount),0) todayRevenue FROM payment_log WHERE DATE(created_at)=CURDATE()'),
      one<any>("SELECT COALESCE(SUM(amount),0) escrowHeld FROM payment_log WHERE status = 'escrow_held'")
    ]);
    ok(res, { totalCustomers: c?.total || 0, totalVendors: v?.total || 0, activeProjects: p?.total || 0, pendingKYC: kyc?.total || 0, openDisputes: d?.total || 0, todaySignups: todayC?.total || 0, todayRevenue: rev?.todayRevenue || 0, escrowHeld: escrow?.escrowHeld || 0 });
  } catch (err) { next(err); }
});

opsRouter.get('/analytics/revenue', async (req, res, next) => {
  try {
    const period = String(req.query.period || '30d');
    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    const rows = await query<any>(
      `SELECT DATE(created_at) date, COALESCE(SUM(amount),0) revenue, COUNT(*) transactions
       FROM payment_log WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL :days DAY)
       GROUP BY DATE(created_at) ORDER BY DATE(created_at)`,
      { days }
    );
    ok(res, { data: rows });
  } catch (err) { next(err); }
});

opsRouter.get('/customers', async (req, res, next) => {
  try { ok(res, { customers: await query<any>('SELECT * FROM customers ORDER BY customer_id DESC LIMIT 200') }); } catch (err) { next(err); }
});
opsRouter.get('/customers/:id', async (req, res, next) => {
  try {
    const customer = await one<any>('SELECT * FROM customers WHERE customer_id = :id', { id: req.params.id });
    const notes = await query<any>('SELECT * FROM crm_notes WHERE customer_id = :id ORDER BY id DESC', { id: req.params.id });
    const projects = await query<any>('SELECT * FROM orders WHERE customer_id = :id ORDER BY order_id DESC', { id: req.params.id });
    const tickets = await query<any>('SELECT * FROM support_tickets WHERE customer_id = :id ORDER BY id DESC', { id: req.params.id });
    ok(res, { customer, notes, projects, tickets });
  } catch (err) { next(err); }
});
opsRouter.post('/customers/:id/notes', async (req: AuthRequest, res, next) => {
  try {
    const body = z.object({ note: z.string().min(1), type: z.enum(['INTERNAL','CALL','WHATSAPP','EMAIL','VISIT']).default('INTERNAL') }).parse(req.body);
    const result = await exec(`INSERT INTO crm_notes (customer_id, staff_id, note, type, created_at) VALUES (:customerId, :staffId, :note, :type, NOW())`, { customerId: req.params.id, staffId: req.user!.id, ...body });
    ok(res, { note: await one<any>('SELECT * FROM crm_notes WHERE id = :id', { id: result.insertId }) }, 201);
  } catch (err) { next(err); }
});

opsRouter.get('/vendors', async (_req, res, next) => {
  try { ok(res, { vendors: await query<any>('SELECT * FROM vendors ORDER BY vendor_id DESC LIMIT 200') }); } catch (err) { next(err); }
});
opsRouter.get('/vendors/:id', async (req, res, next) => {
  try {
    const vendor = await one<any>('SELECT * FROM vendors WHERE vendor_id = :id', { id: req.params.id });
    const listings = await query<any>('SELECT * FROM vendor_services WHERE vendor_id = :id', { id: req.params.id });
    const projects = await query<any>('SELECT * FROM orders WHERE vendor_id = :id', { id: req.params.id });
    ok(res, { vendor, listings, projects });
  } catch (err) { next(err); }
});
opsRouter.patch('/vendors/:id/status', async (req, res, next) => {
  try {
    const { status, reason } = z.object({ status: z.enum(['pending','kyc_submitted','verified','rejected','suspended']), reason: z.string().optional() }).parse(req.body);
    await exec('UPDATE vendors SET status = :status, rejection_reason = :reason WHERE vendor_id = :id', { id: req.params.id, status, reason });
    ok(res, { message: 'Vendor status updated' });
  } catch (err) { next(err); }
});
opsRouter.get('/kyc/pending', async (_req, res, next) => {
  try { ok(res, { vendors: await query<any>("SELECT * FROM vendors WHERE status = 'kyc_submitted' ORDER BY vendor_id DESC") }); } catch (err) { next(err); }
});
opsRouter.post('/kyc/:vendorId/approve', async (req, res, next) => {
  try { await exec("UPDATE vendors SET status = 'verified', kyc_approved_at = NOW() WHERE vendor_id = :id", { id: req.params.vendorId }); ok(res, { message: 'Vendor KYC approved' }); } catch (err) { next(err); }
});
opsRouter.post('/kyc/:vendorId/reject', async (req, res, next) => {
  try { await exec("UPDATE vendors SET status = 'rejected', rejection_reason = :reason WHERE vendor_id = :id", { id: req.params.vendorId, reason: req.body.reason || 'Rejected by operations team' }); ok(res, { message: 'Vendor KYC rejected' }); } catch (err) { next(err); }
});

opsRouter.get('/projects', async (_req, res, next) => {
  try { ok(res, { projects: await query<any>('SELECT * FROM orders ORDER BY order_id DESC LIMIT 200') }); } catch (err) { next(err); }
});
opsRouter.get('/projects/:id', async (req, res, next) => {
  try {
    const project = await one<any>('SELECT * FROM orders WHERE order_id = :id', { id: req.params.id });
    const payments = await query<any>('SELECT * FROM payment_log WHERE order_id = :id ORDER BY id DESC', { id: req.params.id });
    const plan = await query<any>('SELECT * FROM order_plan WHERE order_id = :id', { id: req.params.id });
    ok(res, { project, payments, plan });
  } catch (err) { next(err); }
});

opsRouter.get('/payments', async (_req, res, next) => {
  try { ok(res, { payments: await query<any>('SELECT * FROM payment_log ORDER BY id DESC LIMIT 200') }); } catch (err) { next(err); }
});
opsRouter.post('/payments/release', async (req, res, next) => {
  try {
    const { paymentId, orderId, vendorId, amount } = z.object({ paymentId: z.any(), orderId: z.any().optional(), vendorId: z.any(), amount: z.number() }).parse(req.body);
    await transaction(async (conn) => {
      await conn.execute("UPDATE payment_log SET status = 'released', released_at = NOW() WHERE id = :paymentId", { paymentId } as any);
      await conn.execute(`INSERT INTO vendor_transactions (vendor_id, order_id, amount, type, status, created_at) VALUES (:vendorId, :orderId, :amount, 'credit', 'released', NOW())`, { vendorId, orderId, amount } as any);
      await conn.execute(`INSERT INTO vendor_wallet (vendor_id, balance, total_earning) VALUES (:vendorId, :amount, :amount) ON DUPLICATE KEY UPDATE balance = balance + :amount, total_earning = total_earning + :amount`, { vendorId, amount } as any);
    });
    ok(res, { message: 'Escrow released' });
  } catch (err) { next(err); }
});

opsRouter.get('/disputes', async (_req, res, next) => {
  try { ok(res, { disputes: await query<any>('SELECT * FROM disputes ORDER BY id DESC LIMIT 200') }); } catch (err) { next(err); }
});
opsRouter.post('/disputes/:id/resolve', async (req, res, next) => {
  try {
    const body = z.object({ resolution: z.enum(['customer','vendor','split']), customerAmount: z.number().default(0), vendorAmount: z.number().default(0), note: z.string().optional() }).parse(req.body);
    const dispute = await one<any>('SELECT * FROM disputes WHERE id = :id', { id: req.params.id });
    if (!dispute) throw new ApiError(404, 'Dispute not found');
    const total = Number(dispute.amount || 0);
    if (body.resolution === 'split' && Math.round(body.customerAmount + body.vendorAmount) !== Math.round(total)) throw new ApiError(400, 'Split payout must equal dispute amount');
    await exec(`UPDATE disputes SET status = 'resolved', resolution = :resolution, customer_amount = :customerAmount, vendor_amount = :vendorAmount, resolution_note = :note, resolved_at = NOW() WHERE id = :id`, { ...body, id: req.params.id });
    ok(res, { message: 'Dispute resolved' });
  } catch (err) { next(err); }
});

opsRouter.get('/support', async (req, res, next) => {
  try { ok(res, { tickets: await query<any>('SELECT * FROM support_tickets ORDER BY id DESC LIMIT 200') }); } catch (err) { next(err); }
});
opsRouter.get('/support/:id', async (req, res, next) => {
  try {
    const ticket = await one<any>('SELECT * FROM support_tickets WHERE id = :id', { id: req.params.id });
    const messages = await query<any>('SELECT * FROM support_messages WHERE ticket_id = :id ORDER BY id ASC', { id: req.params.id });
    ok(res, { ticket, messages });
  } catch (err) { next(err); }
});
opsRouter.post('/support/:id/reply', async (req: AuthRequest, res, next) => {
  try {
    const result = await exec(`INSERT INTO support_messages (ticket_id, sender_type, sender_id, message, created_at) VALUES (:ticketId, 'staff', :staffId, :message, NOW())`, { ticketId: req.params.id, staffId: req.user!.id, message: req.body.message });
    ok(res, { message: await one<any>('SELECT * FROM support_messages WHERE id = :id', { id: result.insertId }) }, 201);
  } catch (err) { next(err); }
});
opsRouter.patch('/support/:id/status', async (req, res, next) => {
  try { await exec('UPDATE support_tickets SET status = :status WHERE id = :id', { id: req.params.id, status: req.body.status }); ok(res, { message: 'Ticket status updated' }); } catch (err) { next(err); }
});

opsRouter.get('/staff', requireRole('super_admin'), async (_req, res, next) => {
  try { ok(res, { staff: await query<any>('SELECT id, name, email, mobile, is_active, created_at, last_login_at FROM staff ORDER BY created_at DESC') }); } catch (err) { next(err); }
});
opsRouter.post('/staff', requireRole('super_admin'), async (req, res, next) => {
  try {
    const body = z.object({ name: z.string(), email: z.string().email(), password: z.string().min(8), roles: z.array(z.string()).default(['read_only']) }).parse(req.body);
    const hash = await bcrypt.hash(body.password, 10);
    const result = await exec(`INSERT INTO staff (name, email, password_hash, is_active, created_at) VALUES (:name, :email, :hash, true, NOW())`, { name: body.name, email: body.email, hash });
    for (const role of body.roles) {
      await exec(`INSERT IGNORE INTO roles (name) VALUES (:role)`, { role });
      await exec(`INSERT INTO staff_roles (staff_id, role_id) SELECT :staffId, id FROM roles WHERE name = :role`, { staffId: result.insertId, role });
    }
    ok(res, { id: result.insertId }, 201);
  } catch (err) { next(err); }
});
