import { Router } from 'express';
import { z } from 'zod';
import { exec, one, query } from '../db';
import { requireAuth } from '../middleware/auth';
import { AuthRequest } from '../types';
import { ok } from '../utils/http';
import { calculateTax } from '../services/tax';

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
