/**
 * adminMobile.ts — the ~50 admin endpoints the mobile team's reference
 * collection (Vayil.json) expects under /Admin/*.
 *
 * Mounted at /Admin/* AND /admin/* in index.ts so the same path works
 * regardless of casing. Auth uses the same admin JWT signing scheme as
 * /Admin/loginAdmin (delegated to authService.signToken with the staff
 * secret).
 *
 * Endpoints are thin wrappers around direct SQL — many are CRUD on
 * lookup tables (cities, states, categories, tags, proofs). The
 * write-heavy ones return `{ success, message, data }` matching the
 * legacy mobile response shape so the existing admin SPA can connect
 * without code changes on its side.
 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { exec, one, query } from '../db';
import { config } from '../config';
import { AuthRequest } from '../types';
import { ApiError, ok } from '../utils/http';

export const adminMobileRouter = Router();

function send(res: any, payload: any = {}, status = 200) {
  return res.status(status).json({ success: true, message: payload.message ?? 'Success', ...payload });
}

/* ─── admin auth middleware (separate from our staff JWT, simpler) ─── */
function requireAdmin(req: AuthRequest, _res: any, next: any) {
  const auth = (req.headers.authorization || '').toString();
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : (req.body?.token as string | undefined);
  if (!token) return next(new ApiError(401, 'Admin token required'));
  try {
    const decoded: any = jwt.verify(token, config.staffJwtSecret);
    if (!decoded?.admin_id && decoded?.userType !== 'admin' && decoded?.userType !== 'staff') {
      return next(new ApiError(403, 'Not an admin token'));
    }
    (req as any).admin = decoded;
    next();
  } catch {
    next(new ApiError(401, 'Invalid admin token'));
  }
}

/* ═══════════════════════════════════════════════════════════
 *  ADMIN AUTH + USER MANAGEMENT
 * ═══════════════════════════════════════════════════════════ */
adminMobileRouter.post('/loginAdmin', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) throw new ApiError(400, 'email and password required');
    const row = await one<any>(`SELECT * FROM admins WHERE email = :email AND status = 'active'`, { email });
    if (!row) throw new ApiError(401, 'Invalid credentials');
    // bcrypt-or-plain — bootstrap row uses bcrypt, mobile-team API might
    // insert plain. Try both safely.
    let okPass = false;
    try { okPass = await bcrypt.compare(password, row.password || ''); } catch { /* ignore */ }
    if (!okPass) okPass = row.password === password;
    if (!okPass) throw new ApiError(401, 'Invalid credentials');
    await exec(`UPDATE admins SET last_login = NOW() WHERE id = :id`, { id: row.id });
    const token = jwt.sign(
      { admin_id: row.id, email_id: row.email, role: row.role || 'admin', userType: 'staff' },
      config.staffJwtSecret,
      { expiresIn: '1d' as any },
    );
    send(res, { message: 'Login successful', token, data: { id: row.id, name: row.name, email: row.email, role: row.role } });
  } catch (err) { next(err); }
});

adminMobileRouter.use(requireAdmin);

adminMobileRouter.post('/createAdmin', async (req, res, next) => {
  try {
    const { name, email, password, status = 'active', role = 'admin' } = req.body || {};
    if (!email || !password) throw new ApiError(400, 'email + password required');
    const hash = await bcrypt.hash(password, 10);
    const r: any = await exec(
      `INSERT INTO admins (name, email, password, status, role) VALUES (:name, :email, :pass, :status, :role)`,
      { name: name || null, email, pass: hash, status, role },
    );
    send(res, { message: 'Admin created', data: { id: r.insertId, name, email, role, status } }, 201);
  } catch (err: any) {
    if (err?.errno === 1062) return next(new ApiError(409, 'Email already exists'));
    next(err);
  }
});

adminMobileRouter.post('/updateAdmin', async (req, res, next) => {
  try {
    const { admin_id, name, email, password, status, role } = req.body || {};
    if (!admin_id) throw new ApiError(400, 'admin_id required');
    const params: any = {
      id: admin_id, name: name ?? null, email: email ?? null,
      status: status ?? null, role: role ?? null,
      pass: password ? await bcrypt.hash(password, 10) : null,
    };
    await exec(
      `UPDATE admins SET name = COALESCE(:name, name), email = COALESCE(:email, email),
                          status = COALESCE(:status, status), role = COALESCE(:role, role),
                          password = COALESCE(:pass, password)
        WHERE id = :id`,
      params,
    );
    send(res, { message: 'Admin updated' });
  } catch (err) { next(err); }
});

