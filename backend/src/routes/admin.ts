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

/* ── Vendor list with optional filters ─────────────────────── */
adminRouter.post('/GetVendorList', async (req, res, next) => {
  try {
    const body = z.object({
      status:   z.string().optional(),      // 'pending'|'kyc_submitted'|'verified'|'rejected'|...
      search:   z.string().optional(),
      page:     z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(200).default(50),
    }).parse(req.body || {});

    const offset = (body.page - 1) * body.pageSize
    const where: string[] = []
    const params: Record<string, any> = { limit: body.pageSize, offset }
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
    ok(res, { vendors, total: Number(totalRow?.n ?? 0), page: body.page, pageSize: body.pageSize })
  } catch (err) { next(err) }
})

/* ── Vendor details (vendor row + their services + queue history) ── */
adminRouter.post('/VendorDetails', async (req, res, next) => {
  try {
    const { id } = z.object({ id: z.any() }).parse(req.body || {})
    const vendor = await one<any>(`SELECT * FROM vendors WHERE vendor_id = :id`, { id })
    if (!vendor) throw new ApiError(404, 'Vendor not found')
    const services = await query<any>(
      `SELECT * FROM vendor_services WHERE vendor_id = :id ORDER BY vendor_service_id DESC`,
      { id },
    )
    const queue = await query<any>(
      `SELECT * FROM vendor_review_queue WHERE vendor_id = :id ORDER BY id DESC LIMIT 10`,
      { id },
    )
    ok(res, { vendor, services, queue })
  } catch (err) { next(err) }
})

/* ── KYC approve / reject (single source of truth) ─────────── */
adminRouter.post('/VendorKycUpdate', async (req, res, next) => {
  try {
    const body = z.object({
      id:         z.any(),
      kyc_status: z.enum(['approved', 'rejected', 'pending']),
      reason:     z.string().optional(),
    }).parse(req.body)

    const reviewerId = Number((req as any).user?.id) || null
    await transaction(async (conn) => {
      if (body.kyc_status === 'approved') {
        await conn.query(
          `UPDATE vendors SET status = 'verified', kyc_approved_at = NOW(), rejection_reason = NULL
             WHERE vendor_id = ?`,
          [body.id],
        )
      } else if (body.kyc_status === 'rejected') {
        await conn.query(
          `UPDATE vendors SET status = 'rejected', kyc_approved_at = NULL, rejection_reason = ?
             WHERE vendor_id = ?`,
          [body.reason ?? null, body.id],
        )
      }
      await conn.query(
        `UPDATE vendor_review_queue
            SET status = ?, reviewed_at = NOW(), reviewed_by = ?, reviewer_note = COALESCE(?, reviewer_note)
          WHERE vendor_id = ? AND status = 'PENDING'`,
        [body.kyc_status === 'approved' ? 'APPROVED' : 'REJECTED', reviewerId, body.reason ?? null, body.id],
      )
    })
    const vendor = await one<any>(`SELECT * FROM vendors WHERE vendor_id = :id`, { id: body.id })
    ok(res, { vendor, kyc_status: body.kyc_status })
  } catch (err) { next(err) }
})

/* ── Active / inactive toggle ──────────────────────────────── */
adminRouter.post('/VendorStatusUpdate', async (req, res, next) => {
  try {
    const body = z.object({ id: z.any(), status: z.string() }).parse(req.body)
    await exec(`UPDATE vendors SET status = :status WHERE vendor_id = :id`, { id: body.id, status: body.status })
    ok(res, { id: body.id, status: body.status })
  } catch (err) { next(err) }
})

/* ── Soft delete ───────────────────────────────────────────── */
adminRouter.post('/VendorDelete', async (req, res, next) => {
  try {
    const { id } = z.object({ id: z.any() }).parse(req.body)
    await exec(`UPDATE vendors SET status = 'deleted' WHERE vendor_id = :id`, { id })
    ok(res, { id, status: 'deleted' })
  } catch (err) { next(err) }
})

/* ── Save vendor (mutable fields) ──────────────────────────── */
adminRouter.post('/saveVendor', async (req, res, next) => {
  try {
    const body = z.object({
      id:                 z.any(),
      company_name:       z.string().optional(),
      name:               z.string().optional(),
      email:              z.string().email().optional(),
      city:               z.string().optional(),
      address:            z.string().optional(),
      pincode:            z.string().optional(),
      gst_number:         z.string().optional(),
      is_gst_registered:  z.boolean().optional(),
    }).parse(req.body)
    await exec(
      `UPDATE vendors
          SET company_name      = COALESCE(:company_name, company_name),
              name              = COALESCE(:name, name),
              email             = COALESCE(:email, email),
              city              = COALESCE(:city, city),
              address           = COALESCE(:address, address),
              pincode           = COALESCE(:pincode, pincode),
              gst_number        = COALESCE(:gst_number, gst_number),
              is_gst_registered = COALESCE(:is_gst_registered, is_gst_registered)
        WHERE vendor_id = :id`,
      body,
    )
    const vendor = await one<any>(`SELECT * FROM vendors WHERE vendor_id = :id`, { id: body.id })
    ok(res, { vendor })
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
