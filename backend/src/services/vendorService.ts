/**
 * vendorService — vendor profile + service listings + onboarding step
 * helpers. Powers /vendor/me on the web and step1..step4 + saveServiceListing
 * on mobile.
 */
import { exec, one, query } from '../db';
import { ApiError } from '../utils/http';

export interface VendorProfileUpdate {
  name?: string | null;
  company_name?: string | null;
  email?: string | null;
  city?: string | null;
  address?: string | null;
  pincode?: string | null;
  about?: string | null;
  owner_name?: string | null;
  profile_image?: string | null;
  gst_number?: string | null;
  is_gst_registered?: boolean | null;
  experience_years?: number | null;
  fcm_token?: string | null;
  proof_type?: string | null;
  proof_number?: string | null;
  kyc_document_url?: string | null;
}

export async function getVendor(vendorId: number | string) {
  const v = await one<any>('SELECT * FROM vendors WHERE vendor_id = :id', { id: vendorId });
  if (!v) throw new ApiError(404, 'Vendor not found');
  return v;
}

export async function updateVendor(vendorId: number | string, b: VendorProfileUpdate) {
  const params = {
    id: vendorId,
    name: b.name ?? null,
    company_name: b.company_name ?? null,
    email: b.email ?? null,
    city: b.city ?? null,
    address: b.address ?? null,
    pincode: b.pincode ?? null,
    about: b.about ?? null,
    owner_name: b.owner_name ?? null,
    profile_image: b.profile_image ?? null,
    gst_number: b.gst_number ?? null,
    is_gst_registered: b.is_gst_registered ?? null,
    experience_years: b.experience_years ?? null,
    fcm_token: b.fcm_token ?? null,
    proof_type: b.proof_type ?? null,
    proof_number: b.proof_number ?? null,
    kyc_document_url: b.kyc_document_url ?? null,
  };
  await exec(
    `UPDATE vendors SET
       name              = COALESCE(:name, name),
       company_name      = COALESCE(:company_name, company_name),
       email             = COALESCE(:email, email),
       city              = COALESCE(:city, city),
       address           = COALESCE(:address, address),
       pincode           = COALESCE(:pincode, pincode),
       about             = COALESCE(:about, about),
       owner_name        = COALESCE(:owner_name, owner_name),
       profile_image     = COALESCE(:profile_image, profile_image),
       gst_number        = COALESCE(:gst_number, gst_number),
       is_gst_registered = COALESCE(:is_gst_registered, is_gst_registered),
       experience_years  = COALESCE(:experience_years, experience_years),
       fcm_token         = COALESCE(:fcm_token, fcm_token),
       proof_type        = COALESCE(:proof_type, proof_type),
       proof_number      = COALESCE(:proof_number, proof_number),
       kyc_document_url  = COALESCE(:kyc_document_url, kyc_document_url)
     WHERE vendor_id = :id`,
    params,
  );
  return getVendor(vendorId);
}

/* ───── Mobile step1..step4 onboarding ─────
 * Mobile splits onboarding into multiple POSTs. Each step is just a
 * partial update to the vendors row, so we expose one helper that
 * accepts whichever fields were sent and stamps the appropriate status. */
export async function onboardingStep(vendorId: number | string, step: number, b: VendorProfileUpdate) {
  await updateVendor(vendorId, b);
  // Stamp status only on the final step; mobile expects 'kyc_submitted'
  // so the admin queue picks it up.
  if (step >= 4) {
    await exec(
      `UPDATE vendors SET status = 'kyc_submitted' WHERE vendor_id = :id`,
      { id: vendorId },
    );
  }
  return getVendor(vendorId);
}

/* ───── Service listings ───── */

export interface ListingInput {
  title: string;
  description?: string;
  price?: number;
  unit?: string;
  category_id?: number | string;
  subcategory_id?: number | string;
  thumbnail?: string;
  tag_ids?: number[];
  status?: boolean | number;
}

export async function listListings(vendorId: number | string) {
  return query<any>(
    'SELECT * FROM vendor_services WHERE vendor_id = :id ORDER BY vendor_service_id DESC',
    { id: vendorId },
  );
}

export async function getListing(vendorId: number | string, serviceId: number | string) {
  const row = await one<any>(
    'SELECT * FROM vendor_services WHERE vendor_service_id = :id AND vendor_id = :vid',
    { id: serviceId, vid: vendorId },
  );
  if (!row) throw new ApiError(404, 'Service not found');
  return row;
}

export async function createListing(vendorId: number | string, b: ListingInput) {
  const result: any = await exec(
    `INSERT INTO vendor_services
       (vendor_id, title, description, price, unit, category_id, subcategory_id, thumbnail, tag_ids, status, created_at)
     VALUES (:vid, :title, :description, :price, :unit, :category, :subcategory, :thumb, :tags, :status, NOW())`,
    {
      vid: vendorId,
      title: b.title,
      description: b.description ?? null,
      price: b.price ?? null,
      unit: b.unit ?? 'project',
      category: b.category_id ?? null,
      subcategory: b.subcategory_id ?? null,
      thumb: b.thumbnail ?? null,
      tags: b.tag_ids ? JSON.stringify(b.tag_ids) : null,
      status: b.status === undefined ? 1 : (b.status ? 1 : 0),
    },
  );
  return getListing(vendorId, result.insertId);
}

export async function updateListing(vendorId: number | string, serviceId: number | string, b: Partial<ListingInput>) {
  const cur = await getListing(vendorId, serviceId);
  const merged = { ...cur, ...b } as any;
  await exec(
    `UPDATE vendor_services SET
       title = :title, description = :description, price = :price, unit = :unit,
       category_id = :category, subcategory_id = :subcategory,
       thumbnail = :thumb, tag_ids = :tags, status = :status
     WHERE vendor_service_id = :id AND vendor_id = :vid`,
    {
      id: serviceId, vid: vendorId,
      title: merged.title, description: merged.description ?? null,
      price: merged.price ?? null, unit: merged.unit ?? 'project',
      category: merged.category_id ?? null,
      subcategory: merged.subcategory_id ?? null,
      thumb: merged.thumbnail ?? null,
      tags: merged.tag_ids ? (typeof merged.tag_ids === 'string' ? merged.tag_ids : JSON.stringify(merged.tag_ids)) : null,
      status: merged.status === undefined ? 1 : (merged.status ? 1 : 0),
    },
  );
  return getListing(vendorId, serviceId);
}

export async function setListingStatus(vendorId: number | string, serviceId: number | string, active: boolean) {
  const result: any = await exec(
    'UPDATE vendor_services SET status = :s WHERE vendor_service_id = :id AND vendor_id = :vid',
    { s: active ? 1 : 0, id: serviceId, vid: vendorId },
  );
  if (!result.affectedRows) throw new ApiError(404, 'Service not found');
  return getListing(vendorId, serviceId);
}

export async function addServiceTag(name: string) {
  const existing = await one<any>('SELECT * FROM service_tags WHERE name = :name', { name });
  if (existing) return existing;
  const result: any = await exec(
    'INSERT INTO service_tags (name, status) VALUES (:name, true)',
    { name },
  );
  return one<any>('SELECT * FROM service_tags WHERE tag_id = :id', { id: result.insertId });
}

export async function getVendorWallet(vendorId: number | string) {
  await exec(
    `INSERT INTO vendor_wallet (vendor_id, balance, total_earning) VALUES (:id, 0, 0)
     ON DUPLICATE KEY UPDATE vendor_id = vendor_id`,
    { id: vendorId },
  );
  return one<any>('SELECT * FROM vendor_wallet WHERE vendor_id = :id', { id: vendorId });
}
