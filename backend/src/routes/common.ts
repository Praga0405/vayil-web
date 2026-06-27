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
const activeListingWhere = (alias: string) =>
  `LOWER(CAST(COALESCE(${alias}.is_active, ${alias}.status, 0) AS CHAR)) IN ('1', 'active', 'true')
        AND COALESCE(${alias}.is_deleted, 0) = 0`;

async function activeListingsForVendors(vendorIds: Array<number | string>) {
  if (!vendorIds.length) return [];
  return query<any>(
    `SELECT
        vs.*,
        COALESCE(vs.service_title, vs.title) AS title,
        COALESCE(vs.unit_name, vs.unit) AS unit,
        COALESCE(sc.slug, LOWER(REPLACE(sc.name, ' ', '-'))) AS category_slug,
        sc.name AS category_name
       FROM vendor_services vs
       LEFT JOIN service_categories sc
              ON sc.category_id = vs.category_id
              OR sc.id = vs.category_id
              OR sc.category_id = CAST(vs.service_category AS UNSIGNED)
              OR sc.id = CAST(vs.service_category AS UNSIGNED)
              OR sc.slug = vs.service_category
              OR sc.name = vs.service_category
      WHERE vs.vendor_id IN (:vendorIds)
        AND ${activeListingWhere('vs')}
      ORDER BY vs.vendor_service_id DESC`,
    { vendorIds },
  );
}

async function publicVendorList(_req: any, res: any, next: any) {
  try {
    const rows = await query<any>(
      `SELECT vendor_id AS id, vendor_id, name, company_name, city, rating, status,
              profile_image, profile_photo, onboarded_date, years_of_experience,
              mobile, phone, email
         FROM vendors
        WHERE COALESCE(is_deleted, 0) = 0
          AND COALESCE(accept_enquires, 1) = 1
          AND EXISTS (
            SELECT 1
              FROM vendor_services vs_check
             WHERE vs_check.vendor_id = vendors.vendor_id
               AND ${activeListingWhere('vs_check')}
          )
        ORDER BY vendor_id DESC LIMIT 100`,
    );
    const listings = await activeListingsForVendors(rows.map((v: any) => v.vendor_id || v.id));
    const byVendor = new Map<number, any[]>();
    for (const listing of listings) {
      const vendorId = Number(listing.vendor_id);
      const bucket = byVendor.get(vendorId) ?? [];
      bucket.push(listing);
      byVendor.set(vendorId, bucket);
    }
    const vendors = rows
      .map((vendor: any) => ({ ...vendor, listings: byVendor.get(Number(vendor.vendor_id || vendor.id)) ?? [] }))
      .filter((vendor: any) => vendor.listings.length > 0);
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
    const listings = await activeListingsForVendors([req.params.id]);
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
  try {
    const categories = await query(
      `SELECT id, name, slug, icon_url, COALESCE(is_active, status, 1) AS is_active
         FROM service_categories
        WHERE COALESCE(is_deleted, 0) = 0 AND COALESCE(is_active, status, 1) = 1
        ORDER BY name ASC`,
    );
    res.status(200).json({ success: true, categories });
  } catch (err) { next(err); }
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
      ? await query(
          `SELECT ss.id, ss.name, ss.slug, ss.category_id, sc.name AS category_name,
                  COALESCE(ss.is_active, ss.status, 1) AS is_active
             FROM service_subcategories ss
             LEFT JOIN service_categories sc ON sc.id = ss.category_id OR sc.category_id = ss.category_id
            WHERE COALESCE(ss.is_deleted, 0) = 0 AND COALESCE(ss.is_active, ss.status, 1) = 1
            ORDER BY ss.name ASC`,
        )
      : await query(
          `SELECT ss.id, ss.name, ss.slug, ss.category_id, sc.name AS category_name,
                  COALESCE(ss.is_active, ss.status, 1) AS is_active
             FROM service_subcategories ss
             LEFT JOIN service_categories sc ON sc.id = ss.category_id OR sc.category_id = ss.category_id
            WHERE ss.category_id = :catId
              AND COALESCE(ss.is_deleted, 0) = 0 AND COALESCE(ss.is_active, ss.status, 1) = 1
            ORDER BY ss.name ASC`,
          { catId },
        );
    res.status(200).json({ success: true, subcategories: rows });
  } catch (err) { next(err); }
});
commonRouter.get('/service-tags', async (_req, res, next) => {
  try {
    const tags = await query(
      `SELECT id, name, COALESCE(is_active, status, 1) AS is_active
         FROM service_tags
        WHERE COALESCE(is_deleted, 0) = 0
          AND COALESCE(is_active, status, 1) = 1
          AND TRIM(COALESCE(name, '')) <> ''
        ORDER BY name ASC`,
    );
    res.status(200).json({ success: true, tags });
  } catch (err) { next(err); }
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
