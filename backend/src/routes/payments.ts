/**
 * Payment routes — PRD §12.2 escrow + verified payments.
 *
 * Two separate routers ship from this module so the Express app can
 * mount the webhook BEFORE the global express.json() parser (so the
 * raw body survives for HMAC verification):
 *
 *   paymentsWebhookRouter
 *     POST /razorpay              ← mounted at /payments/webhooks and /webhooks
 *                                   (consumes raw body via express.raw())
 *
 *   paymentsRouter
 *     POST /create-order          ← validates ownership + recomputes amount
 *     POST /verify                ← HMAC-checks signature, flips intent to escrow_held
 *
 * Frontend MUST supply `Idempotency-Key` header (or `idempotency_key`
 * in the JSON body) on create-order and verify. Replays return the
 * cached response without double-charging.
 */
import { Router, raw, Request, Response } from 'express';
import { z } from 'zod';
import { exec, one, query, transaction } from '../db';
import { requireAuth } from '../middleware/auth';
import { idempotent } from '../middleware/idempotency';
import { AuthRequest } from '../types';
import { ApiError, ok } from '../utils/http';
import { calculateTax } from '../services/tax';
import { createRazorpayOrder, verifyRazorpaySignature, verifyWebhookSignature } from '../utils/razorpay';
import {
  isAcceptedQuoteStatus,
  resolveQuotePaymentBase,
  type QuotePaymentOption,
} from '../services/quotePayment';
import { holdVerifiedPayment } from '../services/paymentWorkflow';

export const paymentsRouter = Router();
export const paymentsWebhookRouter = Router();

/* ─────────────────────────────────────────────────────────────
 *  create-order
 *
 *  PRD audit: refuse to trust the frontend-supplied amount. For each
 *  purpose we re-derive the chargeable amount on the server and
 *  validate ownership (enquiry/order/quote/material/milestone).
 * ───────────────────────────────────────────────────────────── */
const createOrderSchema = z.object({
  amount:        z.number().positive(),
  purpose:       z.enum(['quote', 'milestone', 'materials']).default('quote'),
  enquiry_id:    z.number().int().optional(),
  quotation_id:  z.number().int().positive().optional(),
  base_amount:   z.number().positive().optional(),
  payment_option: z.enum(['full', 'minimum', 'custom']).optional(),
  order_id:      z.number().int().optional(),
  milestone_id:  z.number().int().optional(),
  material_ids:  z.array(z.number().int()).optional(),
  idempotency_key: z.string().optional(),
  currency:      z.string().default('INR'),
});

/** Allow a small rounding tolerance (≤ ₹1) when comparing client-supplied
 *  amount against the server-recomputed total, so paise rounding doesn't
 *  reject a legit payment. */
function amountMatches(claimed: number, expected: number): boolean {
  return Math.abs(Math.round(claimed) - Math.round(expected)) <= 1;
}