adminMobileRouter.get('/getAdminList', async (_req, res, next) => {
  try { send(res, { data: await query(`SELECT id, name, email, role, status, last_login, created_at FROM admins ORDER BY id DESC`) }); }
  catch (err) { next(err); }
});

adminMobileRouter.post('/getAdminById', async (req, res, next) => {
  try {
    const { admin_id } = req.body || {};
    if (!admin_id) throw new ApiError(400, 'admin_id required');
    send(res, { data: await one(`SELECT id, name, email, role, status, last_login, created_at FROM admins WHERE id = :id`, { id: admin_id }) });
  } catch (err) { next(err); }
});

/* ═══════════════════════════════════════════════════════════
 *  CITIES + STATES + COUNTRIES
 * ═══════════════════════════════════════════════════════════ */
adminMobileRouter.post('/addCity', async (req, res, next) => {
  try {
    const { city_name, city_state, city_state_id } = req.body || {};
    if (!city_name) throw new ApiError(400, 'city_name required');
    const r: any = await exec(
      `INSERT INTO city (city_name, city_state, city_state_id) VALUES (:n, :s, :sid)`,
      { n: city_name, s: city_state ?? null, sid: city_state_id ?? 0 },
    );
    send(res, { message: 'City added', data: { city_id: r.insertId } }, 201);
  } catch (err) { next(err); }
});
adminMobileRouter.post('/updateCity', async (req, res, next) => {
  try {
    const { city_id, city_name, city_state, city_state_id } = req.body || {};
    if (!city_id) throw new ApiError(400, 'city_id required');
    await exec(
      `UPDATE city SET city_name = COALESCE(:n, city_name), city_state = COALESCE(:s, city_state),
                       city_state_id = COALESCE(:sid, city_state_id) WHERE city_id = :id`,
      { id: city_id, n: city_name ?? null, s: city_state ?? null, sid: city_state_id ?? null },
    );
    send(res, { message: 'City updated' });
  } catch (err) { next(err); }
});
adminMobileRouter.post('/deleteCity', async (req, res, next) => {
  try {
    const { city_id } = req.body || {};
    if (!city_id) throw new ApiError(400, 'city_id required');
    await exec(`UPDATE city SET is_deleted = 1 WHERE city_id = :id`, { id: city_id });
    send(res, { message: 'City deleted' });
  } catch (err) { next(err); }
});
adminMobileRouter.post('/updateCityStatus', async (req, res, next) => {
  try {
    const { city_id, status } = req.body || {};
    if (!city_id) throw new ApiError(400, 'city_id required');
    await exec(`UPDATE city SET status = :s WHERE city_id = :id`, { id: city_id, s: status ? 1 : 0 });
    send(res, { message: 'City status updated' });
  } catch (err) { next(err); }
});
adminMobileRouter.post('/get_city', async (req, res, next) => {
  try {
    const { state_id, city_state_id } = req.body || {};
    const id = state_id ?? city_state_id;
    const rows = id
      ? await query(`SELECT * FROM city WHERE city_state_id = :id AND is_deleted = 0 ORDER BY city_name`, { id })
      : await query(`SELECT * FROM city WHERE is_deleted = 0 ORDER BY city_name`);
    send(res, { data: rows });
  } catch (err) { next(err); }
});

