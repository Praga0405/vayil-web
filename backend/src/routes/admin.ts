/**
 * Admin panel routes.
 *
 * The existing Vayil-Admin-Panel-main app (React + axios) hits these
 * exact paths via POST against the base URL it's configured with. Keep
 * the request/response shapes stable — the admin panel is shipping
 * against this contract.
 *
 *   POST /Admin/GetVendorList     → list vendors (filterable by status)
 *   POST /Admin/VendorDetails     → full vendor + services for one id
 *   POST /Admin/VendorKycUpdate   → approve / reject KYC
 *   POST /Admin/VendorStatusUpdate→ active / inactive toggle
 *   POST /Admin/VendorDelete      → soft delete (status='deleted')
 *   POST /Admin/saveVendor        → update mutable vendor fields
 *   POST /Admin/GetReviewQueue    → list pending vendor_review_queue rows
 *
 * Auth: staff JWT (same secret/middleware ops uses). The admin panel
 * stores its token in localStorage and sends Authorization: Bearer.
 */
import { Router } from 'express';
import { z } from 'zod';
import { exec, one, query, transaction } from '../db';
import { requireAuth } from '../middleware/auth';
import { ApiError, ok } from '../utils/http';

export const adminRouter = Router();
adminRouter.use(requireAuth(['staff', 'admin']));

function send(res: any, payload: any = {}, status = 200) {
  return res.status(status).json({ success: true, message: payload.message ?? 'Success', ...payload });
}

function pickId(b: any, ...keys: string[]): string {
  for (const k of keys) if (b && b[k] !== undefined && b[k] !== null && b[k] !== '') return String(b[k]);
  return '';
}

function intParam(v: any, fallback: number, max = 200): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), max);
}

function boolish(v: any): boolean | null {
  if (v === undefined || v === null || v === '') return null;
  return v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
}

