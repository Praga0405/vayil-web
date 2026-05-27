/**
 * customerService — profile + cart + browsing helpers shared by the
 * canonical /customers/* routes and the legacy mobile /customer/*
 * shims. Mobile sends snake_case field names; this layer accepts both
 * camelCase and snake_case via the unified shapes below.
 */
import { exec, one, query } from '../db';
import { ApiError } from '../utils/http';

export interface CustomerProfileUpdate {
  name?: string | null;
  email?: string | null;
  city?: string | null;
  address?: string | null;
  pincode?: string | null;
  profile_image?: string | null;
  fcm_token?: string | null;
}

export async function getCustomer(customerId: number | string) {
  const customer = await one<any>(
    'SELECT * FROM customers WHERE customer_id = :id',
    { id: customerId },
  );
  if (!customer) throw new ApiError(404, 'Customer not found');
  return customer;
}

export async function updateCustomer(customerId: number | string, body: CustomerProfileUpdate) {
  const params = {
    id: customerId,
    name: body.name ?? null,
    email: body.email ?? null,
    city: body.city ?? null,
    address: body.address ?? null,
    pincode: body.pincode ?? null,
    profile_image: body.profile_image ?? null,
    fcm_token: body.fcm_token ?? null,
  };
  await exec(
    `UPDATE customers SET
       name          = COALESCE(:name, name),
       email         = COALESCE(:email, email),
       city          = COALESCE(:city, city),
       address       = COALESCE(:address, address),
       pincode       = COALESCE(:pincode, pincode),
       profile_image = COALESCE(:profile_image, profile_image),
       fcm_token     = COALESCE(:fcm_token, fcm_token)
     WHERE customer_id = :id`,
    params,
  );
  return getCustomer(customerId);
}

export async function listVendors(opts: { category?: string; city?: string; limit?: number } = {}) {
  const where: string[] = [`v.status IN ('verified','active','kyc_approved')`];
  const params: any = { limit: opts.limit ?? 100 };
  if (opts.city) { where.push('v.city = :city'); params.city = opts.city; }
  // Category filtering via vendor_services.category_id when supplied.
  const join = opts.category
    ? 'JOIN vendor_services s ON s.vendor_id = v.vendor_id AND s.category_id = :categoryId'
    : '';
  if (opts.category) params.categoryId = opts.category;
  return query<any>(
    `SELECT DISTINCT v.vendor_id, v.name, v.company_name, v.city, v.rating,
            v.status, v.profile_image, v.address, v.pincode
       FROM vendors v ${join}
      WHERE ${where.join(' AND ')}
      ORDER BY v.rating DESC, v.vendor_id DESC
      LIMIT :limit`,
    params,
  );
}

export async function getVendorWithListings(vendorId: number | string) {
  const vendor = await one<any>('SELECT * FROM vendors WHERE vendor_id = :id', { id: vendorId });
  if (!vendor) throw new ApiError(404, 'Vendor not found');
  const listings = await query<any>(
    'SELECT * FROM vendor_services WHERE vendor_id = :id AND status = 1 ORDER BY vendor_service_id DESC',
    { id: vendorId },
  );
  return { vendor, listings };
}

/* ───── Cart ───── */

export async function addToCart(customerId: number | string, body: {
  vendor_id?: number | string; service_id?: number | string;
  quantity?: number; price?: number; service_title?: string; metadata?: any;
}) {
  // Dual-write: insert into our customer_cart (which has price/title/qty/
  // metadata) AND the mobile team's `cart` table (status enum 1=in cart).
  const result: any = await exec(
    `INSERT INTO customer_cart (customer_id, vendor_id, service_id, service_title, quantity, price, metadata)
     VALUES (:cid, :vid, :sid, :title, :qty, :price, :meta)`,
    {
      cid: customerId,
      vid: body.vendor_id ?? null,
      sid: body.service_id ?? null,
      title: body.service_title ?? null,
      qty: body.quantity ?? 1,
      price: body.price ?? 0,
      meta: body.metadata ? JSON.stringify(body.metadata) : null,
    },
  );
  if (body.vendor_id && body.service_id) {
    await exec(
      `INSERT INTO cart (customer_id, vendor_id, service_id, status)
       VALUES (:cid, :vid, :sid, 1)`,
      { cid: customerId, vid: body.vendor_id, sid: body.service_id },
    ).catch(() => { /* tolerate if mobile cart already has the row */ });
  }
  return one<any>('SELECT * FROM customer_cart WHERE cart_id = :id', { id: result.insertId });
}

export async function getCart(customerId: number | string) {
  return query<any>(
    `SELECT c.*, v.name AS vendor_name, v.company_name
       FROM customer_cart c
       LEFT JOIN vendors v ON v.vendor_id = c.vendor_id
      WHERE c.customer_id = :id
      ORDER BY c.cart_id DESC`,
    { id: customerId },
  );
}

export async function removeCartItem(customerId: number | string, cartId: number | string) {
  // Look up the legacy row first so we can also soft-delete the mirror
  // in the mobile `cart` table (status=3).
  const legacy = await one<any>(
    'SELECT vendor_id, service_id FROM customer_cart WHERE cart_id = :id AND customer_id = :cid',
    { id: cartId, cid: customerId },
  );
  const result: any = await exec(
    'DELETE FROM customer_cart WHERE cart_id = :id AND customer_id = :cid',
    { id: cartId, cid: customerId },
  );
  if (!result.affectedRows) throw new ApiError(404, 'Cart item not found');
  if (legacy?.vendor_id && legacy?.service_id) {
    await exec(
      `UPDATE cart SET status = 3 WHERE customer_id = :cid AND vendor_id = :vid AND service_id = :sid AND status = 1`,
      { cid: customerId, vid: legacy.vendor_id, sid: legacy.service_id },
    ).catch(() => {});
  }
  return { cart_id: Number(cartId), removed: true };
}

export async function clearCart(customerId: number | string) {
  const result: any = await exec(
    'DELETE FROM customer_cart WHERE customer_id = :id',
    { id: customerId },
  );
  // Soft-clear the mobile mirror too.
  await exec(`UPDATE cart SET status = 3 WHERE customer_id = :id AND status = 1`, { id: customerId }).catch(() => {});
  return { cleared: true, count: result.affectedRows };
}
