/**
 * paymentService — single payment_intents + escrow_ledger pipeline used
 * by both the web (paymentsApi.createOrder + verify) and the legacy
 * mobile shims (/customer/placeOrder + /customer/payment_update).
 *
 * Mobile's old flow used to credit vendor_wallet directly from
 * placeOrder. That MUST NOT happen anymore — every payment goes
 * through:
 *
 *   1. createPaymentOrder  → INSERT payment_intent (status='initiated')
 *                            + Razorpay order
 *   2. verifyPayment       → HMAC check + transition to 'escrow_held'
 *                            + INSERT escrow_ledger 'hold' row
 *   3. releaseEscrow       → triggered by milestone complete / signoff
 *                            → INSERT 'release' row + credit vendor_wallet
 */
import { exec, one, query, transaction } from '../db';
import { ApiError } from '../utils/http';
import { calculateTax } from './tax';
import { createRazorpayOrder, verifyRazorpaySignature } from '../utils/razorpay';
// Re-export the canonical releaseEscrow so legacy routes can call it.
export { releaseEscrow } from '../routes/payments';

export type Purpose = 'quote' | 'milestone' | 'materials';

export interface CreateIntentInput {
  customerId: number | string;
  amount: number;
  purpose: Purpose;
  enquiry_id?: number;
  order_id?: number;
  milestone_id?: number;
  material_ids?: number[];
  currency?: string;
  idempotency_key: string;
}

function amountMatches(a: number, b: number) { return Math.abs(Math.round(a) - Math.round(b)) <= 1; }