adminMobileRouter.post('/addState', async (req, res, next) => {
  try {
    const { name, country_id = 101, state_code } = req.body || {};
    if (!name) throw new ApiError(400, 'name required');
    const r: any = await exec(
      `INSERT INTO states (name, country_id, state_code) VALUES (:n, :c, :sc)`,
      { n: name, c: country_id, sc: state_code ?? null },
    );
    send(res, { message: 'State added', data: { id: r.insertId } }, 201);
  } catch (err) { next(err); }
});
adminMobileRouter.post('/updateState', async (req, res, next) => {
  try {
    const { id, name, state_code, country_id } = req.body || {};
    if (!id) throw new ApiError(400, 'id required');
    await exec(
      `UPDATE states SET name = COALESCE(:n, name), state_code = COALESCE(:sc, state_code),
                          country_id = COALESCE(:c, country_id) WHERE id = :id`,
      { id, n: name ?? null, sc: state_code ?? null, c: country_id ?? null },
    );
    send(res, { message: 'State updated' });
  } catch (err) { next(err); }
});
adminMobileRouter.post('/deleteState', async (req, res, next) => {
  try {
    const { id } = req.body || {};
    if (!id) throw new ApiError(400, 'id required');
    await exec(`UPDATE states SET is_deleted = 1 WHERE id = :id`, { id });
    send(res, { message: 'State deleted' });
  } catch (err) { next(err); }
});
adminMobileRouter.post('/updateStateStatus', async (req, res, next) => {
  try {
    const { id, status } = req.body || {};
    if (!id) throw new ApiError(400, 'id required');
    await exec(`UPDATE states SET status = :s WHERE id = :id`, { id, s: status ? 1 : 0 });
    send(res, { message: 'State status updated' });
  } catch (err) { next(err); }
});
adminMobileRouter.get('/get_countries', async (_req, res, next) => {
  try {
    // Hard-coded India for now (mobile team's collection seems to only
    // ever query country_id=101 anyway).
    send(res, { data: [{ id: 101, name: 'India', country_code: 'IN', phone_code: '+91' }] });
  } catch (err) { next(err); }
});

/* ═══════════════════════════════════════════════════════════
 *  SERVICE CATEGORIES / SUBCATEGORIES / TAGS
 * ═══════════════════════════════════════════════════════════ */
adminMobileRouter.post('/addServiceCategory', async (req, res, next) => {
  try {
    const { name, slug, icon_url } = req.body || {};
    if (!name) throw new ApiError(400, 'name required');
    const r: any = await exec(
      `INSERT INTO service_categories (name, slug, icon_url) VALUES (:n, :s, :i)`,
      { n: name, s: slug || name.toLowerCase().replace(/\s+/g, '-'), i: icon_url ?? null },
    );
    send(res, { message: 'Category added', data: { id: r.insertId } }, 201);
  } catch (err: any) {
    if (err?.errno === 1062) return next(new ApiError(409, 'Slug already exists'));
    next(err);
  }
});
adminMobileRouter.post('/updateServiceCategory', async (req, res, next) => {
  try {
    const { id, name, slug, icon_url } = req.body || {};
    if (!id) throw new ApiError(400, 'id required');
    await exec(
      `UPDATE service_categories SET name = COALESCE(:n, name), slug = COALESCE(:s, slug),
                                       icon_url = COALESCE(:i, icon_url) WHERE id = :id`,
      { id, n: name ?? null, s: slug ?? null, i: icon_url ?? null },
    );
    send(res, { message: 'Category updated' });
  } catch (err) { next(err); }
});
adminMobileRouter.post('/service-category/UpdateStatus', async (req, res, next) => {
  try {
    const { id, is_active } = req.body || {};
    if (!id) throw new ApiError(400, 'id required');
    await exec(`UPDATE service_categories SET is_active = :s WHERE id = :id`, { id, s: is_active ? 1 : 0 });
    send(res, { message: 'Status updated' });
  } catch (err) { next(err); }
});
adminMobileRouter.post('/delete-categories', async (req, res, next) => {
  try {
    const { ids = [] } = req.body || {};
    if (!ids.length) throw new ApiError(400, 'ids[] required');
    // mysql2 named-placeholders don't expand arrays inside IN(); build
    // a placeholder list and pass positional binds via raw pool.query.
    const list = ids.map(() => '?').join(',');
    await exec(`UPDATE service_categories SET is_deleted = 1 WHERE id IN (${list})`, ids);
    send(res, { message: 'Categories deleted' });
  } catch (err) { next(err); }
});
adminMobileRouter.post('/service-categories', async (_req, res, next) => {
  try { send(res, { data: await query(`SELECT * FROM service_categories WHERE is_deleted = 0 ORDER BY name`) }); }
  catch (err) { next(err); }
});

