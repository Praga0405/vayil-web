/**
 * enquiryService — create / list / detail / accept / reject. Shared
 * between web (POST /customers/enquiries, /vendors/enquiries/:id/accept)
 * and legacy mobile (/customer/sendEnquiry, /customer/enquiryList,
 * /AcceptEnquiredStatusUpdate, /vendorRejectEnquiry).
 */
import { exec, one, query } from '../db';
import { ApiError } from '../utils/http';

export interface CreateEnquiryInput {
  customer_id: number | string;
  vendor_id?: number | string | null;
  service_id?: number | string | null;
  category?: string | null;
  description: string;
  location?: string | null;
  email?: string | null;
  budget?: number | null;
  location_lat?: number | null;
  location_lng?: number | null;
  preferred_date?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  message?: string | null;
  files?: string | null;
}

export async function createEnquiry(b: CreateEnquiryInput) {
  if (!b.description || b.description.length < 3) {
    throw new ApiError(400, 'description is required');
  }
  const result: any = await exec(
    `INSERT INTO enquiries
       (customer_id, vendor_id, service_id, category, description, location, email,
        budget, location_lat, location_lng, preferred_date, first_name, last_name,
        phone, message, files, status, status_int, created_at)
     VALUES (:cid, :vid, :sid, :cat, :desc, :loc, :email,
             :budget, :lat, :lng, :pdate, :firstName, :lastName,
             :phone, :message, :files, 'new', 1, NOW())`,
    {
      cid: b.customer_id, vid: b.vendor_id ?? null, sid: b.service_id ?? null,
      cat: b.category ?? null, desc: b.description, loc: b.location ?? null,
      email: b.email ?? null, budget: b.budget ?? null,
      lat: b.location_lat ?? null, lng: b.location_lng ?? null,
      pdate: b.preferred_date ?? null,
      firstName: b.first_name ?? null, lastName: b.last_name ?? '',
      phone: b.phone ?? '', message: b.message ?? b.description,
      files: b.files ?? '',
    },
  );
  return one<any>('SELECT * FROM enquiries WHERE enquiry_id = :id', { id: result.insertId });
}

export async function listCustomerEnquiries(customerId: number | string) {
  return query<any>(
    'SELECT * FROM enquiries WHERE customer_id = :id ORDER BY enquiry_id DESC',
    { id: customerId },
  );
}

export async function listVendorEnquiries(vendorId: number | string) {
  return query<any>(
    'SELECT * FROM enquiries WHERE vendor_id = :id ORDER BY enquiry_id DESC',
    { id: vendorId },
  );
}

export async function getEnquiryForCustomer(customerId: number | string, enquiryId: number | string) {
  const enquiry = await one<any>(
    'SELECT * FROM enquiries WHERE enquiry_id = :id AND customer_id = :cid',
    { id: enquiryId, cid: customerId },
  );
  if (!enquiry) throw new ApiError(404, 'Enquiry not found');
  const quotes = await query<any>(
    'SELECT * FROM quotation WHERE enquiry_id = :id ORDER BY quotation_id DESC',
    { id: enquiryId },
  );
  return { enquiry, quotes };
}

export async function getEnquiryForVendor(vendorId: number | string, enquiryId: number | string) {
  const enquiry = await one<any>(
    'SELECT * FROM enquiries WHERE enquiry_id = :id AND vendor_id = :vid',
    { id: enquiryId, vid: vendorId },
  );
  if (!enquiry) throw new ApiError(404, 'Enquiry not found');
  const quotes = await query<any>(
    'SELECT * FROM quotation WHERE enquiry_id = :id AND vendor_id = :vid',
    { id: enquiryId, vid: vendorId },
  );
  return { enquiry, quotes };
}

export async function vendorAcceptEnquiry(vendorId: number | string, enquiryId: number | string) {
  const result: any = await exec(
    `UPDATE enquiries SET status = 'accepted', accepted_at = NOW()
       WHERE enquiry_id = :id AND vendor_id = :vid`,
    { id: enquiryId, vid: vendorId },
  );
  if (!result.affectedRows) throw new ApiError(404, 'Enquiry not found');
  return { enquiry_id: Number(enquiryId), status: 'accepted' };
}

export async function vendorRejectEnquiry(vendorId: number | string, enquiryId: number | string, reason?: string) {
  const result: any = await exec(
    `UPDATE enquiries SET status = 'rejected', rejected_at = NOW(), reject_reason = :reason
       WHERE enquiry_id = :id AND vendor_id = :vid`,
    { id: enquiryId, vid: vendorId, reason: reason ?? null },
  );
  if (!result.affectedRows) throw new ApiError(404, 'Enquiry not found');
  return { enquiry_id: Number(enquiryId), status: 'rejected', reason: reason ?? null };
}
