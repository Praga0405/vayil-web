import { Router } from 'express';
import { z } from 'zod';
import { exec, one, query, transaction } from '../db';
import { requireApprovedVendor, requireAuth } from '../middleware/auth';
import { AuthRequest } from '../types';
import { ApiError, ok } from '../utils/http';
import * as vendorSvc from '../services/vendorService';
import * as notifSvc from '../services/notificationService';
import * as materialSvc from '../services/materialService';
import { isAcceptedQuoteStatus } from '../services/quotePayment';
import { calculateTax } from '../services/tax';

export const vendorRouter = Router();
vendorRouter.use(requireAuth(['vendor']));
vendorRouter.use(requireApprovedVendor({ allowPaths: ['/me', '/kyc', '/submit-for-review'] }));

function blankToNull(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function lowerStatus(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function validWorkflowQuote(row: any): boolean {
  const status = lowerStatus(row?.status);
  const amount = Number(row?.amount);
  return Number.isFinite(amount) && amount > 0
    && !['rejected', 'cancelled', 'deleted', 'inactive'].includes(status);
}

function finalStepState(step: any): 'COMPLETED' | 'REJECTED' | null {
  if (Number(step?.step) !== 4) return null;
  const value = lowerStatus(step?.step_status);
  if (['1', 'accepted', 'accept', 'completed', 'complete'].includes(value)) return 'COMPLETED';
  if (['2', 'rejected', 'reject'].includes(value)) return 'REJECTED';
  return null;
}

/**
 * Canonical vendor enquiry read model. Its buckets mirror the mobile
 * vendorEnuqiryList contract: no order = request_quotation, order step 1 =
 * new_enquiry, and order step 2 = ongoing. Terminal step 4 remains visible.
 */
async function vendorWorkflowEnquiries(vendorId: number | string, enquiryId?: number | string | string[]) {
  const rows = await query<any>(
    `SELECT e.*,
            COALESCE(NULLIF(c.name, ''), NULLIF(cl.name, ''),
                     NULLIF(TRIM(CONCAT(COALESCE(e.first_name, ''), ' ', COALESCE(e.last_name, ''))), ''),
                     CONCAT('Customer #', e.customer_id)) AS customer_name,
            COALESCE(NULLIF(c.email, ''), NULLIF(cl.email, ''), NULLIF(e.email, ''), '') AS customer_email,
            COALESCE(NULLIF(c.phone, ''), NULLIF(c.mobile, ''),
                     NULLIF(cl.phone, ''), NULLIF(cl.mobile, ''), NULLIF(e.phone, ''), '') AS customer_mobile,
            COALESCE(c.profile_image, cl.profile_image) AS customer_profile_image,
            COALESCE(NULLIF(vs.service_title, ''), NULLIF(vs.title, ''),
                     NULLIF(vsl.service_title, ''), NULLIF(vsl.title, ''),
                     NULLIF(e.category, ''), 'Home Service') AS service_title,
            COALESCE(NULLIF(sc.name, ''), NULLIF(e.category, ''), 'Service') AS category_name
       FROM enquiries e
       LEFT JOIN customers c ON c.customer_id = e.customer_id
       LEFT JOIN customers cl ON cl.id = e.customer_id AND c.customer_id IS NULL
       LEFT JOIN vendor_services vs ON vs.vendor_service_id = e.service_id
       LEFT JOIN vendor_services vsl ON vsl.id = e.service_id AND vs.vendor_service_id IS NULL
       LEFT JOIN service_categories sc ON sc.category_id = COALESCE(vs.category_id, vsl.category_id)
      WHERE e.vendor_id = :vendorId
        AND (:enquiryId IS NULL OR e.enquiry_id = :enquiryId OR e.id = :enquiryId)
      ORDER BY COALESCE(e.id, e.enquiry_id) DESC`,
    { vendorId, enquiryId: enquiryId ?? null },
  );
  if (!rows.length) return [];

  const enquiryIds = rows.map((row: any) => Number(row.enquiry_id)).filter(Boolean);
  const quotes = await query<any>(
    `SELECT * FROM quotation WHERE enquiry_id IN (:ids) ORDER BY quotation_id DESC`,
    { ids: enquiryIds } as any,
  );
  const orders = await query<any>(
    `SELECT * FROM orders WHERE enquiry_id IN (:ids) ORDER BY order_id DESC`,
    { ids: enquiryIds } as any,
  );
  const orderIds = orders.map((row: any) => Number(row.order_id)).filter(Boolean);
  const steps = orderIds.length ? await query<any>(
    `SELECT * FROM order_step_logs WHERE order_id IN (:ids) ORDER BY id DESC`,
    { ids: orderIds } as any,
  ) : [];
  const plans = orderIds.length ? await query<any>(
    `SELECT * FROM order_plan WHERE order_id IN (:ids) ORDER BY plan_id DESC`,
    { ids: orderIds } as any,
  ) : [];

  return rows.map((row: any) => {
    const rowQuotes = quotes.filter((quote: any) => Number(quote.enquiry_id) === Number(row.enquiry_id));
    const rejectedQuotes = rowQuotes.filter((quote: any) =>
      lowerStatus(quote.status) === 'rejected' || Number(quote.status_int) === 3,
    );
    const activeQuotes = rowQuotes.filter(validWorkflowQuote);
    const acceptedQuote = activeQuotes.find((quote: any) => isAcceptedQuoteStatus(quote.status, quote.status_int));
    const latestQuote = acceptedQuote ?? activeQuotes[0] ?? rowQuotes[0] ?? null;
    const latestRejectedQuote = rejectedQuotes[0] ?? null;
    const rowOrders = orders.filter((order: any) => Number(order.enquiry_id) === Number(row.enquiry_id));
    const latestOrder = rowOrders[0] ?? null;
    const orderSteps = latestOrder
      ? steps.filter((step: any) => Number(step.order_id) === Number(latestOrder.order_id))
      : [];
    const latestStep = orderSteps[0] ?? null;
    const terminal = orderSteps.map(finalStepState).find(Boolean) ?? null;
    const rawStatus = lowerStatus(row.status);
    const rawCode = Number(row.status_int ?? row.status);

    let workflowStatus: string;
    if (terminal === 'COMPLETED' || rawCode === 10 || rawStatus === 'completed') workflowStatus = 'COMPLETED';
    else if (terminal === 'REJECTED') workflowStatus = 'REJECTED';
    else if (latestOrder && Number(latestStep?.step) === 2) workflowStatus = 'ONGOING';
    else if (latestOrder) workflowStatus = 'NEW';
    else if (acceptedQuote) workflowStatus = 'AWAITING_PAYMENT';
    else if (activeQuotes.length > 0) workflowStatus = 'QUOTED';
    else if (rejectedQuotes.length > 0 || rawCode === 3 || rawStatus === 'rejected' || rawStatus === 'quote_rejected') workflowStatus = 'REJECTED';
    else if (rawCode === 2 || rawStatus === 'accepted') workflowStatus = 'ACCEPTED';
    else workflowStatus = 'NEW';

    const workflowBucket = workflowStatus === 'COMPLETED' || workflowStatus === 'REJECTED'
      ? workflowStatus
      : latestOrder
        ? Number(latestStep?.step) === 2 ? 'ONGOING' : 'NEW'
        : 'REQUEST_QUOTATION';
    const revealContact = !['NEW', 'REJECTED'].includes(workflowStatus) || Boolean(latestOrder);

    return {
      ...row,
      customer_phone: revealContact ? row.customer_mobile : null,
      status: workflowStatus,
      workflow_status: workflowStatus,
      workflow_bucket: workflowBucket,
      quote_count: rowQuotes.length,
      active_quote_count: activeQuotes.length,
      rejected_quote_count: rejectedQuotes.length,
      had_rejected_quote: rejectedQuotes.length > 0,
      re_quote_available: rejectedQuotes.length > 0 && !latestOrder,
      re_quote_sent: rejectedQuotes.length > 0 && activeQuotes.length > 0,
      rejection_reason: latestRejectedQuote?.rejection_reason ?? row.reject_reason ?? null,
      latest_rejected_quote: latestRejectedQuote,
      quote_status: latestQuote?.status ?? null,
      quotation_id: latestQuote?.quotation_id ?? null,
      order_id: latestOrder?.order_id ?? null,
      latest_step: latestStep?.step ?? null,
      quotations: rowQuotes,
      orders: rowOrders.map((order: any) => ({
        ...order,
        plans: plans.filter((plan: any) => Number(plan.order_id) === Number(order.order_id)),
        order_step_logs: steps.filter((step: any) => Number(step.order_id) === Number(order.order_id)),
      })),
    };
  });
}

vendorRouter.get('/me', async (req: AuthRequest, res, next) => {
  try { ok(res, { vendor: await one<any>('SELECT * FROM vendors WHERE vendor_id = :id', { id: req.user!.id }) }); } catch (err) { next(err); }
});

vendorRouter.put('/me', async (req: AuthRequest, res, next) => {
  try {
    const body = z.object({
      name: z.string().optional(),
      full_name: z.string().optional(),
      owner_name: z.string().optional(),
      company_name: z.string().optional(),
      email: z.string().optional(),
      email_id: z.string().optional(),
      state: z.union([z.string(), z.number()]).optional(),
      state_id: z.union([z.string(), z.number()]).optional(),
      city: z.union([z.string(), z.number()]).optional(),
      city_id: z.union([z.string(), z.number()]).optional(),
      address: z.string().optional(),
      pincode: z.union([z.string(), z.number()]).optional(),
      description: z.string().optional(),
      about: z.string().optional(),
      short_bio: z.string().optional(),
      profile_image: z.string().optional(),
      profile_photo: z.string().optional(),
      gst_number: z.string().optional(),
      is_gst_registered: z.boolean().optional(),
      fcm_token: z.string().optional(),
    }).parse(req.body);

    const vendor = await vendorSvc.updateVendor(req.user!.id, {
      name: blankToNull(body.name),
      full_name: blankToNull(body.full_name ?? body.owner_name),
      owner_name: blankToNull(body.owner_name ?? body.full_name),
      company_name: blankToNull(body.company_name),
      email: blankToNull(body.email ?? body.email_id),
      state: blankToNull(body.state ?? body.state_id),
      city: blankToNull(body.city ?? body.city_id),
      address: blankToNull(body.address),
      pincode: blankToNull(body.pincode),
      about: blankToNull(body.about ?? body.description ?? body.short_bio),
      short_bio: blankToNull(body.short_bio ?? body.description ?? body.about),
      profile_image: blankToNull(body.profile_image ?? body.profile_photo),
      profile_photo: blankToNull(body.profile_photo ?? body.profile_image),
      gst_number: blankToNull(body.gst_number),
      is_gst_registered: body.is_gst_registered ?? null,
      fcm_token: blankToNull(body.fcm_token),
    });
    ok(res, { vendor });
  } catch (err) { next(err); }
});

vendorRouter.get('/dashboard', async (req: AuthRequest, res, next) => {
  try {
    const [projects, enquiries, wallet] = await Promise.all([
      query<any>('SELECT * FROM orders WHERE vendor_id = :id ORDER BY order_id DESC LIMIT 10', { id: req.user!.id }),
      query<any>(`SELECT e.*,
              CASE WHEN EXISTS (
                SELECT 1 FROM quotation q
                 WHERE q.enquiry_id = e.enquiry_id
                   AND LOWER(COALESCE(q.status, '')) IN ('accepted', 'approved')
              ) THEN 'accepted' ELSE e.status END AS workflow_status
         FROM enquiries e
        WHERE e.vendor_id = :id
        ORDER BY e.enquiry_id DESC LIMIT 10`, { id: req.user!.id }),
      one<any>('SELECT * FROM vendor_wallet WHERE vendor_id = :id', { id: req.user!.id }),
    ]);
    ok(res, { projects, enquiries, wallet });
  } catch (err) { next(err); }
});

vendorRouter.get('/enquiries', async (req: AuthRequest, res, next) => {
  try { ok(res, { enquiries: await vendorWorkflowEnquiries(req.user!.id) }); } catch (err) { next(err); }
});

vendorRouter.get('/enquiries/:id', async (req: AuthRequest, res, next) => {
  try {
    const [enquiry] = await vendorWorkflowEnquiries(req.user!.id, req.params.id);
    if (!enquiry) throw new ApiError(404, 'Enquiry not found');
    ok(res, { enquiry, quotes: enquiry.quotations, orders: enquiry.orders });
  } catch (err) { next(err); }
});

vendorRouter.post('/enquiries/:id/quotes', async (req: AuthRequest, res, next) => {
  try {
    const body = z.object({
      amount: z.number(),
      message: z.string().optional(),
      estimatedDays: z.number().optional(),
      validUntil: z.string().optional(),
      files: z.string().optional(),
    }).parse(req.body);

    // v4.5.23 — Ownership check. Previously this INSERT only used the
    // calling vendor's id as the vendor_id but never verified that the
    // enquiry was actually addressed to them. A vendor who knew (or
    // guessed) another vendor's enquiry_id could post a quote on it.
    // Also defends against quoting on rejected/cancelled enquiries.
    const enquiry = await one<any>(
      `SELECT enquiry_id, customer_id, service_id, status FROM enquiries
        WHERE enquiry_id = :id AND vendor_id = :vendorId LIMIT 1`,
      { id: req.params.id, vendorId: req.user!.id },
    );
    if (!enquiry) throw new ApiError(404, 'Enquiry not found');
    if (['cancelled', 'completed'].includes(String(enquiry.status).toLowerCase())) {
      throw new ApiError(400, `Cannot quote on a ${enquiry.status} enquiry`);
    }
    const previousRejectedQuote = await one<any>(
      `SELECT quotation_id, COALESCE(quote_version, 1) AS quote_version
         FROM quotation
        WHERE enquiry_id = :enquiryId
          AND vendor_id = :vendorId
          AND (LOWER(COALESCE(status, '')) = 'rejected' OR status_int = 3)
        ORDER BY quotation_id DESC
        LIMIT 1`,
      { enquiryId: req.params.id, vendorId: req.user!.id },
    );

    const tax = calculateTax({ baseAmount: body.amount });
    const totalGst = tax.gstOnPlatformFee + tax.gstOnProject;
    // Populate both canonical and mobile compatibility fields so a quote
    // created on web can be accepted and paid from either client.
    const result = await exec(
      `INSERT INTO quotation
         (enquiry_id, customer_id, vendor_id, sender_role, sender_id, receiver_id,
          service_id, amount, subtotal, platform_fee, gst_amount, total, final_amount,
          message, estimated_days, service_time, valid_until, files,
          parent_id, quote_version, status, status_int, created_at)
       VALUES (:enquiryId, :customerId, :vendorId, 'VENDOR', :vendorId, :customerId,
          :serviceId, :amount, :amount, :platformFee, :gstAmount, :total, :total,
          :message, :estimatedDays, :serviceTime, :validUntil, :files,
          :parentId, :quoteVersion, 'sent', 11, NOW())`,
      {
        enquiryId:     req.params.id,
        customerId:    enquiry.customer_id,
        vendorId:      req.user!.id,
        serviceId:     enquiry.service_id ?? null,
        amount:        body.amount,
        platformFee:   tax.platformFee,
        gstAmount:     totalGst,
        total:         tax.customerTotal,
        message:       body.message       ?? null,
        estimatedDays: body.estimatedDays ?? null,
        serviceTime:   body.estimatedDays !== undefined ? String(body.estimatedDays) : null,
        validUntil:    body.validUntil    ?? null,
        files:         body.files         ?? null,
        parentId:      previousRejectedQuote?.quotation_id ?? null,
        quoteVersion:  Number(previousRejectedQuote?.quote_version ?? 0) + 1,
      },
    );
    await exec(`UPDATE quotation SET id = quotation_id WHERE quotation_id = :id AND (id IS NULL OR id = 0)`, { id: result.insertId });
    await exec(`UPDATE enquiries SET status = 'quoted', status_int = 11 WHERE enquiry_id = :id`, { id: req.params.id });
    ok(res, {
      quote: await one<any>('SELECT * FROM quotation WHERE quotation_id = :id', { id: result.insertId }),
      re_quote: Boolean(previousRejectedQuote),
      previous_rejected_quote_id: previousRejectedQuote?.quotation_id ?? null,
    }, 201);
  } catch (err) { next(err); }
});

vendorRouter.put('/enquiries/:id/quotes/:quoteId', async (req: AuthRequest, res, next) => {
  try {
    const body = z.object({
      amount: z.number(),
      message: z.string().optional(),
      estimatedDays: z.number().optional(),
      validUntil: z.string().optional(),
      files: z.string().optional(),
    }).parse(req.body);

    const quote = await one<any>(
      `SELECT q.*
         FROM quotation q
         JOIN enquiries e ON e.enquiry_id = q.enquiry_id
        WHERE q.quotation_id = :quoteId
          AND q.enquiry_id = :enquiryId
          AND q.vendor_id = :vendorId
          AND e.vendor_id = :vendorId
        LIMIT 1`,
      { quoteId: req.params.quoteId, enquiryId: req.params.id, vendorId: req.user!.id },
    );
    if (!quote) throw new ApiError(404, 'Quote not found');
    if (['accepted', 'rejected', 'cancelled'].includes(String(quote.status || '').toLowerCase())) {
      throw new ApiError(400, `${quote.status} quotes cannot be edited`);
    }

    const tax = calculateTax({ baseAmount: body.amount });
    const totalGst = tax.gstOnPlatformFee + tax.gstOnProject;
    await exec(
      `UPDATE quotation
          SET amount = :amount,
              subtotal = :amount,
              platform_fee = :platformFee,
              gst_amount = :gstAmount,
              total = :total,
              final_amount = :total,
              message = COALESCE(:message, message),
              estimated_days = COALESCE(:estimatedDays, estimated_days),
              service_time = COALESCE(:serviceTime, service_time),
              valid_until = COALESCE(:validUntil, valid_until),
              files = COALESCE(:files, files),
              status = 'sent', status_int = 11
        WHERE quotation_id = :quoteId`,
      {
        quoteId: req.params.quoteId,
        amount: body.amount,
        platformFee: tax.platformFee,
        gstAmount: totalGst,
        total: tax.customerTotal,
        message: body.message ?? null,
        estimatedDays: body.estimatedDays ?? null,
        serviceTime: body.estimatedDays !== undefined ? String(body.estimatedDays) : null,
        validUntil: body.validUntil ?? null,
        files: body.files ?? null,
      },
    );
    await exec(`UPDATE enquiries SET status = 'quoted', status_int = 11 WHERE enquiry_id = :id`, { id: req.params.id });
    ok(res, { quote: await one<any>('SELECT * FROM quotation WHERE quotation_id = :id', { id: req.params.quoteId }) });
  } catch (err) { next(err); }
});

vendorRouter.get('/projects', async (req: AuthRequest, res, next) => {
  try {
    // JOIN customer name + roll up plan status + escrow totals so the
    // vendor's "Ongoing Jobs" cards show real values (not "Customer #X
    // · ₹0 paid · NOT STARTED"). Same shape the detail endpoint now
    // returns so adaptJob behaves identically in both contexts.
    const projects = await query<any>(
      `SELECT o.*,
              c.name AS customer_name,
              c.profile_image AS customer_profile_image,
              COALESCE(esc.escrow_total, 0) AS escrow_total,
              COALESCE(esc.escrow_held,   0) AS escrow_held,
              COALESCE(esc.escrow_released, 0) AS escrow_released,
              CASE
                WHEN plan.has_revision    > 0 THEN 'REVISION_REQUESTED'
                WHEN plan.all_approved    > 0 AND plan.pending_count = 0 THEN 'APPROVED'
                WHEN plan.pending_count   > 0 THEN 'SUBMITTED'
                WHEN plan.total_count     > 0 THEN 'APPROVED'
                ELSE 'NOT_STARTED'
              END AS plan_status_rollup
         FROM orders o
         LEFT JOIN customers c ON c.customer_id = o.customer_id
         LEFT JOIN (
           SELECT order_id,
                  SUM(COALESCE(base_amount, amount)) AS escrow_total,
                  SUM(CASE WHEN status = 'escrow_held'   THEN COALESCE(base_amount, amount) ELSE 0 END) AS escrow_held,
                  SUM(CASE WHEN status = 'released'      THEN COALESCE(base_amount, amount) ELSE 0 END) AS escrow_released
             FROM payment_intents
            WHERE status IN ('escrow_held','released')
            GROUP BY order_id
         ) esc ON esc.order_id = o.order_id
         LEFT JOIN (
           SELECT order_id,
                  COUNT(*) AS total_count,
                  SUM(CASE WHEN customer_status = 'pending'             THEN 1 ELSE 0 END) AS pending_count,
                  SUM(CASE WHEN customer_status IN ('approved', 'awaiting_payment', 'paid') THEN 1 ELSE 0 END) AS all_approved,
                  SUM(CASE WHEN customer_status = 'revision_requested'  THEN 1 ELSE 0 END) AS has_revision
             FROM order_plan
            GROUP BY order_id
         ) plan ON plan.order_id = o.order_id
        WHERE o.vendor_id = :id
        ORDER BY o.order_id DESC`,
      { id: req.user!.id },
    );
    ok(res, { projects });
  } catch (err) { next(err); }
});

vendorRouter.get('/projects/:id', async (req: AuthRequest, res, next) => {
  try {
    const project = await one<any>(
      `SELECT o.*, c.name AS customer_name, c.profile_image AS customer_profile_image,
              s.rating AS customer_rating, s.comment AS customer_close_comment,
              s.release_status, s.released_at, s.release_note
         FROM orders o
         LEFT JOIN customers c ON c.customer_id = o.customer_id
         LEFT JOIN signoffs s ON s.order_id = o.order_id
        WHERE o.order_id = :id AND o.vendor_id = :vendorId`,
      { id: req.params.id, vendorId: req.user!.id },
    );
    const plan = await query<any>(
      'SELECT * FROM order_plan WHERE order_id = :id ORDER BY plan_id ASC',
      { id: req.params.id },
    );
    // Roll up payment_intents so the vendor's dashboard shows
    // "Paid in escrow" rather than ₹0 until milestones complete.
    const intents = await query<any>(
      `SELECT amount, base_amount, status, purpose, platform_fee_amount, vendor_payout_amount FROM payment_intents
        WHERE order_id = :id AND status IN ('escrow_held','released')`,
      { id: req.params.id },
    );
    const escrow_held    = intents.filter((i: any) => i.status === 'escrow_held')
                                  .reduce((s: number, i: any) => s + Number(i.base_amount ?? i.amount), 0);
    const escrow_released = intents.filter((i: any) => i.status === 'released')
                                  .reduce((s: number, i: any) => s + Number(i.base_amount ?? i.amount), 0);
    const payment_summary = {
      total_quote_amount: Number(project?.amount ?? 0),
      initial_payment: intents.filter((i: any) => i.purpose === 'quote').reduce((s: number, i: any) => s + Number(i.base_amount ?? i.amount), 0),
      milestone_payments: intents.filter((i: any) => i.purpose === 'milestone').reduce((s: number, i: any) => s + Number(i.base_amount ?? i.amount), 0),
      material_payments: intents.filter((i: any) => i.purpose === 'materials').reduce((sum: number, intent: any) => sum + Number(intent.base_amount ?? intent.amount), 0),
      material_platform_fees: intents.filter((i: any) => i.purpose === 'materials').reduce((sum: number, intent: any) => sum + Number(intent.platform_fee_amount ?? 0), 0),
      material_vendor_payout: intents.filter((i: any) => i.purpose === 'materials').reduce((sum: number, intent: any) => sum + Number(intent.vendor_payout_amount ?? intent.base_amount ?? intent.amount), 0),
      total_paid: intents.reduce((sum: number, intent: any) => sum + Number(intent.base_amount ?? intent.amount), 0),
      release_status: project?.release_status ?? null,
    };
    ok(res, {
      project, plan, payment_summary,
      escrow: { held: escrow_held, released: escrow_released, total: escrow_held + escrow_released },
    });
  } catch (err) { next(err); }
});

vendorRouter.post('/kyc', async (req: AuthRequest, res, next) => {
  try {
    const proofType = req.body?.proofType ?? req.body?.proof_type ?? req.body?.kyc_id_type ?? null;
    const proofNumber = req.body?.proofNumber ?? req.body?.proof_number ?? req.body?.kyc_id_number ?? null;
    const documentUrl = req.body?.documentUrl ?? req.body?.document_url ?? req.body?.kyc_document_url ?? req.body?.kyc_id_image ?? null;
    const selfieUrl = req.body?.selfieUrl ?? req.body?.selfie_url ?? req.body?.kyc_selfie ?? null;
    await vendorSvc.updateVendor(req.user!.id, {
      proof_type: proofType,
      proof_number: proofNumber,
      kyc_document_url: documentUrl,
      kyc_id_type: proofType,
      kyc_id_number: proofNumber,
      kyc_id_image: documentUrl,
      kyc_selfie: selfieUrl,
      kyc_status: 'pending',
    });
    const { queueId } = await vendorSvc.submitVendorForReview(req.user!.id, 'web_kyc');
    ok(res, { message: 'KYC submitted', queue_id: queueId });
  } catch (err) { next(err); }
});

vendorRouter.get('/earnings', async (req: AuthRequest, res, next) => {
  try {
    const wallet = await one<any>('SELECT * FROM vendor_wallet WHERE vendor_id = :id', { id: req.user!.id });
    // Source transactions from the canonical escrow_ledger (released
    // rows) so the customer sign-off → wallet credit is visible
    // immediately. Falls back to the legacy vendor_transactions table
    // for older vendors who pre-date v4.0.
    const ledgerTxns = await query<any>(
      `SELECT entry_id     AS id,
              intent_id, order_id, vendor_id, amount,
              'CREDIT'     AS type,
              reason       AS reason,
              CONCAT('Escrow release · ',
                COALESCE(NULLIF(reason, ''), 'milestone'),
                COALESCE(CONCAT(' · Order #', order_id), '')
              ) AS description,
              'released'   AS status,
              created_at
         FROM escrow_ledger
        WHERE vendor_id = :id AND direction = 'release'
        ORDER BY entry_id DESC LIMIT 50`,
      { id: req.user!.id },
    );
    const transactions = ledgerTxns.length
      ? ledgerTxns
      : await query<any>(
          'SELECT * FROM vendor_transactions WHERE vendor_id = :id ORDER BY id DESC LIMIT 50',
          { id: req.user!.id },
        );
    ok(res, { wallet, transactions });
  } catch (err) { next(err); }
});

vendorRouter.get('/listings', async (req: AuthRequest, res, next) => {
  try { ok(res, { listings: await query<any>('SELECT * FROM vendor_services WHERE vendor_id = :id ORDER BY vendor_service_id DESC', { id: req.user!.id }) }); } catch (err) { next(err); }
});

vendorRouter.post('/listings', async (req: AuthRequest, res, next) => {
  try {
    const body = z.object({ title: z.string(), description: z.string().optional(), price: z.number().optional(), unit: z.string().optional(), category_id: z.any().optional() }).parse(req.body);
    const result = await exec(`INSERT INTO vendor_services (vendor_id, title, description, price, unit, category_id, status, created_at) VALUES (:vendorId, :title, :description, :price, :unit, :category_id, 1, NOW())`, { ...body, vendorId: req.user!.id });
    ok(res, { listing: await one<any>('SELECT * FROM vendor_services WHERE vendor_service_id = :id', { id: result.insertId }) }, 201);
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────────────────────
 *  P0 additions — accept/reject, plan CRUD, materials,
 *  milestone updates, payment requests.
 *  All vendor-scoped; ownership enforced inside each handler.
 * ───────────────────────────────────────────────────────────── */

// Helper: ensure the order belongs to this vendor before mutating.
async function assertOrderBelongs(orderId: string | number | undefined | string[], vendorId: number | string) {
  const row = await one<any>(
    `SELECT order_id FROM orders WHERE order_id = :id AND vendor_id = :vendorId LIMIT 1`,
    { id: String(orderId ?? ''), vendorId },
  );
  if (!row) throw new ApiError(404, 'Order not found');
}

/* ── Enquiry accept / reject ─────────────────────────────── */
vendorRouter.post('/enquiries/:id/accept', async (req: AuthRequest, res, next) => {
  try {
    const result: any = await exec(
      `UPDATE enquiries SET status = 'accepted', status_int = 2, accepted_at = NOW()
         WHERE enquiry_id = :id AND vendor_id = :vendorId`,
      { id: req.params.id, vendorId: req.user!.id },
    );
    if (!result.affectedRows) throw new ApiError(404, 'Enquiry not found');
    ok(res, { enquiry_id: Number(req.params.id), status: 'accepted' });
  } catch (err) { next(err); }
});

vendorRouter.post('/enquiries/:id/reject', async (req: AuthRequest, res, next) => {
  try {
    const reason = z.object({ reason: z.string().optional() }).parse(req.body).reason || null;
    const result: any = await exec(
      `UPDATE enquiries SET status = 'rejected', status_int = 3, rejected_at = NOW(), reject_reason = :reason
         WHERE enquiry_id = :id AND vendor_id = :vendorId`,
      { id: req.params.id, vendorId: req.user!.id, reason },
    );
    if (!result.affectedRows) throw new ApiError(404, 'Enquiry not found');
    ok(res, { enquiry_id: Number(req.params.id), status: 'rejected' });
  } catch (err) { next(err); }
});

/* ── Plan CRUD + submit ──────────────────────────────────── */
const milestoneSchema = z.object({
  plan_id:     z.number().int().optional(),
  title:       z.string().min(1),
  description: z.string().optional(),
  amount:      z.number().nonnegative(),
  days:        z.number().int().nonnegative().default(0),
  percentage:  z.number().nonnegative().default(0),
  mandatory:   z.boolean().default(true),
});

vendorRouter.post('/projects/:id/plan', async (req: AuthRequest, res, next) => {
  try {
    const orderId = req.params.id;
    await assertOrderBelongs(orderId, req.user!.id);
    const milestones = z.array(milestoneSchema).min(1).parse(req.body.milestones || []);
    const total = milestones.reduce((s, m) => s + (m.percentage || 0), 0);
    if (Math.round(total) !== 100) throw new ApiError(400, `Milestone percentages must total 100 (got ${total})`);

    await transaction(async (conn) => {
      await conn.query(`DELETE FROM order_plan WHERE order_id = ?`, [orderId]);
      for (const m of milestones) {
        const [result]: any = await conn.query(
          `INSERT INTO order_plan (order_id, title, description, amount, days, percentage, mandatory,
                                    vendor_status, customer_status, completion_days,
                                    amount_percentage, balance_cost, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', 'pending', ?, ?, ?, 1)`,
          [orderId, m.title, m.description || null, m.amount, m.days, m.percentage,
           m.mandatory ? 1 : 0, String(m.days), Math.round(m.percentage), m.amount],
        );
        await conn.query(
          `UPDATE order_plan SET id = plan_id WHERE plan_id = ? AND (id IS NULL OR id = 0)`,
          [result.insertId],
        );
      }
    });
    const plan = await query<any>(`SELECT * FROM order_plan WHERE order_id = :id ORDER BY plan_id ASC`, { id: orderId });
    ok(res, { plan }, 201);
  } catch (err) { next(err); }
});

vendorRouter.put('/projects/:id/plan', async (req: AuthRequest, res, next) => {
  try {
    const orderId = req.params.id;
    await assertOrderBelongs(orderId, req.user!.id);
    const milestones = z.array(milestoneSchema).parse(req.body.milestones || []);
    await transaction(async (conn) => {
      for (const m of milestones) {
        if (!m.plan_id) continue;
        await conn.query(
          `UPDATE order_plan SET title = ?, description = ?, amount = ?, days = ?,
                                  percentage = ?, mandatory = ?, completion_days = ?,
                                  amount_percentage = ?, balance_cost = ?
             WHERE plan_id = ? AND order_id = ?`,
          [m.title, m.description || null, m.amount, m.days, m.percentage,
           m.mandatory ? 1 : 0, String(m.days), Math.round(m.percentage), m.amount,
           m.plan_id, orderId],
        );
      }
    });
    const plan = await query<any>(`SELECT * FROM order_plan WHERE order_id = :id ORDER BY plan_id ASC`, { id: orderId });
    ok(res, { plan });
  } catch (err) { next(err); }
});

vendorRouter.post('/projects/:id/plan/submit', async (req: AuthRequest, res, next) => {
  try {
    const orderId = req.params.id;
    await assertOrderBelongs(orderId, req.user!.id);
    const totalPct = await one<{ total: number | string }>(
      `SELECT COALESCE(SUM(percentage), 0) AS total FROM order_plan WHERE order_id = :id`,
      { id: orderId },
    );
    if (Math.round(Number(totalPct?.total ?? 0)) !== 100) {
      throw new ApiError(400, 'Plan total must equal 100% before submit');
    }
    const lastVersion = await one<{ v: number }>(
      `SELECT COALESCE(MAX(version), 0) AS v FROM plan_submissions WHERE order_id = :id`,
      { id: orderId },
    );
    await transaction(async (conn) => {
      await conn.query(
        `INSERT INTO plan_submissions (order_id, version, status) VALUES (?, ?, 'submitted')`,
        [orderId, Number(lastVersion?.v ?? 0) + 1],
      );
      await conn.query(
        `UPDATE order_plan SET vendor_status = 'submitted', customer_status = 'pending'
           WHERE order_id = ?`,
        [orderId],
      );
      // Keep the canonical web submit flow structurally identical to the
      // legacy mobile createAcceptPlan flow.  The Flutter project screen
      // derives its four progress stages from order_step_logs, so writing
      // only step 2 leaves website-created orders permanently truncated.
      for (const step of [
        { step: 2, status: '1', remarks: 'Implementation plan submitted' },
        { step: 3, status: '1', remarks: 'Proposal approved & advance paid' },
        { step: 4, status: '0', remarks: 'Core implementation' },
      ]) {
        const [stepRows]: any = await conn.query(
          `SELECT id FROM order_step_logs WHERE order_id = ? AND step = ? LIMIT 1`,
          [orderId, step.step],
        );
        if (!Array.isArray(stepRows) || stepRows.length === 0) {
          await conn.query(
            `INSERT INTO order_step_logs
               (order_id, step, step_status, performed_by, performed_by_id, remarks)
             VALUES (?, ?, ?, 'VENDOR', ?, ?)`,
            [orderId, step.step, step.status, req.user!.id, step.remarks],
          );
        }
      }
    });
    ok(res, { order_id: Number(orderId), status: 'submitted' });
  } catch (err) { next(err); }
});

/* ── Materials CRUD ──────────────────────────────────────── */
const materialSchema = z.object({
  name:     z.string().min(1),
  quantity: z.number().nonnegative().default(1),
  unit:     z.string().default('pc'),
  rate:     z.number().nonnegative().default(0),
  status:   z.enum(['UNPAID', 'AWAITING_PAYMENT', 'PAID']).default('UNPAID'),
});

vendorRouter.get('/projects/:id/materials', async (req: AuthRequest, res, next) => {
  try {
    await assertOrderBelongs(req.params.id, req.user!.id);
    const materials = await query<any>(
      `SELECT * FROM materials WHERE order_id = :id ORDER BY material_id ASC`,
      { id: req.params.id },
    );
    ok(res, { materials });
  } catch (err) { next(err); }
});

vendorRouter.post('/projects/:id/materials', async (req: AuthRequest, res, next) => {
  try {
    await assertOrderBelongs(req.params.id, req.user!.id);
    const m = materialSchema.parse(req.body);
    // Shared service dual-writes `materials` (web) and
    // `order_plan_materials` (legacy Flutter/Node contract).
    const material = await materialSvc.addMaterial(String(req.params.id), m);
    ok(res, { material }, 201);
  } catch (err) { next(err); }
});

vendorRouter.put('/projects/:id/materials/:materialId', async (req: AuthRequest, res, next) => {
  try {
    await assertOrderBelongs(req.params.id, req.user!.id);
    const m = materialSchema.partial().parse(req.body);
    const cur = await one<any>(
      `SELECT * FROM materials WHERE material_id = :id AND order_id = :orderId`,
      { id: req.params.materialId, orderId: req.params.id },
    );
    if (!cur) throw new ApiError(404, 'Material not found');
    const material = await materialSvc.updateMaterial(
      String(req.params.id),
      String(req.params.materialId),
      m,
    );
    ok(res, { material });
  } catch (err) { next(err); }
});

vendorRouter.post('/projects/:id/materials/:materialId/payment-request', async (req: AuthRequest, res, next) => {
  try {
    const material = await one<any>(
      `SELECT m.*, o.customer_id, o.vendor_id
         FROM materials m
         JOIN orders o ON o.order_id = m.order_id
        WHERE m.material_id = :materialId AND m.order_id = :orderId
        LIMIT 1`,
      { materialId: req.params.materialId, orderId: req.params.id },
    );
    if (!material || Number(material.vendor_id) !== Number(req.user!.id)) throw new ApiError(404, 'Material not found');
    if (String(material.status).toUpperCase() === 'PAID') throw new ApiError(409, 'Material has already been paid');
    const alreadyRequested = String(material.status).toUpperCase() === 'AWAITING_PAYMENT';
    if (!alreadyRequested) {
      await exec(
        `UPDATE materials SET status = 'AWAITING_PAYMENT' WHERE material_id = :materialId AND order_id = :orderId`,
        { materialId: req.params.materialId, orderId: req.params.id },
      );
      await notifSvc.notify({
        recipient_type: 'customer', recipient_id: material.customer_id,
        type: 'material_payment_request', title: 'Material payment requested',
        body: `${material.name} is ready for payment`,
        data: { order_id: material.order_id, material_id: material.material_id, amount: Number(material.total) },
      });
    }
    ok(res, { material_id: Number(material.material_id), status: 'awaiting_payment', amount: Number(material.total), notification_sent: !alreadyRequested });
  } catch (err) { next(err); }
});

/* ── Milestone updates / completion / payment-request ───── */
vendorRouter.post('/milestones/:id/updates', async (req: AuthRequest, res, next) => {
  try {
    const { comment, image_urls } = z.object({
      comment: z.string().optional(),
      image_urls: z.array(z.string().url()).optional(),
    }).parse(req.body);
    // Verify ownership through order_plan → orders.
    const owner = await one<any>(
      `SELECT o.vendor_id FROM order_plan p JOIN orders o ON o.order_id = p.order_id
        WHERE p.plan_id = :id LIMIT 1`,
      { id: req.params.id },
    );
    if (!owner || Number(owner.vendor_id) !== Number(req.user!.id)) throw new ApiError(404, 'Milestone not found');
    const result: any = await exec(
      `INSERT INTO milestone_updates (plan_id, vendor_id, comment, image_urls)
       VALUES (:planId, :vendorId, :comment, :images)`,
      { planId: req.params.id, vendorId: req.user!.id, comment: comment || null, images: image_urls ? JSON.stringify(image_urls) : null },
    );
    const update = await one<any>(`SELECT * FROM milestone_updates WHERE update_id = :id`, { id: result.insertId });
    ok(res, { update }, 201);
  } catch (err) { next(err); }
});

vendorRouter.post('/milestones/:id/complete', async (req: AuthRequest, res, next) => {
  try {
    const owner = await one<any>(
      `SELECT o.vendor_id, p.order_id FROM order_plan p JOIN orders o ON o.order_id = p.order_id
        WHERE p.plan_id = :id LIMIT 1`,
      { id: req.params.id },
    );
    if (!owner || Number(owner.vendor_id) !== Number(req.user!.id)) throw new ApiError(404, 'Milestone not found');
    let finalStepReady = false;
    await transaction(async (conn) => {
      await conn.query(
        `UPDATE order_plan
            SET vendor_status = 'completed', status = 10, balance_cost = 0, updated_at = NOW()
          WHERE plan_id = ?`,
        [req.params.id],
      );
      const [pendingRows]: any = await conn.query(
        `SELECT COUNT(*) AS pending_count
           FROM order_plan
          WHERE order_id = ?
            AND NOT (vendor_status = 'completed' OR status = 10)`,
        [owner.order_id],
      );
      finalStepReady = Number(pendingRows?.[0]?.pending_count ?? 0) === 0;
      if (finalStepReady) {
        const [stepRows]: any = await conn.query(
          `SELECT id FROM order_step_logs WHERE order_id = ? AND step = 4 LIMIT 1`,
          [owner.order_id],
        );
        if (Array.isArray(stepRows) && stepRows.length) {
          await conn.query(
            `UPDATE order_step_logs
                SET step_status = '1', performed_by = 'VENDOR',
                    performed_by_id = ?, remarks = 'All milestones completed'
              WHERE id = ?`,
            [req.user!.id, stepRows[0].id],
          );
        } else {
          await conn.query(
            `INSERT INTO order_step_logs
               (order_id, step, step_status, performed_by, performed_by_id, remarks)
             VALUES (?, 4, '1', 'VENDOR', ?, 'All milestones completed')`,
            [owner.order_id, req.user!.id],
          );
        }
        await conn.query(
          `UPDATE orders SET status = 'awaiting_customer_close' WHERE order_id = ?`,
          [owner.order_id],
        );
      }
    });
    ok(res, {
      plan_id: Number(req.params.id),
      order_id: Number(owner.order_id),
      status: 'completed',
      final_step_ready: finalStepReady,
    });
  } catch (err) { next(err); }
});

vendorRouter.post('/milestones/:id/payment-request', async (req: AuthRequest, res, next) => {
  try {
    const owner = await one<any>(
      `SELECT o.vendor_id, o.order_id, p.amount FROM order_plan p JOIN orders o ON o.order_id = p.order_id
        WHERE p.plan_id = :id LIMIT 1`,
      { id: req.params.id },
    );
    if (!owner || Number(owner.vendor_id) !== Number(req.user!.id)) throw new ApiError(404, 'Milestone not found');
    const paid = await one<any>(
      `SELECT COALESCE(SUM(amount), 0) AS total
         FROM payment_intents
        WHERE order_id = :orderId AND purpose = 'quote' AND status IN ('escrow_held', 'released')`,
      { orderId: owner.order_id },
    );
    const order = await one<any>('SELECT amount FROM orders WHERE order_id = :id', { id: owner.order_id });
    if (Number(paid?.total ?? 0) >= Number(order?.amount ?? 0) && Number(order?.amount ?? 0) > 0) {
      throw new ApiError(409, 'The quote has already been paid in full');
    }
    await exec(
      `UPDATE order_plan SET customer_status = 'awaiting_payment' WHERE plan_id = :id`,
      { id: req.params.id },
    );
    ok(res, { plan_id: Number(req.params.id), status: 'awaiting_payment', amount: Number(owner.amount) });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────────────────────
 *  Vendor self-service: submit for admin review.
 *  Called by the web app right after a new vendor finishes the
 *  sign-up / onboarding form. Drops the vendor into
 *  vendor_review_queue and fires an optional notification to the
 *  admin portal so the ops team can pick it up for manual KYC.
 * ───────────────────────────────────────────────────────────── */
vendorRouter.post('/submit-for-review', async (req: AuthRequest, res, next) => {
  try {
    const vendorId = Number(req.user!.id);
    const reason = z.object({ note: z.string().optional() }).parse(req.body || {}).note ?? null;

    const { vendor, queueId } = await vendorSvc.submitVendorForReview(vendorId, 'web_signup', reason);

    // Fire-and-forget notification to the admin portal (env-configurable).
    // We don't block the response on it — failure is logged + retryable.
    const { notifyAdminNewVendor } = await import('../utils/adminNotify');
    notifyAdminNewVendor({ queueId, vendorId, vendor }).catch(() => { /* swallow */ })

    ok(res, {
      queue_id:  queueId,
      vendor_id: vendorId,
      status:    'PENDING',
      message:   'Submitted for admin verification',
    }, 201);
  } catch (err) { next(err); }
});