adminMobileRouter.post('/service-subcategory/add', async (req, res, next) => {
  try {
    const { category_id, name, slug } = req.body || {};
    if (!category_id || !name) throw new ApiError(400, 'category_id + name required');
    const r: any = await exec(
      `INSERT INTO service_subcategories (category_id, name, slug) VALUES (:c, :n, :s)`,
      { c: category_id, n: name, s: slug || name.toLowerCase().replace(/\s+/g, '-') },
    );
    send(res, { message: 'Subcategory added', data: { id: r.insertId } }, 201);
  } catch (err) { next(err); }
});
adminMobileRouter.post('/service-subcategory/update', async (req, res, next) => {
  try {
    const { id, name, slug } = req.body || {};
    if (!id) throw new ApiError(400, 'id required');
    await exec(
      `UPDATE service_subcategories SET name = COALESCE(:n, name), slug = COALESCE(:s, slug) WHERE id = :id`,
      { id, n: name ?? null, s: slug ?? null },
    );
    send(res, { message: 'Subcategory updated' });
  } catch (err) { next(err); }
});
adminMobileRouter.post('/service-subcategory/toggle', async (req, res, next) => {
  try {
    const { id, is_active } = req.body || {};
    if (!id) throw new ApiError(400, 'id required');
    await exec(`UPDATE service_subcategories SET is_active = :s WHERE id = :id`, { id, s: is_active ? 1 : 0 });
    send(res, { message: 'Status updated' });
  } catch (err) { next(err); }
});
adminMobileRouter.post('/delete-subcategories', async (req, res, next) => {
  try {
    const { ids = [] } = req.body || {};
    if (!ids.length) throw new ApiError(400, 'ids[] required');
    const list = ids.map(() => '?').join(',');
    await exec(`UPDATE service_subcategories SET is_deleted = 1 WHERE id IN (${list})`, ids);
    send(res, { message: 'Subcategories deleted' });
  } catch (err) { next(err); }
});
adminMobileRouter.post('/service-subcategories', async (req, res, next) => {
  try {
    const cid = req.body?.category_id;
    const rows = cid
      ? await query(`SELECT * FROM service_subcategories WHERE category_id = :c AND is_deleted = 0`, { c: cid })
      : await query(`SELECT * FROM service_subcategories WHERE is_deleted = 0`);
    send(res, { data: rows });
  } catch (err) { next(err); }
});

adminMobileRouter.post('/service-tag/add', async (req, res, next) => {
  try {
    const { name } = req.body || {};
    if (!name) throw new ApiError(400, 'name required');
    const r: any = await exec(`INSERT INTO service_tags (name) VALUES (:n)`, { n: name });
    send(res, { message: 'Tag added', data: { id: r.insertId } }, 201);
  } catch (err) { next(err); }
});
adminMobileRouter.post('/service-tag/update', async (req, res, next) => {
  try {
    const { id, name } = req.body || {};
    if (!id) throw new ApiError(400, 'id required');
    await exec(`UPDATE service_tags SET name = COALESCE(:n, name) WHERE id = :id`, { id, n: name ?? null });
    send(res, { message: 'Tag updated' });
  } catch (err) { next(err); }
});
adminMobileRouter.post('/service-tag/toggleUpdate', async (req, res, next) => {
  try {
    const { id, is_active } = req.body || {};
    if (!id) throw new ApiError(400, 'id required');
    await exec(`UPDATE service_tags SET is_active = :s WHERE id = :id`, { id, s: is_active ? 1 : 0 });
    send(res, { message: 'Status updated' });
  } catch (err) { next(err); }
});
adminMobileRouter.post('/service-tags', async (_req, res, next) => {
  try { send(res, { data: await query(`SELECT * FROM service_tags WHERE is_deleted = 0 ORDER BY name`) }); }
  catch (err) { next(err); }
});
adminMobileRouter.post('/Deletetags', async (req, res, next) => {
  try {
    const { ids = [] } = req.body || {};
    if (!ids.length) throw new ApiError(400, 'ids[] required');
    const list = ids.map(() => '?').join(',');
    await exec(`UPDATE service_tags SET is_deleted = 1 WHERE id IN (${list})`, ids);
    send(res, { message: 'Tags deleted' });
  } catch (err) { next(err); }
});

