/**
 * vendorService — vendor profile + service listings + onboarding step
 * helpers. Powers /vendor/me on the web and step1..step4 + saveServiceListing
 * on mobile.
 */
import { exec, one, query } from '../db';
import { ApiError } from '../utils/http';

function numericId(v: any): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function firstString(...values: any[]): string | null {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return String(value);
  }
  return null;
}

function normalizedKycStatus(value: any): 'not_submitted' | 'pending' | 'approved' | 'rejected' | null {
  const status = String(value ?? '').toLowerCase();
  if (status === 'not_submitted' || status === 'pending' || status === 'approved' || status === 'rejected') {
    return status;
  }
  return null;
}

export interface VendorProfileUpdate {
  name?: string | null;
  company_name?: string | null;
  ph_code?: string | null;
  phone?: string | null;
  email?: string | null;
  full_name?: string | null;
  state?: string | null;
  city?: string | null;
  address?: string | null;
  pincode?: string | null;
  about?: string | null;
  short_bio?: string | null;
  owner_name?: string | null;
  profile_image?: string | null;
  profile_photo?: string | null;
  service_tag?: string | null;
  service_category?: string | null;
  sub_service?: string | null;
  gst_number?: string | null;
  is_gst_registered?: number | boolean | null;
  experience_years?: number | null;
  years_of_experience?: number | null;
  languages?: string | null;
  area_of_service?: string | null;
  working_hours_from?: string | null;
  working_hours_to?: string | null;
  willing_to_travel?: number | boolean | null;
  tools_available?: string | null;
  certifications?: string | null;
  fcm_token?: string | null;
  proof_type?: string | null;
  proof_number?: string | null;
  kyc_document_url?: string | null;
  kyc_id_type?: string | null;
  kyc_id_number?: string | null;
  kyc_id_image?: string | null;
  kyc_selfie?: string | null;
  kyc_status?: string | null;
}

export async function getVendor(vendorId: number | string) {
  const v = await one<any>('SELECT * FROM vendors WHERE vendor_id = :id', { id: vendorId });
  if (!v) throw new ApiError(404, 'Vendor not found');
  return v;
}

