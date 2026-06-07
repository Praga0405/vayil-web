import { Router } from 'express';
import { one, query } from '../db';
import { ApiError, ok } from '../utils/http';

export const commonRouter = Router();
commonRouter.get('/health', (_req, res) => ok(res, { status: 'ok', service: 'vayil-backend', timestamp: new Date().toISOString() }));

// Public marketplace endpoints — vendor browsing must work for
// signed-out visitors so the /search page can populate before login.
// Same paths the frontend already calls (/customer/vendors,
// /customer/vendors/:id); also exposed at /vendors so signed-in users
// hit them via the customerClient without an extra round-trip.
async function publicVendorList(_req: any, res: any, next: any) {
  try {
    const vendors = await query<any>(
      `SELECT vendor_id AS id, name, company_name, city, rating, status
         FROM vendors
        WHERE status = 'verified'
        ORDER BY vendor_id DESC LIMIT 100`,
    );
    ok(res, { vendors });
  } catch (err) { next(err); }
}
async function publicVendorDetail(req: any, res: any, next: any) {
  try {
    const vendor = await one<any>(
      `SELECT vendor_id, name, company_name, city, rating, status, proof_type
         FROM vendors WHERE vendor_id = :id`,
      { id: req.params.id },
    );
    if (!vendor) throw new ApiError(404, 'Vendor not found');
    const listings = await query<any>(
      `SELECT * FROM vendor_services WHERE vendor_id = :id AND status = 1`,
      { id: req.params.id },
    );
    ok(res, { vendor, listings });
  } catch (err) { next(err); }
}
commonRouter.get('/vendors',           publicVendorList);
// :id is constrained to digits so /vendors/me (canonical "current vendor"
// route defined in vendorRouter) is no longer swallowed by the public
// detail handler. Found via the v4.0.0 full-flow E2E test.
commonRouter.get('/vendors/:id(\\d+)', publicVendorDetail);
commonRouter.get('/customer/vendors',  publicVendorList);
commonRouter.get('/customer/vendors/:id(\\d+)', publicVendorDetail);

commonRouter.get('/service-categories', async (_req, res, next) => {
  try { ok(res, { categories: await query('SELECT * FROM service_categories WHERE status = 1 ORDER BY name ASC') }); } catch (err) { next(err); }
});
commonRouter.get('/service-subcategories', async (req, res, next) => {
  // Accept both naming conventions — current client uses `category_id`
  // (snake_case, matches the rest of the API) and the legacy mobile
  // shim sent `categoryId`. Also avoid the `:x IS NULL` pattern which
  // mysql2 silently mis-binds — branch on null explicitly instead.
  const raw = req.query.category_id ?? req.query.categoryId;
  const catId = raw === undefined || raw === '' ? null : Number(raw);
  try {
    const rows = catId == null
      ? await query('SELECT * FROM service_subcategories WHERE status = 1 ORDER BY name ASC')
      : await query('SELECT * FROM service_subcategories WHERE category_id = :catId AND status = 1 ORDER BY name ASC', { catId });
    ok(res, { subcategories: rows });
  } catch (err) { next(err); }
});
commonRouter.get('/service-tags', async (_req, res, next) => {
  try { ok(res, { tags: await query('SELECT * FROM service_tags WHERE status = 1 ORDER BY name ASC') }); } catch (err) { next(err); }
});
/**
 * v4.5.23 — Public settings deny-list.
 *
 * The `settings` table stores both public branding (site name, logo,
 * tax structure, Razorpay PUBLIC key) and **private secrets**
 * (Razorpay SECRET key, SMTP password). The previous `/settings`
 * endpoint did `SELECT *` and shipped the whole row to anonymous
 * callers — anyone could `curl https://vayil.in/settings | jq
 * .settings[0].payment_secret` and walk away with our Razorpay
 * key secret + outbound SMTP credentials.
 *
 * We SELECT * (so the same code works against the mobile dump's
 * extra columns + our schema's renamed ones) and then strip the
 * sensitive fields below before serialising. Admin tooling
 * (`/Admin/Settings`) keeps reading the full row because admins
 * are authenticated + role-checked.
 *
 * Use `publicSettingsSafe(row)` anywhere you ship settings to an
 * unauthenticated or non-admin caller — `/settings`, legacy
 * `/customer/getSettings`, legacy `/vendor/getSettings`.
 */
const SENSITIVE_SETTINGS_FIELDS = new Set([
  'payment_secret',
  'razorpay_secret',
  'razorpay_key_secret',
  'razorpay_webhook_secret',
  'smtp_password',
  'smtp_username',     // SMTP usernames can be probed for spear-phishing — strip
  'jwt_secret',
  'staff_jwt_secret',
  'two_factor_api_key',
  'admin_api_key',
  'secret',            // any column literally named "secret"
  'password',          // any column literally named "password"
]);

export function publicSettingsSafe<T extends Record<string, unknown>>(row: T | null | undefined): Partial<T> {
  if (!row || typeof row !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (SENSITIVE_SETTINGS_FIELDS.has(k.toLowerCase())) continue;
    // Also strip anything whose name CONTAINS "secret" or "password".
    if (/secret|password/i.test(k)) continue;
    out[k] = v;
  }
  return out as Partial<T>;
}

commonRouter.get('/settings', async (_req, res, next) => {
  try {
    const rows = await query<any>('SELECT * FROM settings LIMIT 1');
    const safe = rows.map((r: any) => publicSettingsSafe(r));
    ok(res, { settings: safe });
  } catch (err) { next(err); }
});