/* ═══════════════════════════════════════════════════════════
 *  PROOF TYPES
 * ═══════════════════════════════════════════════════════════ */
adminMobileRouter.post('/addProofType', async (req, res, next) => {
  try {
    const { proof_name } = req.body || {};
    if (!proof_name) throw new ApiError(400, 'proof_name required');
    const r: any = await exec(`INSERT INTO master_proof_types (proof_name) VALUES (:n)`, { n: proof_name });
    send(res, { message: 'Proof type added', data: { id: r.insertId } }, 201);
  } catch (err: any) {
    if (err?.errno === 1062) return next(new ApiError(409, 'Proof type already exists'));
    next(err);
  }
});
adminMobileRouter.post('/editProofType', async (req, res, next) => {
  try {
    const { id, proof_name } = req.body || {};
    if (!id) throw new ApiError(400, 'id required');
    await exec(`UPDATE master_proof_types SET proof_name = COALESCE(:n, proof_name) WHERE id = :id`, { id, n: proof_name ?? null });
    send(res, { message: 'Proof type updated' });
  } catch (err: any) {
    if (err?.errno === 1062) return next(new ApiError(409, 'Proof type with that name already exists'));
    next(err);
  }
});
adminMobileRouter.post('/ProofStatus', async (req, res, next) => {
  try {
    const { id, status } = req.body || {};
    if (!id) throw new ApiError(400, 'id required');
    await exec(`UPDATE master_proof_types SET status = :s WHERE id = :id`, { id, s: status ? 1 : 0 });
    send(res, { message: 'Status updated' });
  } catch (err) { next(err); }
});
adminMobileRouter.post('/deleteProof', async (req, res, next) => {
  try {
    const { id } = req.body || {};
    if (!id) throw new ApiError(400, 'id required');
    await exec(`UPDATE master_proof_types SET is_deleted = 1 WHERE id = :id`, { id });
    send(res, { message: 'Proof type deleted' });
  } catch (err) { next(err); }
});
adminMobileRouter.post('/listProofTypes', async (_req, res, next) => {
  try { send(res, { data: await query(`SELECT * FROM master_proof_types WHERE is_deleted = 0 AND status = 1 ORDER BY proof_name`) }); }
  catch (err) { next(err); }
});

/* ═══════════════════════════════════════════════════════════
 *  CUSTOMER MANAGEMENT
 * ═══════════════════════════════════════════════════════════ */
