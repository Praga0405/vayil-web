/**
 * Razorpay helpers — order creation + signature verification.
 *
 * The Razorpay SDK is optional at runtime: if `razorpay` isn't installed
 * (or credentials are missing), we fall back to a deterministic dev order
 * id so the rest of the payment pipeline can still be exercised. In
 * production both keys MUST be configured (RAZORPAY_KEY_ID + KEY_SECRET).
 */
import crypto from 'crypto';
import { config } from '../config';

interface CreateOrderArgs {
  amount: number;      // in INR rupees (we convert to paise internally)
  currency?: string;
  receipt?: string;
  notes?: Record<string, string>;
}

export async function createRazorpayOrder(args: CreateOrderArgs): Promise<{
  id: string; amount: number; currency: string; receipt?: string; status: string;
}> {
  const keyId = (config as any).razorpayKeyId || process.env.RAZORPAY_KEY_ID;
  const keySecret = (config as any).razorpayKeySecret || process.env.RAZORPAY_KEY_SECRET;
  const amountPaise = Math.round(args.amount * 100);

  if (!keyId || !keySecret) {
    // Dev fallback so the rest of the flow keeps working without keys.
    return {
      id: `order_dev_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
      amount: amountPaise,
      currency: args.currency || 'INR',
      receipt: args.receipt,
      status: 'created',
    };
  }

  let Razorpay: any;
  try { Razorpay = require('razorpay'); } catch { throw new Error('razorpay package not installed'); }
  const rz = new Razorpay({ key_id: keyId, key_secret: keySecret });
  const order = await rz.orders.create({
    amount: amountPaise,
    currency: args.currency || 'INR',
    receipt: args.receipt,
    notes: args.notes,
  });
  return order;
}

/**
 * Verify the HMAC SHA256 signature Razorpay sends on payment success.
 * Returns true if the signature matches `<order_id>|<payment_id>`.
 */
let warnedBypass = false;
export function verifyRazorpaySignature(orderId: string, paymentId: string, signature: string): boolean {
  const keySecret = (config as any).razorpayKeySecret || process.env.RAZORPAY_KEY_SECRET;
  const explicitBypass = process.env.PAYMENT_VERIFY_BYPASS === 'true';
  // Two ways to enter dev-bypass mode:
  //   1. No RAZORPAY_KEY_SECRET configured (typical local dev)
  //   2. PAYMENT_VERIFY_BYPASS=true explicitly set (smoke tests, staging
  //      with no Razorpay test creds yet)
  // Both routes accept any non-empty signature string. A clear warning
  // is logged exactly once per process so this is impossible to enable
  // accidentally in production without seeing it in the logs.
  if (!keySecret || explicitBypass) {
    if (!warnedBypass) {
      // eslint-disable-next-line no-console
      console.warn('[razorpay] SIGNATURE VERIFICATION BYPASS ACTIVE — ' +
        (explicitBypass ? 'PAYMENT_VERIFY_BYPASS=true' : 'RAZORPAY_KEY_SECRET is unset') +
        '. Never run this configuration in production.');
      warnedBypass = true;
    }
    return !!signature;
  }
  const expected = crypto
    .createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

/**
 * Verify the X-Razorpay-Signature header on webhook deliveries.
 * Razorpay signs the raw body with the webhook secret (config separate
 * from the API key secret — RAZORPAY_WEBHOOK_SECRET).
 */
export function verifyWebhookSignature(rawBody: string | Buffer, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || (config as any).razorpayKeySecret;
  if (!secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}
