import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { exec, one, query } from '../db';
import { requireAuth, signToken } from '../middleware/auth';
import { AuthRequest } from '../types';
import { ApiError, ok } from '../utils/http';
import { generateOtp, sendOtp, storeOtp, verifyOtp } from '../utils/otp';

export const authRouter = Router();

const sendOtpSchema = z.object({ phone: z.string().min(8), userType: z.enum(['customer', 'vendor']) });
authRouter.post('/otp/send', async (req, res, next) => {
  try {
    const body = sendOtpSchema.parse(req.body);
    const otp = generateOtp();
    await storeOtp(body.phone, `${body.userType}_login`, otp);
    await sendOtp(body.phone, otp);
    ok(res, { message: 'OTP sent successfully' });
  } catch (err) { next(err); }
});

const verifyOtpSchema = z.object({ phone: z.string().min(8), otp: z.string().min(4), userType: z.enum(['customer', 'vendor']), name: z.string().optional() });
authRouter.post('/otp/verify', async (req, res, next) => {
  try {
    const body = verifyOtpSchema.parse(req.body);
    await verifyOtp(body.phone, `${body.userType}_login`, body.otp);
    const table = body.userType === 'customer' ? 'customers' : 'vendors';
    const idCol = body.userType === 'customer' ? 'customer_id' : 'vendor_id';
    const name = body.name || (body.userType === 'customer' ? 'Customer' : 'Vendor');
    let user = await one<any>(`SELECT * FROM ${table} WHERE phone = :phone OR mobile = :phone LIMIT 1`, { phone: body.phone });
    if (!user) {
      const result = await exec(
        `INSERT INTO ${table} (name, phone, mobile, status, created_at) VALUES (:name, :phone, :phone, :status, NOW())`,
        { name, phone: body.phone, status: body.userType === 'vendor' ? 'pending' : 'active' }
      );
      user = await one<any>(`SELECT * FROM ${table} WHERE ${idCol} = :id`, { id: result.insertId });
    }
    const token = signToken({ id: user[idCol], userType: body.userType });
    ok(res, { token, userType: body.userType, user });
  } catch (err) { next(err); }
});

// Legacy mobile aliases.
authRouter.post('/customer/logincustomerWithOTP', async (req, res, next) => {
  req.body = { phone: req.body.phone || req.body.mobile, userType: 'customer' };
  return authRouter.handle(Object.assign(req, { url: '/otp/send', method: 'POST' }), res, next);
});
authRouter.post('/vendor-login-otp', async (req, res, next) => {
  req.body = { phone: req.body.phone || req.body.mobile, userType: 'vendor' };
  return authRouter.handle(Object.assign(req, { url: '/otp/send', method: 'POST' }), res, next);
});

authRouter.post('/staff/login', async (req, res, next) => {
  try {
    const { email, password } = z.object({ email: z.string().email(), password: z.string().min(6) }).parse(req.body);
    const staff = await one<any>(`SELECT * FROM staff WHERE email = :email AND is_active = true`, { email });
    if (!staff || !(await bcrypt.compare(password, staff.password_hash))) throw new ApiError(401, 'Invalid staff credentials');
    const roles = await query<any>(`SELECT r.name FROM staff_roles sr JOIN roles r ON r.id = sr.role_id WHERE sr.staff_id = :id`, { id: staff.id });
    await exec(`UPDATE staff SET last_login_at = NOW() WHERE id = :id`, { id: staff.id });
    const token = signToken({ id: staff.id, userType: 'staff', roles: roles.map((r) => r.name) }, true);
    ok(res, { token, staff: { id: staff.id, name: staff.name, email: staff.email, roles: roles.map((r) => r.name) } });
  } catch (err) { next(err); }
});

authRouter.get('/staff/me', requireAuth(['staff']), async (req: AuthRequest, res, next) => {
  try {
    const staff = await one<any>(`SELECT id, name, email, mobile, is_active, last_login_at FROM staff WHERE id = :id`, { id: req.user!.id });
    ok(res, { staff });
  } catch (err) { next(err); }
});

authRouter.post('/staff/logout', requireAuth(['staff']), (_req, res) => ok(res, { message: 'Logged out' }));