adminMobileRouter.post('/GetCustomerList', async (req, res, next) => {
  try {
    const { status, search } = req.body || {};
    const where: string[] = ['(is_deleted = 0 OR is_deleted IS NULL)'];
    const params: any = {};
    if (status) { where.push('status = :status'); params.status = status; }
    if (search) { where.push('(name LIKE :q OR email LIKE :q OR phone LIKE :q)'); params.q = `%${search}%`; }
    send(res, { data: await query(`SELECT * FROM customers WHERE ${where.join(' AND ')} ORDER BY customer_id DESC LIMIT 200`, params) });
  } catch (err) { next(err); }
});
adminMobileRouter.post('/CreateCustomer', async (req, res, next) => {
  try {
    const { name, email, phone, city, state } = req.body || {};
    if (!name || !phone) throw new ApiError(400, 'name + phone required');
    const r: any = await exec(
      `INSERT INTO customers (name, email, phone, mobile, city, state, status)
       VALUES (:n, :e, :p, :p, :c, :s, 'approved')`,
      { n: name, e: email ?? null, p: phone, c: city ?? null, s: state ?? null },
    );
    await exec(`UPDATE customers SET id = customer_id WHERE customer_id = :id`, { id: r.insertId });
    send(res, { message: 'Customer created', data: { customer_id: r.insertId, id: r.insertId } }, 201);
  } catch (err) { next(err); }
});
adminMobileRouter.post('/UpdateCustomer', async (req, res, next) => {
  try {
    const { customer_id, id, name, email, phone, city, state } = req.body || {};
    const cid = customer_id ?? id;
    if (!cid) throw new ApiError(400, 'customer_id required');
    await exec(
      `UPDATE customers SET name = COALESCE(:n, name), email = COALESCE(:e, email),
                            phone = COALESCE(:p, phone), city = COALESCE(:c, city), state = COALESCE(:s, state)
        WHERE customer_id = :id OR id = :id`,
      { id: cid, n: name ?? null, e: email ?? null, p: phone ?? null, c: city ?? null, s: state ?? null },
    );
    send(res, { message: 'Customer updated' });
  } catch (err) { next(err); }
});
adminMobileRouter.post('/UpdateCustomerStatus', async (req, res, next) => {
  try {
    const { customer_id, id, status } = req.body || {};
    const cid = customer_id ?? id;
    if (!cid || !status) throw new ApiError(400, 'customer_id + status required');
    await exec(`UPDATE customers SET status = :st WHERE customer_id = :id OR id = :id`, { id: cid, st: status });
    send(res, { message: 'Customer status updated' });
  } catch (err) { next(err); }
});
adminMobileRouter.post('/GetCustomerById', async (req, res, next) => {
  try {
    const { customer_id, id } = req.body || {};
    const cid = customer_id ?? id;
    if (!cid) throw new ApiError(400, 'customer_id required');
    send(res, { data: await one(`SELECT * FROM customers WHERE customer_id = :id OR id = :id`, { id: cid }) });
  } catch (err) { next(err); }
});
adminMobileRouter.post('/DeleteCustomer', async (req, res, next) => {
  try {
    const { customer_id, id } = req.body || {};
    const cid = customer_id ?? id;
    if (!cid) throw new ApiError(400, 'customer_id required');
    await exec(`UPDATE customers SET is_deleted = 1 WHERE customer_id = :id OR id = :id`, { id: cid });
    send(res, { message: 'Customer deleted' });
  } catch (err) { next(err); }
});

/* ═══════════════════════════════════════════════════════════
 *  ORDERS / ENQUIRIES / PAYMENT HISTORY / DASHBOARD
 * ═══════════════════════════════════════════════════════════ */
adminMobileRouter.post('/EnuqiryList', async (_req, res, next) => {
  try { send(res, { data: await query(`SELECT e.*, c.name AS customer_name, v.company_name AS vendor_name
                                          FROM enquiries e
                                          LEFT JOIN customers c ON c.customer_id = e.customer_id
                                          LEFT JOIN vendors v ON v.vendor_id = e.vendor_id
                                         ORDER BY e.enquiry_id DESC LIMIT 200`) }); }
  catch (err) { next(err); }
});

adminMobileRouter.post('/OrderList', async (_req, res, next) => {
  try { send(res, { data: await query(`SELECT o.*, c.name AS customer_name, v.company_name AS vendor_name
                                          FROM orders o
                                          LEFT JOIN customers c ON c.customer_id = o.customer_id
                                          LEFT JOIN vendors v ON v.vendor_id = o.vendor_id
                                         ORDER BY o.order_id DESC LIMIT 200`) }); }
  catch (err) { next(err); }
});

adminMobileRouter.post('/OrderDetails', async (req, res, next) => {
  try {
    const { order_id, id } = req.body || {};
    const oid = order_id ?? id;
    if (!oid) throw new ApiError(400, 'order_id required');
    const order = await one(`SELECT * FROM orders WHERE order_id = :id OR id = :id`, { id: oid });
    const plan = await query(`SELECT * FROM order_plan WHERE order_id = :id ORDER BY plan_id ASC`, { id: oid });
    const materials = await query(`SELECT * FROM order_plan_materials WHERE order_id = :id`, { id: oid });
    const logs = await query(`SELECT * FROM order_step_logs WHERE order_id = :id ORDER BY id DESC`, { id: oid });
    send(res, { data: { order, plan, materials, logs } });
  } catch (err) { next(err); }
});

adminMobileRouter.post('/orderPaymentSummary', async (req, res, next) => {
  try {
    const { order_id, id } = req.body || {};
    const oid = order_id ?? id;
    if (!oid) throw new ApiError(400, 'order_id required');
    const intents = await query(`SELECT * FROM payment_intents WHERE order_id = :id`, { id: oid });
    const platformTx = await query(`SELECT * FROM platform_transactions WHERE order_id = :id`, { id: oid });
    const vendorTx = await query(`SELECT * FROM vendor_transactions WHERE order_id = :id`, { id: oid });
    send(res, { data: { intents, platform_transactions: platformTx, vendor_transactions: vendorTx } });
  } catch (err) { next(err); }
});