export async function resolveExpectedAmount(opts: {
  purpose: Purpose; customerId: number | string;
  enquiry_id?: number; order_id?: number; milestone_id?: number; material_ids?: number[];
}): Promise<{ expected: number; orderId: number | null; vendorId: number | null }> {
  const { purpose, customerId } = opts;
  if (purpose === 'quote') {
    if (!opts.enquiry_id) throw new ApiError(400, 'enquiry_id required');
    const enquiry = await one<any>(
      `SELECT enquiry_id, customer_id, vendor_id FROM enquiries
        WHERE enquiry_id = :id AND customer_id = :cid LIMIT 1`,
      { id: opts.enquiry_id, cid: customerId },
    );
    if (!enquiry) throw new ApiError(403, 'Enquiry not found');
    const quote = await one<any>(
      `SELECT quotation_id, amount, status FROM quotation
        WHERE enquiry_id = :id ORDER BY quotation_id DESC LIMIT 1`,
      { id: opts.enquiry_id },
    );
    if (!quote) throw new ApiError(400, 'No quote for this enquiry');
    if (String(quote.status).toLowerCase() !== 'accepted') {
      throw new ApiError(400, `Quote must be accepted (status: ${quote.status})`);
    }
    const tax = calculateTax({ baseAmount: Number(quote.amount) });
    return { expected: tax.customerTotal, orderId: null, vendorId: enquiry.vendor_id ?? null };
  }
  if (purpose === 'materials') {
    if (!opts.order_id) throw new ApiError(400, 'order_id required');
    if (!opts.material_ids?.length) throw new ApiError(400, 'material_ids required');
    const order = await one<any>(
      `SELECT order_id, customer_id, vendor_id FROM orders
        WHERE order_id = :id AND customer_id = :cid LIMIT 1`,
      { id: opts.order_id, cid: customerId },
    );
    if (!order) throw new ApiError(403, 'Order not found');
    const planApproved = await one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM order_plan WHERE order_id = :id AND customer_status = 'approved'`,
      { id: opts.order_id },
    );
    if (!planApproved || Number(planApproved.n) === 0) {
      throw new ApiError(400, 'Plan must be approved before material payment');
    }
    const rows = await query<any>(
      `SELECT material_id, total, status FROM materials
        WHERE order_id = :id AND material_id IN (:ids)`,
      { id: opts.order_id, ids: opts.material_ids } as any,
    );
    if (rows.length !== opts.material_ids.length) throw new ApiError(400, 'Materials missing');
    for (const m of rows) {
      const s = String(m.status).toUpperCase();
      if (s !== 'UNPAID' && s !== 'AWAITING_PAYMENT') {
        throw new ApiError(400, `Material ${m.material_id} not payable (${m.status})`);
      }
    }
    const subtotal = rows.reduce((s, r) => s + Number(r.total), 0);
    const tax = calculateTax({ baseAmount: subtotal });
    return { expected: tax.customerTotal, orderId: opts.order_id, vendorId: order.vendor_id ?? null };
  }
  // milestone
  if (!opts.milestone_id) throw new ApiError(400, 'milestone_id required');
  const m = await one<any>(
    `SELECT p.plan_id, p.order_id, p.amount, p.customer_status, o.customer_id, o.vendor_id
       FROM order_plan p JOIN orders o ON o.order_id = p.order_id
      WHERE p.plan_id = :id AND o.customer_id = :cid LIMIT 1`,
    { id: opts.milestone_id, cid: customerId },
  );
  if (!m) throw new ApiError(403, 'Milestone not found');
  if (String(m.customer_status).toLowerCase() !== 'awaiting_payment') {
    throw new ApiError(400, `Milestone not awaiting payment (${m.customer_status})`);
  }
  const tax = calculateTax({ baseAmount: Number(m.amount) });
  return { expected: tax.customerTotal, orderId: m.order_id, vendorId: m.vendor_id ?? null };
}

export async function createPaymentIntent(b: CreateIntentInput) {
  const existing = await one<any>(
    'SELECT * FROM payment_intents WHERE idempotency_key = :key LIMIT 1',
    { key: b.idempotency_key },
  );
  if (existing) {
    return {
      intent_id: existing.intent_id,
      razorpay_order_id: existing.razorpay_order_id,
      amount: Number(existing.amount),
      status: existing.status,
      reused: true,
    };
  }
  const { expected, orderId } = await resolveExpectedAmount({
    purpose: b.purpose, customerId: b.customerId,
    enquiry_id: b.enquiry_id, order_id: b.order_id,
    milestone_id: b.milestone_id, material_ids: b.material_ids,
  });
  if (!amountMatches(b.amount, expected)) {
    throw new ApiError(400, `Amount mismatch: sent ${b.amount} expected ${expected}`);
  }
  const finalOrderId = orderId ?? b.order_id ?? null;
  const rzOrder = await createRazorpayOrder({
    amount: expected, currency: b.currency ?? 'INR',
    receipt: b.idempotency_key.slice(0, 40),
    notes: { customer_id: String(b.customerId), purpose: b.purpose },
  });
  const result: any = await exec(
    `INSERT INTO payment_intents
       (idempotency_key, customer_id, order_id, enquiry_id, milestone_id, material_ids,
        amount, purpose, status, razorpay_order_id)
     VALUES (:key, :cid, :oid, :eid, :mid, :mids, :amt, :p, 'initiated', :rz)`,
    {
      key: b.idempotency_key, cid: b.customerId, oid: finalOrderId,
      eid: b.enquiry_id ?? null, mid: b.milestone_id ?? null,
      mids: b.material_ids ? JSON.stringify(b.material_ids) : null,
      amt: expected, p: b.purpose, rz: rzOrder.id,
    },
  );
  return {
    intent_id: result.insertId,
    razorpay_order_id: rzOrder.id,
    amount: expected,
    currency: b.currency ?? 'INR',
    status: 'initiated' as const,
  };
}

export interface VerifyInput {
  customerId: number | string;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export async function verifyAndHold(b: VerifyInput) {
  const valid = verifyRazorpaySignature(b.razorpay_order_id, b.razorpay_payment_id, b.razorpay_signature);
  const intent = await one<any>(
    'SELECT * FROM payment_intents WHERE razorpay_order_id = :id LIMIT 1',
    { id: b.razorpay_order_id },
  );
  if (!intent) throw new ApiError(404, 'Payment intent not found');
  if (Number(intent.customer_id) !== Number(b.customerId)) throw new ApiError(403, 'Not your payment');
  if (!valid) {
    await exec(
      `UPDATE payment_intents SET status = 'failed', razorpay_payment_id = :pid,
                                    razorpay_signature = :sig, failure_reason = 'signature_mismatch'
         WHERE intent_id = :id`,
      { pid: b.razorpay_payment_id, sig: b.razorpay_signature, id: intent.intent_id },
    );
    throw new ApiError(400, 'Invalid Razorpay signature');
  }
  await transaction(async (conn) => {
    await conn.query(
      `UPDATE payment_intents
          SET status = 'escrow_held', razorpay_payment_id = ?, razorpay_signature = ?
        WHERE intent_id = ?`,
      [b.razorpay_payment_id, b.razorpay_signature, intent.intent_id],
    );
    await conn.query(
      `INSERT INTO escrow_ledger (intent_id, order_id, vendor_id, amount, direction, reason)
       VALUES (?, ?, NULL, ?, 'hold', ?)`,
      [intent.intent_id, intent.order_id, intent.amount, intent.purpose],
    );
    if (intent.purpose === 'quote' && intent.enquiry_id) {
      const [existingOrder]: any = await conn.query(
        `SELECT order_id FROM orders WHERE enquiry_id = ? LIMIT 1`,
        [intent.enquiry_id],
      );
      if (Array.isArray(existingOrder) && existingOrder.length > 0) {
        await conn.query(`UPDATE orders SET status = 'active' WHERE enquiry_id = ?`, [intent.enquiry_id]);
      } else {
        await conn.query(
          `INSERT INTO orders (customer_id, vendor_id, enquiry_id, amount, status, created_at)
           SELECT e.customer_id, e.vendor_id, e.enquiry_id, ?, 'active', NOW()
             FROM enquiries e WHERE e.enquiry_id = ?`,
          [intent.amount, intent.enquiry_id],
        );
      }
      // Backfill payment_intents.order_id + escrow_ledger.order_id so
      // releaseEscrow can find this intent later (was previously left
      // NULL → finalStep never credited the vendor wallet).
      const [orderRow]: any = await conn.query(
        `SELECT order_id FROM orders WHERE enquiry_id = ? LIMIT 1`,
        [intent.enquiry_id],
      );
      const newOrderId = Array.isArray(orderRow) ? orderRow[0]?.order_id : null;
      if (newOrderId) {
        await conn.query(`UPDATE payment_intents SET order_id = ? WHERE intent_id = ?`, [newOrderId, intent.intent_id]);
        await conn.query(`UPDATE escrow_ledger SET order_id = ? WHERE intent_id = ? AND order_id IS NULL`, [newOrderId, intent.intent_id]);
      }
    }
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
  return { status: 'escrow_held' as const, intent_id: intent.intent_id };
}

export async function listCustomerPayments(customerId: number | string) {
  // Prefer payment_intents over the legacy payment_log table.
  return query<any>(
    `SELECT intent_id AS id, order_id, enquiry_id, amount, purpose, status, razorpay_order_id,
            razorpay_payment_id, created_at
       FROM payment_intents
      WHERE customer_id = :id
      ORDER BY intent_id DESC`,
    { id: customerId },
  );
}

export async function getOrderPaymentSummary(customerId: number | string, orderId: number | string) {
  await one<any>('SELECT order_id FROM orders WHERE order_id = :id AND customer_id = :cid', {
    id: orderId, cid: customerId,
  }).then((r) => { if (!r) throw new ApiError(404, 'Order not found'); });
  const intents = await query<any>(
    `SELECT * FROM payment_intents WHERE order_id = :id ORDER BY intent_id DESC`,
    { id: orderId },
  );
  const paid = intents
    .filter((i) => i.status === 'escrow_held' || i.status === 'released')
    .reduce((s, i) => s + Number(i.amount), 0);
  const order = await one<any>('SELECT amount FROM orders WHERE order_id = :id', { id: orderId });
  const total = Number(order?.amount ?? 0);
  return { order_id: Number(orderId), total, paid, remaining: Math.max(total - paid, 0), intents };
}