async function resolveExpectedAmount(
  purpose: 'quote' | 'milestone' | 'materials',
  args: {
    customerId: number;
    enquiry_id?: number;
    quotation_id?: number;
    base_amount?: number;
    payment_option?: QuotePaymentOption;
    order_id?: number;
    milestone_id?: number;
    material_ids?: number[];
  },
): Promise<{
  expected: number;
  baseAmount: number;
  orderId: number | null;
  vendorId: number | null;
  quotationId: number | null;
}> {
  const settings = await one<any>(
    `SELECT platform_fee_percentage, gst_percentage FROM settings ORDER BY id ASC LIMIT 1`,
  );
  const taxFor = (baseAmount: number) => calculateTax({
    baseAmount,
    platformFeePct: Number(settings?.platform_fee_percentage ?? 5),
    gstPct: Number(settings?.gst_percentage ?? 18),
  });

  if (purpose === 'quote') {
    if (!args.enquiry_id) throw new ApiError(400, 'enquiry_id required for quote payment');
    const enquiry = await one<any>(
      `SELECT enquiry_id, customer_id, vendor_id FROM enquiries
        WHERE enquiry_id = :id AND customer_id = :cid LIMIT 1`,
      { id: args.enquiry_id, cid: args.customerId },
    );
    if (!enquiry) throw new ApiError(403, 'Enquiry not found for this customer');
    const quotes = await query<any>(
      `SELECT quotation_id, id, amount, advance_amount, status, status_int
         FROM quotation
        WHERE enquiry_id = :id
          AND (:quotationId IS NULL OR quotation_id = :quotationId OR id = :quotationId)
        ORDER BY quotation_id DESC`,
      { id: args.enquiry_id, quotationId: args.quotation_id ?? null },
    );
    const quote = quotes.find((row) => isAcceptedQuoteStatus(row.status, row.status_int));
    if (!quote) throw new ApiError(400, 'No quote available for this enquiry');
    const baseAmount = resolveQuotePaymentBase({
      quoteAmount: Number(quote.amount),
      advanceAmount: quote.advance_amount,
      paymentOption: args.payment_option,
      requestedBaseAmount: args.base_amount,
    });
    const tax = taxFor(baseAmount);
    return {
      expected: tax.customerTotal,
      baseAmount,
      orderId: null,
      vendorId: enquiry.vendor_id ?? null,
      quotationId: Number(quote.quotation_id),
    };
  }

  if (purpose === 'materials') {
    if (!args.order_id) throw new ApiError(400, 'order_id required for material payment');
    if (!args.material_ids?.length) throw new ApiError(400, 'material_ids required for material payment');
    const order = await one<any>(
      `SELECT order_id, customer_id, vendor_id FROM orders
        WHERE order_id = :id AND customer_id = :cid LIMIT 1`,
      { id: args.order_id, cid: args.customerId },
    );
    if (!order) throw new ApiError(403, 'Order not found for this customer');
    // PRD §10.5 — plan must be approved before any material payment.
    const planApproved = await one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM order_plan
        WHERE order_id = :id AND customer_status = 'approved'`,
      { id: args.order_id },
    );
    if (!planApproved || Number(planApproved.n) === 0) {
      throw new ApiError(400, 'Plan must be approved before material payment');
    }
    const rows = await query<any>(
      `SELECT material_id, total, status FROM materials
        WHERE order_id = :id AND material_id IN (:ids)`,
      { id: args.order_id, ids: args.material_ids } as any,
    );
    if (rows.length !== args.material_ids.length) {
      throw new ApiError(400, 'One or more materials not found on this order');
    }
    for (const m of rows) {
      const s = String(m.status).toUpperCase();
      if (s !== 'UNPAID' && s !== 'AWAITING_PAYMENT') {
        throw new ApiError(400, `Material ${m.material_id} is not payable (status: ${m.status})`);
      }
    }
    const subtotal = rows.reduce((s, r) => s + Number(r.total), 0);
    const tax = taxFor(subtotal);
    return {
      expected: tax.customerTotal,
      baseAmount: subtotal,
      orderId: args.order_id,
      vendorId: order.vendor_id ?? null,
      quotationId: null,
    };
  }

  // milestone
  if (!args.milestone_id) throw new ApiError(400, 'milestone_id required for milestone payment');
  const milestone = await one<any>(
    `SELECT p.plan_id, p.order_id, p.amount, p.customer_status, o.customer_id, o.vendor_id
       FROM order_plan p
       JOIN orders o ON o.order_id = p.order_id
      WHERE p.plan_id = :id AND o.customer_id = :cid LIMIT 1`,
    { id: args.milestone_id, cid: args.customerId },
  );
  if (!milestone) throw new ApiError(403, 'Milestone not found for this customer');
  if (String(milestone.customer_status).toLowerCase() !== 'awaiting_payment') {
    throw new ApiError(400, `Milestone is not awaiting payment (status: ${milestone.customer_status})`);
  }
  const baseAmount = Number(milestone.amount);
  const tax = taxFor(baseAmount);
  return {
    expected: tax.customerTotal,
    baseAmount,
    orderId: milestone.order_id,
    vendorId: milestone.vendor_id ?? null,
    quotationId: null,
  };
}

paymentsRouter.post('/create-order',
  requireAuth(['customer']),
  idempotent(),
  async (req: AuthRequest, res, next) => {
    try {
      const body = createOrderSchema.parse(req.body);
      const idempotencyKey = (req.header('Idempotency-Key') || body.idempotency_key || `pi-${Date.now()}-${Math.random()}`).toString();
      const customerId = Number(req.user!.id);

      // Race-safety on top of the idempotency middleware: if the same key
      // already produced an intent, return it verbatim.
      const existing = await one<any>(
        `SELECT * FROM payment_intents WHERE idempotency_key = :key LIMIT 1`,
        { key: idempotencyKey },
      );
      if (existing) {
        return ok(res, {
          intent_id: existing.intent_id,
          razorpay_order_id: existing.razorpay_order_id,
          amount: Number(existing.amount),
          base_amount: Number(existing.base_amount ?? existing.amount),
          quotation_id: existing.quotation_id ?? null,
          payment_option: existing.payment_option ?? null,
          status: existing.status,
          reused: true,
        });
      }

      // 1) Ownership + state validation.
      // 2) Recompute expected amount; reject if client lied about the total.
      const { expected, baseAmount, orderId, quotationId } = await resolveExpectedAmount(body.purpose, {
        customerId,
        enquiry_id:   body.enquiry_id,
        quotation_id: body.quotation_id,
        base_amount: body.base_amount,
        payment_option: body.payment_option,
        order_id:     body.order_id,
        milestone_id: body.milestone_id,
        material_ids: body.material_ids,
      });
      if (!amountMatches(body.amount, expected)) {
        throw new ApiError(
          400,
          `Amount mismatch: client sent ${body.amount} but server expected ${expected}`,
        );
      }

      // Use the server-derived order_id so the intent stays linked correctly.
      const finalOrderId = orderId ?? body.order_id ?? null;

      const rzOrder = await createRazorpayOrder({
        amount: expected,
        currency: body.currency,
        receipt: idempotencyKey.slice(0, 40),
        notes: {
          customer_id: String(customerId),
          purpose: body.purpose,
          payment_option: body.payment_option ?? 'full',
          quotation_id: quotationId ? String(quotationId) : '',
        },
      });

      const result: any = await exec(
        `INSERT INTO payment_intents
           (idempotency_key, customer_id, order_id, enquiry_id, quotation_id,
            milestone_id, material_ids, base_amount, amount, payment_option,
            purpose, status, razorpay_order_id)
         VALUES (:key, :customerId, :orderId, :enquiryId, :quotationId,
            :milestoneId, :materialIds, :baseAmount, :amount, :paymentOption,
            :purpose, 'initiated', :razorpayOrderId)`,
        {
          key:          idempotencyKey,
          customerId,
          orderId:      finalOrderId,
          enquiryId:    body.enquiry_id ?? null,
          quotationId,
          milestoneId:  body.milestone_id ?? null,
          materialIds:  body.material_ids ? JSON.stringify(body.material_ids) : null,
          baseAmount,
          amount:       expected,
          paymentOption: body.purpose === 'quote' ? (body.payment_option ?? 'full') : null,
          purpose:      body.purpose,
          razorpayOrderId: rzOrder.id,
        },
      );

      ok(res, {
        intent_id:         result.insertId,
        razorpay_order_id: rzOrder.id,
        amount:            expected,
        base_amount:       baseAmount,
        quotation_id:      quotationId,
        payment_option:    body.purpose === 'quote' ? (body.payment_option ?? 'full') : null,
        currency:          body.currency,
        status:            'initiated',
      }, 201);
    } catch (err) { next(err); }
  },
);

/* ───────────────────────── verify ──────────────────────────── */
const verifySchema = z.object({
  razorpay_order_id:   z.string(),
  razorpay_payment_id: z.string(),
  razorpay_signature:  z.string(),
  idempotency_key:     z.string().optional(),
});

paymentsRouter.post('/verify',
  requireAuth(['customer']),
  idempotent(),
  async (req: AuthRequest, res, next) => {
    try {
      const body = verifySchema.parse(req.body);
      const valid = verifyRazorpaySignature(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature);

      const intent = await one<any>(
        `SELECT * FROM payment_intents WHERE razorpay_order_id = :id LIMIT 1`,
        { id: body.razorpay_order_id },
      );
      if (!intent) throw new ApiError(404, 'Payment intent not found');
      if (Number(intent.customer_id) !== Number(req.user!.id)) throw new ApiError(403, 'Not your payment');

      if (!valid) {
        await exec(
          `UPDATE payment_intents SET status = 'failed', razorpay_payment_id = :pid, razorpay_signature = :sig,
                                       failure_reason = 'signature_mismatch' WHERE intent_id = :id`,
          { pid: body.razorpay_payment_id, sig: body.razorpay_signature, id: intent.intent_id },
        );
        throw new ApiError(400, 'Invalid Razorpay signature');
      }

      if (intent.status === 'escrow_held' || intent.status === 'released') {
        return ok(res, {
          status: intent.status,
          intent_id: intent.intent_id,
          order_id: intent.order_id ?? null,
          reused: true,
        });
      }

      const held = await transaction((conn) => holdVerifiedPayment(conn, intent, {
        razorpayPaymentId: body.razorpay_payment_id,
        razorpaySignature: body.razorpay_signature,
      }));

      ok(res, {
        status: 'escrow_held',
        intent_id: intent.intent_id,
        order_id: held.orderId,
      });
    } catch (err) { next(err); }
  },
);

/* ─────────────────────────────────────────────────────────────
 *  webhook (raw body)
 *  Lives on a separate router so index.ts can mount it BEFORE the
 *  global express.json() parser. The path is /razorpay relative to
 *  the mount point — DO NOT also include /webhooks here or the URL
 *  becomes /payments/webhooks/webhooks/razorpay.
 * ───────────────────────────────────────────────────────────── */
paymentsWebhookRouter.post('/razorpay',
  raw({ type: '*/*', limit: '2mb' }),
  async (req: Request, res: Response, next) => {
    try {
      const signature = req.header('x-razorpay-signature') || '';
      const rawBody = (req.body as Buffer)?.toString('utf8') || '';
      const valid = verifyWebhookSignature(rawBody, signature);

      let payload: any = {};
      try { payload = JSON.parse(rawBody); } catch { /* keep empty */ }

      const inserted: any = await exec(
        `INSERT INTO webhook_deliveries (provider, event_id, event_type, payload, signature, status)
         VALUES ('razorpay', :eventId, :eventType, :payload, :sig, :status)`,
        {
          eventId:   payload?.event_id || payload?.id || null,
          eventType: payload?.event || null,
          payload:   rawBody,
          sig:       signature,
          status:    valid ? 'received' : 'invalid',
        },
      );
      const deliveryId = inserted?.insertId;

      if (!valid) return res.status(400).json({ ok: false, error: 'invalid signature' });

      const event = payload?.event as string | undefined;
      const entity = payload?.payload?.payment?.entity;
      if (event === 'payment.captured' && entity?.order_id) {
        const intent = await one<any>(
          `SELECT * FROM payment_intents WHERE razorpay_order_id = :id LIMIT 1`,
          { id: entity.order_id },
        );
        if (intent && intent.status !== 'escrow_held' && intent.status !== 'released') {
          await transaction((conn) => holdVerifiedPayment(conn, intent, {
            razorpayPaymentId: entity.id,
            // Checkout signatures are not included in captured-payment
            // webhooks. The shared workflow preserves any existing value.
            razorpaySignature: '',
          }));
        }
      }
      if (event === 'payment.failed' && entity?.order_id) {
        await exec(
          `UPDATE payment_intents SET status = 'failed', failure_reason = :reason
                                       WHERE razorpay_order_id = :id`,
          { reason: entity.error_description || 'payment_failed', id: entity.order_id },
        );
      }

      if (deliveryId) {
        await exec(
          `UPDATE webhook_deliveries SET status = 'processed', processed_at = NOW() WHERE id = :id`,
          { id: deliveryId },
        );
      }
      res.json({ ok: true });
    } catch (err) { next(err); }
  },
);

/* ─────────────────────────────────────────────────────────────
 *  releaseEscrow — held → released; credits vendor_wallet.
 *  Ensures a wallet row exists (INSERT ... ON DUPLICATE KEY UPDATE)
 *  before crediting it, so a brand-new vendor never silently
 *  swallows an escrow release.
 * ───────────────────────────────────────────────────────────── */
export async function releaseEscrow(intentId: number) {
  const intent = await one<any>(`SELECT * FROM payment_intents WHERE intent_id = :id`, { id: intentId });
  if (!intent || intent.status !== 'escrow_held') return;

  // Resolve the vendor_id outside the transaction so we can pre-ensure
  // a wallet row exists.
  const vendor = intent.order_id ? await one<{ vendor_id: number | null }>(
    `SELECT vendor_id FROM orders WHERE order_id = :id LIMIT 1`,
    { id: intent.order_id },
  ) : null;
  const vendorId = vendor?.vendor_id ?? null;

  await transaction(async (conn) => {
    await conn.query(
      `UPDATE payment_intents SET status = 'released' WHERE intent_id = ?`,
      [intentId],
    );
    await conn.query(
      `INSERT INTO escrow_ledger (intent_id, order_id, vendor_id, amount, direction, reason)
       VALUES (?, ?, ?, ?, 'release', 'milestone_complete')`,
      [intentId, intent.order_id, vendorId, intent.amount],
    );
    if (vendorId) {
      // Make sure the wallet row exists, then credit it. Two-step keeps the
      // SQL portable across MySQL versions.
      await conn.query(
        `INSERT INTO vendor_wallet (vendor_id, balance, total_earning)
         VALUES (?, 0, 0)
         ON DUPLICATE KEY UPDATE vendor_id = vendor_id`,
        [vendorId],
      );
      await conn.query(
        `UPDATE vendor_wallet
            SET balance = balance + ?, total_earning = total_earning + ?
          WHERE vendor_id = ?`,
        [intent.amount, intent.amount, vendorId],
      );
    }
  });
}