adminMobileRouter.post('/PaymentHistory', async (_req, res, next) => {
  try {
    send(res, { data: await query(`
      SELECT pi.intent_id AS id, pi.order_id, pi.customer_id, pi.amount, pi.purpose,
             pi.status, pi.razorpay_order_id, pi.razorpay_payment_id, pi.created_at,
             c.name AS customer_name
        FROM payment_intents pi
        LEFT JOIN customers c ON c.customer_id = pi.customer_id
       ORDER BY pi.intent_id DESC LIMIT 200`) });
  } catch (err) { next(err); }
});

adminMobileRouter.post('/GetBankList', async (_req, res, next) => {
  try {
    send(res, { data: await query(`
      SELECT b.*, v.company_name, v.name AS vendor_name
        FROM bank_details b
        LEFT JOIN vendors v ON v.vendor_id = b.vendor_id
       ORDER BY b.bank_id DESC LIMIT 200`) });
  } catch (err) { next(err); }
});

adminMobileRouter.get('/Dashboard', async (_req, res, next) => {
  try {
    const [
      customerCount, vendorCount, orderCount, openEnquiries,
      activeOrders, completedOrders, walletSum, platformSum,
    ] = await Promise.all([
      one<any>(`SELECT COUNT(*) AS n FROM customers WHERE COALESCE(is_deleted,0) = 0`),
      one<any>(`SELECT COUNT(*) AS n FROM vendors WHERE COALESCE(is_deleted,0) = 0`),
      one<any>(`SELECT COUNT(*) AS n FROM orders`),
      one<any>(`SELECT COUNT(*) AS n FROM enquiries WHERE status = 'new'`),
      one<any>(`SELECT COUNT(*) AS n FROM orders WHERE status = 'active'`),
      one<any>(`SELECT COUNT(*) AS n FROM orders WHERE status = 'completed'`),
      one<any>(`SELECT COALESCE(SUM(balance), 0) AS n FROM vendor_wallet`),
      one<any>(`SELECT COALESCE(SUM(amount), 0) AS n FROM platform_transactions WHERE transaction_type = 'credit'`),
    ]);
    send(res, { data: {
      customers:    Number(customerCount?.n ?? 0),
      vendors:      Number(vendorCount?.n ?? 0),
      orders:       Number(orderCount?.n ?? 0),
      open_enquiries: Number(openEnquiries?.n ?? 0),
      active_orders:  Number(activeOrders?.n ?? 0),
      completed_orders: Number(completedOrders?.n ?? 0),
      vendor_wallet_total: Number(walletSum?.n ?? 0),
      platform_earnings:   Number(platformSum?.n ?? 0),
    } });
  } catch (err) { next(err); }
});

/* ═══════════════════════════════════════════════════════════
 *  SETTINGS
 * ═══════════════════════════════════════════════════════════ */
adminMobileRouter.get('/Settings', async (_req, res, next) => {
  try { send(res, { data: await one(`SELECT * FROM settings LIMIT 1`) }); }
  catch (err) { next(err); }
});
adminMobileRouter.post('/updateSettings', async (req, res, next) => {
  try {
    const fields = ['site_name','site_logo','convenience_fee_percentage','platform_fee','payout_fee',
                    'payment_name','payment_key','payment_secret','tax_option',
                    'smtp_host','smtp_port','smtp_username','smtp_password','smtp_encryption',
                    'smtp_from_email','smtp_from_name','site_url','support_email',
                    'meta_title','meta_description','google_analytics_id'];
    const set: string[] = [];
    const params: any = {};
    for (const f of fields) {
      if (req.body?.[f] !== undefined) { set.push(`${f} = :${f}`); params[f] = req.body[f]; }
    }
    if (!set.length) throw new ApiError(400, 'No fields to update');
    await exec(`UPDATE settings SET ${set.join(', ')} WHERE id = 1`, params);
    send(res, { message: 'Settings updated' });
  } catch (err) { next(err); }
});