export async function updateVendor(vendorId: number | string, b: VendorProfileUpdate) {
  const fullName = firstString(b.full_name, b.owner_name);
  const profilePhoto = firstString(b.profile_photo, b.profile_image);
  const shortBio = firstString(b.short_bio, b.about);
  const experienceYears = b.years_of_experience ?? b.experience_years ?? null;
  const params = {
    id: vendorId,
    name: b.name ?? null,
    company_name: b.company_name ?? null,
    ph_code: b.ph_code ?? null,
    phone: b.phone ?? null,
    email: b.email ?? null,
    full_name: fullName,
    state: b.state ?? null,
    city: b.city ?? null,
    address: b.address ?? null,
    pincode: b.pincode ?? null,
    about: shortBio,
    short_bio: shortBio,
    owner_name: fullName,
    profile_image: profilePhoto,
    profile_photo: profilePhoto,
    service_tag: b.service_tag ?? null,
    service_category: b.service_category ?? null,
    sub_service: b.sub_service ?? null,
    gst_number: b.gst_number ?? null,
    is_gst_registered: b.is_gst_registered ?? null,
    experience_years: experienceYears,
    years_of_experience: experienceYears,
    languages: b.languages ?? null,
    area_of_service: b.area_of_service ?? null,
    working_hours_from: b.working_hours_from ?? null,
    working_hours_to: b.working_hours_to ?? null,
    willing_to_travel: b.willing_to_travel ?? null,
    tools_available: b.tools_available ?? null,
    certifications: b.certifications ?? null,
    fcm_token: b.fcm_token ?? null,
    proof_type: firstString(b.proof_type, b.kyc_id_type),
    proof_number: firstString(b.proof_number, b.kyc_id_number),
    kyc_document_url: firstString(b.kyc_document_url, b.kyc_id_image),
    kyc_id_type: firstString(b.kyc_id_type, b.proof_type),
    kyc_id_number: firstString(b.kyc_id_number, b.proof_number),
    kyc_id_image: firstString(b.kyc_id_image, b.kyc_document_url),
    kyc_selfie: firstString(b.kyc_selfie),
    kyc_status: normalizedKycStatus(b.kyc_status),
  };
  await exec(
    `UPDATE vendors SET
       name              = COALESCE(:name, name),
       company_name      = COALESCE(:company_name, company_name),
       ph_code           = COALESCE(:ph_code, ph_code),
       phone             = COALESCE(:phone, phone),
       mobile            = COALESCE(:phone, mobile),
       email             = COALESCE(:email, email),
       full_name         = COALESCE(:full_name, full_name),
       state             = COALESCE(:state, state),
       city              = COALESCE(:city, city),
       address           = COALESCE(:address, address),
       pincode           = COALESCE(:pincode, pincode),
       about             = COALESCE(:about, about),
       short_bio         = COALESCE(:short_bio, short_bio),
       owner_name        = COALESCE(:owner_name, owner_name),
       profile_image     = COALESCE(:profile_image, profile_image),
       profile_photo     = COALESCE(:profile_photo, profile_photo),
       service_tag       = COALESCE(:service_tag, service_tag),
       service_category  = COALESCE(:service_category, service_category),
       sub_service       = COALESCE(:sub_service, sub_service),
       gst_number        = COALESCE(:gst_number, gst_number),
       is_gst_registered = COALESCE(:is_gst_registered, is_gst_registered),
       experience_years  = COALESCE(:experience_years, experience_years),
       years_of_experience = COALESCE(:years_of_experience, years_of_experience),
       languages         = COALESCE(:languages, languages),
       area_of_service   = COALESCE(:area_of_service, area_of_service),
       working_hours_from = COALESCE(:working_hours_from, working_hours_from),
       working_hours_to  = COALESCE(:working_hours_to, working_hours_to),
       willing_to_travel = COALESCE(:willing_to_travel, willing_to_travel),
       tools_available   = COALESCE(:tools_available, tools_available),
       certifications    = COALESCE(:certifications, certifications),
       fcm_token         = COALESCE(:fcm_token, fcm_token),
       proof_type        = COALESCE(:proof_type, proof_type),
       proof_number      = COALESCE(:proof_number, proof_number),
       kyc_document_url  = COALESCE(:kyc_document_url, kyc_document_url),
       kyc_id_type       = COALESCE(:kyc_id_type, kyc_id_type),
       kyc_id_number     = COALESCE(:kyc_id_number, kyc_id_number),
       kyc_id_image      = COALESCE(:kyc_id_image, kyc_id_image),
       kyc_selfie        = COALESCE(:kyc_selfie, kyc_selfie),
       kyc_status        = COALESCE(:kyc_status, kyc_status)
     WHERE vendor_id = :id`,
    params,
  );
  return getVendor(vendorId);
}

export async function submitVendorForReview(
  vendorId: number | string,
  source = 'vendor_onboarding',
  note: string | null = null,
) {
  const vendor = await getVendor(vendorId);

  await exec(
    `UPDATE vendors
        SET status = 'pending_approval',
            kyc_status = 'pending',
            kyc_submitted_at = COALESCE(kyc_submitted_at, NOW()),
            rejection_reason = NULL
      WHERE vendor_id = :id`,
    { id: vendorId },
  );

  const existing = await one<any>(
    `SELECT id FROM vendor_review_queue
      WHERE vendor_id = :id AND status = 'PENDING'
      LIMIT 1`,
    { id: vendorId },
  );
  if (existing) {
    await exec(
      `UPDATE vendor_review_queue
          SET submitted_at = NOW(),
              source = COALESCE(:source, source),
              reviewer_note = COALESCE(:note, reviewer_note)
        WHERE id = :id`,
      { id: existing.id, source, note },
    );
    return { vendor: await getVendor(vendorId), queueId: existing.id };
  }

  const result: any = await exec(
    `INSERT INTO vendor_review_queue (vendor_id, status, source, reviewer_note)
     VALUES (:vendorId, 'PENDING', :source, :note)`,
    { vendorId, source, note },
  );

  return { vendor: await getVendor(vendorId), queueId: result.insertId };
}

/* ───── Mobile step1..step4 onboarding ─────
 * Mobile splits onboarding into multiple POSTs. Each step is just a
 * partial update to the vendors row, so we expose one helper that
 * accepts whichever fields were sent and stamps the appropriate status. */
export async function onboardingStep(vendorId: number | string, step: number, b: VendorProfileUpdate) {
  await updateVendor(vendorId, b);
  // Final mobile step enters the same admin review queue as web signup.
  if (step >= 4) {
    await submitVendorForReview(vendorId, 'mobile_step4');
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
  pricing_type?: string;
  certificate_url?: string;
  minimum_fee?: number;
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
    'SELECT * FROM vendor_services WHERE (vendor_service_id = :id OR id = :id) AND vendor_id = :vid',
    { id: serviceId, vid: vendorId },
  );
  if (!row) throw new ApiError(404, 'Service not found');
  return row;
}

