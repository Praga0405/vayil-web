/**
 * Payment routes — PRD §12.2 escrow + verified payments.
 *
 *   POST /payments/create-order  → creates a Razorpay order + payment_intent (idempotent)
 *   POST /payments/verify        → verifies signature, flips intent to success/escrow_held
 *   POST /webhooks/razorpay      → server-to-server confirmation (raw body)
 *
 * Frontend MUST supply `Idempotency-Key` header (or `idempotency_key` in
 * the JSON body) on create-order and verify. Replays return the cached
 * response without double-charging.
 */
import { Router, raw, Request, Response } from 'express';
import { z } from 'zod';
import { exec, one, query, transaction } from '../db';
import { requireAuth } from '../middleware/auth';
import { idempotent } from '../middleware/idempotency';
import { AuthRequest } from '../types';
import { ApiError, ok } from '../utils/http';
import { createRazorpayOrder, verifyRazorpaySignature, verifyWebhookSignature } from '../utils/razorpay';

export const paymentsRouter = Router();

/* ───────────────────────── create-order ───────────────────────── */
const createOrderSchema = z.object({
  amount:        z.number().positive(),
  purpose:       z.enum(['quote', 'milestone', 'materials']).default('quote'),
  enquiry_id:    z.number().int().optional(),
  order_id:      z.number().int().optional(),
  milestone_id:  z.number().int().optional(),
  material_ids:  z.array(z.number().int()).optional(),
  idempotency_key: z.string().optional(),
  currency:      z.string().default('INR'),
});

