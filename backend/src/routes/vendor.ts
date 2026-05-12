import { Router } from 'express';
import { z } from 'zod';
import { exec, one, query } from '../db';
import { requireAuth } from '../middleware/auth';
import { AuthRequest } from '../types';
import { ok } from '../utils/http';

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