/* ── Vendor list with optional filters ─────────────────────── */
adminRouter.post('/GetVendorList', async (req, res, next) => {
  try {
    const body = req.body || {};
    const page = intParam(body.page, 1);
    const pageSize = intParam(body.pageSize ?? body.limit, 50);

    const offset = (page - 1) * pageSize
    const where: string[] = []
    const params: Record<string, any> = { limit: pageSize, offset }
    if (body.status) { where.push('status = :status'); params.status = body.status }
    if (body.search) {
      where.push('(company_name LIKE :q OR name LIKE :q OR mobile LIKE :q OR phone LIKE :q OR email LIKE :q)')
      params.q = `%${body.search}%`
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const vendors = await query<any>(
      `SELECT vendor_id AS id, company_name, name, mobile, phone, email, city,
              status, proof_type, proof_number, kyc_document_url, kyc_approved_at,
              rejection_reason, rating, is_gst_registered, gst_number,
              onboarded_date, created_at
         FROM vendors ${whereSql}
        ORDER BY vendor_id DESC
        LIMIT :limit OFFSET :offset`,
      params,
    )
    const totalRow = await one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM vendors ${whereSql}`,
      params,
    )
    send(res, {
      data: vendors,
      vendors,
      total: Number(totalRow?.n ?? 0),
      page,
      pageSize,
      limit: pageSize,
    })
  } catch (err) { next(err) }
})

/* ── Vendor details (vendor row + their services + queue history) ── */
adminRouter.post('/VendorDetails', async (req, res, next) => {
  try {
    const id = pickId(req.body, 'id', 'vendor_id', 'vendorId')
    if (!id) throw new ApiError(400, 'id required')
    const categoryId = pickId(req.body, 'category_id', 'categoryId')
    const vendor = await one<any>(`SELECT * FROM vendors WHERE vendor_id = :id`, { id })
    if (!vendor) throw new ApiError(404, 'Vendor not found')
    const serviceWhere = categoryId
      ? `vendor_id = :id AND (category_id = :categoryId OR service_category = :categoryId)`
      : `vendor_id = :id`
    const services = await query<any>(
      `SELECT * FROM vendor_services WHERE ${serviceWhere} ORDER BY vendor_service_id DESC`,
      { id, categoryId },
    )
    const queue = await query<any>(
      `SELECT * FROM vendor_review_queue WHERE vendor_id = :id ORDER BY id DESC LIMIT 10`,
      { id },
    )
    send(res, { data: { vendor, services, queue }, vendor, services, queue })
  } catch (err) { next(err) }
})

/* ── KYC approve / reject (single source of truth) ─────────── */
adminRouter.post('/VendorKycUpdate', async (req, res, next) => {
  try {
    const id = pickId(req.body, 'id', 'vendor_id', 'vendorId')
    if (!id) throw new ApiError(400, 'id required')
    const requested = String(req.body?.kyc_status ?? req.body?.status ?? 'pending').toLowerCase()
    const approvedStatuses = new Set(['approved', 'verified', 'active', 'kyc_approved'])
    const kyc_status = approvedStatuses.has(requested)
      ? 'approved'
      : requested === 'rejected'
        ? 'rejected'
        : 'pending'
    const vendorStatus = requested === 'approved' ? 'approved'
      : approvedStatuses.has(requested) ? requested
        : requested === 'rejected' ? 'rejected'
          : requested === 'pending_approval' ? 'pending_approval'
            : 'pending'
    const reviewStatus = kyc_status === 'approved' ? 'APPROVED' : kyc_status === 'rejected' ? 'REJECTED' : 'PENDING'
    const reason = req.body?.reason ?? req.body?.rejection_reason ?? null

    const reviewerId = Number((req as any).user?.id) || null
    await transaction(async (conn) => {
      await conn.query(
        `UPDATE vendors
            SET status = ?,
                kyc_status = ?,
                kyc_approved_at = CASE WHEN ? IN ('verified', 'approved', 'active', 'kyc_approved') THEN NOW() ELSE kyc_approved_at END,
                kyc_verified_at = CASE WHEN ? = 'approved' THEN NOW() ELSE kyc_verified_at END,
                rejection_reason = CASE WHEN ? = 'rejected' THEN ? ELSE NULL END
          WHERE vendor_id = ?`,
        [vendorStatus, kyc_status, vendorStatus, kyc_status, vendorStatus, reason, id],
      )
      const [pendingRows]: any = await conn.query(
        `SELECT id FROM vendor_review_queue WHERE vendor_id = ? AND status = 'PENDING' LIMIT 1`,
        [id],
      )
      const pendingId = pendingRows?.[0]?.id
      if (pendingId) {
        if (reviewStatus !== 'PENDING') {
          await conn.query(
            `DELETE FROM vendor_review_queue WHERE vendor_id = ? AND status = ? AND id <> ?`,
            [id, reviewStatus, pendingId],
          )
        }
        await conn.query(
          `UPDATE vendor_review_queue
              SET status = ?, reviewed_at = CASE WHEN ? <> 'PENDING' THEN NOW() ELSE reviewed_at END,
                  reviewed_by = ?, reviewer_note = COALESCE(?, reviewer_note)
            WHERE id = ?`,
          [reviewStatus, reviewStatus, reviewerId, reason, pendingId],
        )
      } else {
        await conn.query(
          `INSERT INTO vendor_review_queue
             (vendor_id, status, source, reviewed_at, reviewed_by, reviewer_note)
           VALUES (?, ?, 'admin_direct', CASE WHEN ? <> 'PENDING' THEN NOW() ELSE NULL END, ?, ?)
           ON DUPLICATE KEY UPDATE
             reviewed_at = VALUES(reviewed_at),
             reviewed_by = VALUES(reviewed_by),
             reviewer_note = COALESCE(VALUES(reviewer_note), reviewer_note)`,
          [id, reviewStatus, reviewStatus, reviewerId, reason],
        )
      }
    })
    const vendor = await one<any>(`SELECT * FROM vendors WHERE vendor_id = :id`, { id })
    send(res, { message: 'Vendor KYC updated', data: vendor, vendor, kyc_status, status: vendor?.status })
  } catch (err) { next(err) }
})

/* ── Active / inactive toggle ──────────────────────────────── */
adminRouter.post('/VendorStatusUpdate', async (req, res, next) => {
  try {
    const id = pickId(req.body, 'id', 'vendor_id', 'vendorId')
    const status = req.body?.status
    if (!id || !status) throw new ApiError(400, 'id and status required')
    await exec(`UPDATE vendors SET status = :status WHERE vendor_id = :id`, { id, status })
    const vendor = await one<any>(`SELECT * FROM vendors WHERE vendor_id = :id`, { id })
    send(res, { message: 'Vendor status updated', data: vendor, vendor, id, status })
  } catch (err) { next(err) }
})

/* ── Soft delete ───────────────────────────────────────────── */
adminRouter.post('/VendorDelete', async (req, res, next) => {
  try {
    const id = pickId(req.body, 'id', 'vendor_id', 'vendorId')
    if (!id) throw new ApiError(400, 'id required')
    await exec(`UPDATE vendors SET status = 'deleted' WHERE vendor_id = :id`, { id })
    send(res, { message: 'Vendor deleted', data: { id, status: 'deleted' }, id, status: 'deleted' })
  } catch (err) { next(err) }
})

/* ── Save vendor (mutable fields) ──────────────────────────── */
adminRouter.post('/saveVendor', async (req, res, next) => {
  try {
    const body = req.body || {}
    const id = pickId(body, 'id', 'vendor_id', 'vendorId')
    const params = {
      id,
      company_name: body.company_name ?? null,
      name: body.name ?? body.full_name ?? body.owner_name ?? null,
      full_name: body.full_name ?? body.owner_name ?? body.name ?? null,
      owner_name: body.owner_name ?? body.full_name ?? null,
      mobile: body.mobile ?? body.phone ?? null,
      phone: body.phone ?? body.mobile ?? null,
      email: body.email ?? null,
      state: body.state ?? body.state_id ?? null,
      city: body.city ?? null,
      address: body.address ?? null,
      pincode: body.pincode ?? null,
      profile_image: body.profile_image ?? body.profile_photo_url ?? null,
      profile_photo: body.profile_photo ?? body.profile_photo_url ?? body.profile_image ?? null,
      about: body.about ?? body.short_bio ?? null,
      short_bio: body.short_bio ?? body.about ?? null,
      experience_years: body.experience_years ?? body.years_of_experience ?? null,
      years_of_experience: body.years_of_experience ?? body.experience_years ?? null,
      service_tag: body.service_tag ?? body.service_tags ?? null,
      service_category: body.service_category ?? body.category_id ?? null,
      sub_service: body.sub_service ?? body.service_subcategory ?? body.subcategory_id ?? null,
      languages: body.languages ?? null,
      area_of_service: body.area_of_service ?? null,
      working_hours_from: body.working_hours_from ?? null,
      working_hours_to: body.working_hours_to ?? null,
      willing_to_travel: boolish(body.willing_to_travel),
      tools_available: body.tools_available ?? null,
      certifications: body.certifications ?? null,
      gst_number: body.gst_number ?? null,
      is_gst_registered: boolish(body.is_gst_registered),
      proof_type: body.proof_type ?? body.kyc_id_type ?? null,
      proof_number: body.proof_number ?? body.kyc_id_number ?? null,
      kyc_document_url: body.kyc_document_url ?? body.kyc_id_image ?? body.id_image_url ?? null,
      kyc_id_type: body.kyc_id_type ?? body.proof_type ?? body.id_type ?? null,
      kyc_id_number: body.kyc_id_number ?? body.proof_number ?? body.id_number ?? null,
      kyc_id_image: body.kyc_id_image ?? body.kyc_document_url ?? body.id_image_url ?? null,
      kyc_selfie: body.kyc_selfie ?? body.selfie_url ?? null,
      status: body.status ?? body.kyc_status ?? null,
    }
    let vendorId = id
    if (vendorId) {
      await exec(
        `UPDATE vendors
            SET company_name      = COALESCE(:company_name, company_name),
                name              = COALESCE(:name, name),
                full_name         = COALESCE(:full_name, full_name),
                owner_name        = COALESCE(:owner_name, owner_name),
                mobile            = COALESCE(:mobile, mobile),
                phone             = COALESCE(:phone, phone),
                email             = COALESCE(:email, email),
                state             = COALESCE(:state, state),
                city              = COALESCE(:city, city),
                address           = COALESCE(:address, address),
                pincode           = COALESCE(:pincode, pincode),
                profile_image     = COALESCE(:profile_image, profile_image),
                profile_photo     = COALESCE(:profile_photo, profile_photo),
                about             = COALESCE(:about, about),
                short_bio         = COALESCE(:short_bio, short_bio),
                experience_years  = COALESCE(:experience_years, experience_years),
                years_of_experience = COALESCE(:years_of_experience, years_of_experience),
                service_tag       = COALESCE(:service_tag, service_tag),
                service_category  = COALESCE(:service_category, service_category),
                sub_service       = COALESCE(:sub_service, sub_service),
                languages         = COALESCE(:languages, languages),
                area_of_service   = COALESCE(:area_of_service, area_of_service),
                working_hours_from = COALESCE(:working_hours_from, working_hours_from),
                working_hours_to  = COALESCE(:working_hours_to, working_hours_to),
                willing_to_travel = COALESCE(:willing_to_travel, willing_to_travel),
                tools_available   = COALESCE(:tools_available, tools_available),
                certifications    = COALESCE(:certifications, certifications),
                gst_number        = COALESCE(:gst_number, gst_number),
                is_gst_registered = COALESCE(:is_gst_registered, is_gst_registered),
                proof_type        = COALESCE(:proof_type, proof_type),
                proof_number      = COALESCE(:proof_number, proof_number),
                kyc_document_url  = COALESCE(:kyc_document_url, kyc_document_url),
                kyc_id_type       = COALESCE(:kyc_id_type, kyc_id_type),
                kyc_id_number     = COALESCE(:kyc_id_number, kyc_id_number),
                kyc_id_image      = COALESCE(:kyc_id_image, kyc_id_image),
                kyc_selfie        = COALESCE(:kyc_selfie, kyc_selfie),
                status            = COALESCE(:status, status)
          WHERE vendor_id = :id`,
        params,
      )
    } else {
      const result: any = await exec(
        `INSERT INTO vendors
          (company_name, name, full_name, owner_name, mobile, phone, email, state, city, address,
           pincode, profile_image, profile_photo, about, short_bio, experience_years,
           years_of_experience, service_tag, service_category, sub_service, languages,
           area_of_service, working_hours_from, working_hours_to, willing_to_travel,
           tools_available, certifications, gst_number, is_gst_registered, proof_type,
           proof_number, kyc_document_url, kyc_id_type, kyc_id_number, kyc_id_image,
           kyc_selfie, status, created_at)
         VALUES
          (:company_name, :name, :full_name, :owner_name, :mobile, :phone, :email, :state, :city, :address,
           :pincode, :profile_image, :profile_photo, :about, :short_bio, :experience_years,
           :years_of_experience, :service_tag, :service_category, :sub_service, :languages,
           :area_of_service, :working_hours_from, :working_hours_to, COALESCE(:willing_to_travel, 0),
           :tools_available, :certifications, :gst_number, COALESCE(:is_gst_registered, 0), :proof_type,
           :proof_number, :kyc_document_url, :kyc_id_type, :kyc_id_number, :kyc_id_image,
           :kyc_selfie,
           COALESCE(:status, 'pending'), NOW())`,
        params,
      )
      vendorId = String(result.insertId)
      await exec(`UPDATE vendors SET id = vendor_id WHERE vendor_id = :id AND (id IS NULL OR id = 0)`, { id: vendorId }).catch(() => undefined)
    }
    const vendor = await one<any>(`SELECT * FROM vendors WHERE vendor_id = :id`, { id: vendorId })
    send(res, { message: 'Vendor saved', data: vendor, vendor })
  } catch (err) { next(err) }
})

/* ── Review queue list (pending vendors only by default) ───── */
adminRouter.post('/GetReviewQueue', async (req, res, next) => {
  try {
    const body = z.object({
      status:   z.enum(['PENDING', 'APPROVED', 'REJECTED']).default('PENDING'),
      page:     z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(200).default(50),
    }).parse(req.body || {})
    const offset = (body.page - 1) * body.pageSize
    const rows = await query<any>(
      `SELECT q.*, v.company_name, v.name AS owner_name, v.mobile, v.email, v.city, v.status AS vendor_status
         FROM vendor_review_queue q
         JOIN vendors v ON v.vendor_id = q.vendor_id
        WHERE q.status = :status
        ORDER BY q.submitted_at DESC
        LIMIT :limit OFFSET :offset`,
      { status: body.status, limit: body.pageSize, offset },
    )
    const total = await one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM vendor_review_queue WHERE status = :status`,
      { status: body.status },
    )
    ok(res, { queue: rows, total: Number(total?.n ?? 0), page: body.page, pageSize: body.pageSize })
  } catch (err) { next(err) }
})