paymentsRouter.post('/create-order',
  requireAuth(['customer']),
  idempotent(),
  async (req: AuthRequest, res, next) => {
    try {
      const body = createOrderSchema.parse(req.body);
      const idempotencyKey = (req.header('Idempotency-Key') || body.idempotency_key || `pi-${Date.now()}-${Math.random()}`).toString();
      const customerId = Number(req.user!.id);

      // If a payment_intent for this key already exists (race-safety on top
      // of the idempotency middleware), return it.
      const existing = await one<any>(
        `SELECT * FROM payment_intents WHERE idempotency_key = :key LIMIT 1`,
        { key: idempotencyKey },
      );
      if (existing) {
        return ok(res, {
          intent_id: existing.intent_id,
          razorpay_order_id: existing.razorpay_order_id,
          amount: Number(existing.amount),
          status: existing.status,
          reused: true,
        });
      }

      const rzOrder = await createRazorpayOrder({
        amount: body.amount,
        currency: body.currency,
        receipt: idempotencyKey.slice(0, 40),
        notes: { customer_id: String(customerId), purpose: body.purpose },
      });

      const result: any = await exec(
        `INSERT INTO payment_intents
           (idempotency_key, customer_id, order_id, enquiry_id, milestone_id, material_ids,
            amount, purpose, status, razorpay_order_id)
         VALUES (:key, :customerId, :orderId, :enquiryId, :milestoneId, :materialIds,
            :amount, :purpose, 'initiated', :razorpayOrderId)`,
        {
          key:          idempotencyKey,
          customerId,
          orderId:      body.order_id ?? null,
          enquiryId:    body.enquiry_id ?? null,
          milestoneId:  body.milestone_id ?? null,
          materialIds:  body.material_ids ? JSON.stringify(body.material_ids) : null,
          amount:       body.amount,
          purpose:      body.purpose,
          razorpayOrderId: rzOrder.id,
        },
      );

      ok(res, {
        intent_id:         result.insertId,
        razorpay_order_id: rzOrder.id,
        amount:            body.amount,
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

      await transaction(async (conn) => {
        await conn.query(
          `UPDATE payment_intents
              SET status = 'escrow_held',
                  razorpay_payment_id = ?,
                  razorpay_signature  = ?
            WHERE intent_id = ?`,
          [body.razorpay_payment_id, body.razorpay_signature, intent.intent_id],
        );
        await conn.query(
          `INSERT INTO escrow_ledger (intent_id, order_id, vendor_id, amount, direction, reason)
           VALUES (?, ?, NULL, ?, 'hold', ?)`,
          [intent.intent_id, intent.order_id, intent.amount, intent.purpose],
        );
        // If this was a quote acceptance payment, materialise the order row.
        if (intent.purpose === 'quote' && intent.enquiry_id) {
          await conn.query(
            `INSERT INTO orders (customer_id, vendor_id, enquiry_id, amount, status, created_at)
             SELECT e.customer_id, e.vendor_id, e.enquiry_id, ?, 'active', NOW()
               FROM enquiries e WHERE e.enquiry_id = ?
             ON DUPLICATE KEY UPDATE status = VALUES(status)`,
            [intent.amount, intent.enquiry_id],
          );
        }
        // If materials, flip them to PAID.
        if (intent.purpose === 'materials' && intent.material_ids) {
          const ids = JSON.parse(intent.material_ids);
          if (Array.isArray(ids) && ids.length > 0) {
            const placeholders = ids.map(() => '?').join(',');
            await conn.query(
              `UPDATE materials SET status = 'PAID' WHERE material_id IN (${placeholders})`,
              ids,
            );
          }
        }
      });

      ok(res, { status: 'escrow_held', intent_id: intent.intent_id });
    } catch (err) { next(err); }
  },
);

/* ───────────────────────── webhook (raw body) ──────────────── */
paymentsRouter.post('/webhooks/razorpay',
  raw({ type: '*/*', limit: '2mb' }),
  async (req: Request, res: Response, next) => {
    try {
      const signature = req.header('x-razorpay-signature') || '';
      const rawBody = (req.body as Buffer)?.toString('utf8') || '';
      const valid = verifyWebhookSignature(rawBody, signature);

      let payload: any = {};
      try { payload = JSON.parse(rawBody); } catch { /* keep empty */ }

      await exec(
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

      if (!valid) return res.status(400).json({ ok: false, error: 'invalid signature' });

      // Handle payment.captured / payment.failed
      const event = payload?.event as string | undefined;
      const entity = payload?.payload?.payment?.entity;
      if (event === 'payment.captured' && entity?.order_id) {
        const intent = await one<any>(
          `SELECT * FROM payment_intents WHERE razorpay_order_id = :id LIMIT 1`,
          { id: entity.order_id },
        );
        if (intent && intent.status !== 'escrow_held' && intent.status !== 'success') {
          await exec(
            `UPDATE payment_intents SET status = 'escrow_held', razorpay_payment_id = :pid WHERE intent_id = :id`,
            { pid: entity.id, id: intent.intent_id },
          );
          await exec(
            `INSERT INTO escrow_ledger (intent_id, order_id, amount, direction, reason)
             VALUES (:id, :oid, :amt, 'hold', 'webhook')`,
            { id: intent.intent_id, oid: intent.order_id, amt: intent.amount },
          );
        }
      }
      if (event === 'payment.failed' && entity?.order_id) {
        await exec(
          `UPDATE payment_intents SET status = 'failed', failure_reason = :reason
                                       WHERE razorpay_order_id = :id`,
          { reason: entity.error_description || 'payment_failed', id: entity.order_id },
        );
      }

      await exec(
        `UPDATE webhook_deliveries SET status = 'processed', processed_at = NOW()
                                       WHERE id = LAST_INSERT_ID()`,
      );
      res.json({ ok: true });
    } catch (err) { next(err); }
  },
);

/* ───────────────────────── helpers for other routes ─────────── */
// Convenience: release escrow → vendor wallet. Called when milestone is
// marked complete or the order is signed off.
export async function releaseEscrow(intentId: number) {
  const intent = await one<any>(`SELECT * FROM payment_intents WHERE intent_id = :id`, { id: intentId });
  if (!intent || intent.status !== 'escrow_held') return;
  await transaction(async (conn) => {
    await conn.query(
      `UPDATE payment_intents SET status = 'released' WHERE intent_id = ?`,
      [intentId],
    );
    await conn.query(
      `INSERT INTO escrow_ledger (intent_id, order_id, vendor_id, amount, direction, reason)
       SELECT intent_id, order_id,
              (SELECT vendor_id FROM orders WHERE order_id = pi.order_id),
              amount, 'release', 'milestone_complete'
         FROM payment_intents pi WHERE intent_id = ?`,
      [intentId],
    );
    await conn.query(
      `UPDATE vendor_wallet SET balance = balance + ?, total_earning = total_earning + ?
         WHERE vendor_id = (SELECT vendor_id FROM orders WHERE order_id = ?)`,
      [intent.amount, intent.amount, intent.order_id],
    );
  });
}