export async function createListing(vendorId: number | string, b: ListingInput) {
  const result: any = await exec(
    `INSERT INTO vendor_services
       (vendor_id, title, service_title, description, price, unit, unit_name,
        category_id, service_category, subcategory_id, service_subcategory,
        thumbnail, service_image, certificate_url, pricing_type, minimum_fee,
        tag_ids, status, is_active, show_review, is_deleted, created_at)
     VALUES (:vid, :title, :title, :description, :price, :unit, :unit,
        :category, :serviceCategory, :subcategory, :serviceSubcategory,
        :thumb, :thumb, :certificate, :pricingType, :minimumFee,
        :tags, :status, :status, 1, 0, NOW())`,
    {
      vid: vendorId,
      title: b.title,
      description: b.description ?? null,
      price: b.price ?? null,
      unit: b.unit ?? 'project',
      category: numericId(b.category_id),
      serviceCategory: b.category_id ?? null,
      subcategory: numericId(b.subcategory_id),
      serviceSubcategory: b.subcategory_id ?? null,
      thumb: b.thumbnail ?? null,
      certificate: b.certificate_url ?? null,
      pricingType: b.pricing_type ?? (b.price === undefined || b.price === null ? 'quote' : 'per_unit'),
      minimumFee: b.minimum_fee ?? null,
      tags: b.tag_ids ? JSON.stringify(b.tag_ids) : null,
      status: b.status === undefined ? 1 : (b.status ? 1 : 0),
    },
  );
  await exec(
    `UPDATE vendor_services SET id = vendor_service_id WHERE vendor_service_id = :id AND (id IS NULL OR id = 0)`,
    { id: result.insertId },
  ).catch(() => undefined);
  return getListing(vendorId, result.insertId);
}

export async function updateListing(vendorId: number | string, serviceId: number | string, b: Partial<ListingInput>) {
  const cur = await getListing(vendorId, serviceId);
  const merged = { ...cur, ...b } as any;
  await exec(
    `UPDATE vendor_services SET
       title = :title, service_title = :title, description = :description,
       price = :price, unit = :unit, unit_name = :unit,
       category_id = :category, service_category = :serviceCategory,
       subcategory_id = :subcategory, service_subcategory = :serviceSubcategory,
       thumbnail = :thumb, service_image = :thumb, certificate_url = :certificate,
       pricing_type = :pricingType, minimum_fee = :minimumFee,
       tag_ids = :tags, status = :status, is_active = :status
     WHERE (vendor_service_id = :id OR id = :id) AND vendor_id = :vid`,
    {
      id: serviceId, vid: vendorId,
      title: merged.title, description: merged.description ?? null,
      price: merged.price ?? null, unit: merged.unit ?? 'project',
      category: numericId(b.category_id) ?? numericId(cur.category_id),
      serviceCategory: b.category_id ?? cur.service_category ?? cur.category_id ?? null,
      subcategory: numericId(b.subcategory_id) ?? numericId(cur.subcategory_id),
      serviceSubcategory: b.subcategory_id ?? cur.service_subcategory ?? cur.subcategory_id ?? null,
      thumb: merged.thumbnail ?? null,
      certificate: merged.certificate_url ?? null,
      pricingType: merged.pricing_type ?? (merged.price === undefined || merged.price === null ? 'quote' : 'per_unit'),
      minimumFee: merged.minimum_fee ?? null,
      tags: merged.tag_ids ? (typeof merged.tag_ids === 'string' ? merged.tag_ids : JSON.stringify(merged.tag_ids)) : null,
      status: merged.status === undefined ? 1 : (merged.status ? 1 : 0),
    },
  );
  return getListing(vendorId, serviceId);
}

export async function setListingStatus(vendorId: number | string, serviceId: number | string, active: boolean) {
  const result: any = await exec(
    'UPDATE vendor_services SET status = :s, is_active = :s WHERE (vendor_service_id = :id OR id = :id) AND vendor_id = :vid',
    { s: active ? 1 : 0, id: serviceId, vid: vendorId },
  );
  if (!result.affectedRows) throw new ApiError(404, 'Service not found');
  return getListing(vendorId, serviceId);
}

export async function addServiceTag(name: string) {
  if (!name) throw new ApiError(400, 'service tag name is required');
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
