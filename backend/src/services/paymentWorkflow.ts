import type { PoolConnection } from 'mysql2/promise';
import { ApiError } from '../utils/http';
import { isAcceptedQuoteStatus } from './quotePayment';

interface PaymentIntentRow {
  intent_id: number;
  customer_id: number;
  order_id?: number | null;
  enquiry_id?: number | null;
  quotation_id?: number | null;
  milestone_id?: number | null;
  base_amount?: number | string | null;
  amount: number | string;
  purpose: 'quote' | 'milestone' | 'materials';
  material_ids?: string | number[] | null;
  status?: string | null;
}

interface VerificationDetails {
  razorpayPaymentId: string;
  razorpaySignature: string;
}

function resultRows<T>(result: any): T[] {
  return Array.isArray(result?.[0]) ? result[0] as T[] : [];
}

async function acceptedQuoteForIntent(conn: PoolConnection, intent: PaymentIntentRow) {
  const [rows]: any = await conn.query(
    `SELECT q.*, e.customer_id AS enquiry_customer_id,
            e.vendor_id AS enquiry_vendor_id, e.service_id AS enquiry_service_id
       FROM quotation q
       JOIN enquiries e ON e.enquiry_id = q.enquiry_id
      WHERE q.enquiry_id = ?
        AND (? IS NULL OR q.quotation_id = ? OR q.id = ?)
      ORDER BY q.quotation_id DESC`,
    [intent.enquiry_id, intent.quotation_id ?? null, intent.quotation_id ?? null, intent.quotation_id ?? null],
  );
  const quotes = Array.isArray(rows) ? rows : [];
  const quote = quotes.find((row: any) => isAcceptedQuoteStatus(row.status, row.status_int));
  if (!quote) throw new ApiError(400, 'Accepted quote not found for this payment');
  return quote;
}

/**
 * Complete the shared post-Razorpay transaction used by web and mobile.
 * Quote payments create the same order + step-1 records consumed by the
 * mobile vendorEnuqiryList workflow, and retries cannot duplicate holds.
 */
export async function holdVerifiedPayment(
  conn: PoolConnection,
  intent: PaymentIntentRow,
  verification: VerificationDetails,
): Promise<{ orderId: number | null; vendorId: number | null }> {
  let orderId = intent.order_id ? Number(intent.order_id) : null;
  let vendorId: number | null = null;

  if (intent.purpose === 'quote' && intent.enquiry_id) {
    const quote = await acceptedQuoteForIntent(conn, intent);
    const quoteAmount = Number(quote.amount);
    if (!Number.isFinite(quoteAmount) || quoteAmount <= 0) {
      throw new ApiError(400, 'Accepted quote has an invalid amount');
    }

    const existingRows = resultRows<any>(await conn.query(
      `SELECT order_id FROM orders WHERE enquiry_id = ? ORDER BY order_id DESC LIMIT 1`,
      [intent.enquiry_id],
    ));
    orderId = Number(existingRows[0]?.order_id || 0) || null;
    vendorId = Number(quote.vendor_id ?? quote.enquiry_vendor_id ?? 0) || null;
    const serviceId = quote.service_id ?? quote.enquiry_service_id ?? null;
    const paymentJson = JSON.stringify({
      razorpay_payment_id: verification.razorpayPaymentId,
      payment_option: (intent as any).payment_option ?? 'full',
      base_amount: Number(intent.base_amount ?? quoteAmount),
    });

    if (orderId) {
      await conn.query(
        `UPDATE orders
            SET vendor_id = ?, quotation_id = ?, quote_id = ?, service_id = ?,
                amount = ?, order_amount = ?, currency = 'INR', payment_id = ?,
                payment_json = ?, payment_status = 'success', status = 'active', status_int = 1
          WHERE order_id = ?`,
        [vendorId, quote.quotation_id, quote.quotation_id, serviceId,
         quoteAmount, String(quoteAmount), verification.razorpayPaymentId,
         paymentJson, orderId],
      );
    } else {
      await conn.query(
        `INSERT INTO orders
           (customer_id, vendor_id, enquiry_id, quotation_id, quote_id, service_id,
            message, files, amount, order_amount, currency, payment_id, payment_json,
            payment_status, status, status_int, created_at)
         VALUES (?, ?, ?, ?, ?, ?, '', '', ?, ?, 'INR', ?, ?, 'success', 'active', 1, NOW())
         ON DUPLICATE KEY UPDATE
           vendor_id = VALUES(vendor_id), quotation_id = VALUES(quotation_id),
           quote_id = VALUES(quote_id), service_id = VALUES(service_id),
           amount = VALUES(amount), order_amount = VALUES(order_amount),
           payment_id = VALUES(payment_id), payment_json = VALUES(payment_json),
           payment_status = 'success', status = 'active', status_int = 1`,
        [quote.enquiry_customer_id, vendorId, intent.enquiry_id, quote.quotation_id,
         quote.quotation_id, serviceId, quoteAmount, String(quoteAmount),
         verification.razorpayPaymentId, paymentJson],
      );
      const insertedRows = resultRows<any>(await conn.query(
        `SELECT order_id FROM orders WHERE enquiry_id = ? ORDER BY order_id DESC LIMIT 1`,
        [intent.enquiry_id],
      ));
      orderId = Number(insertedRows[0]?.order_id || 0) || null;
      if (!orderId) throw new ApiError(500, 'Order could not be materialized after payment');
      await conn.query(
        `UPDATE orders SET id = order_id WHERE order_id = ? AND (id IS NULL OR id = 0)`,
        [orderId],
      );
    }

    await conn.query(
      `UPDATE quotation SET status = 'accepted', status_int = 2 WHERE quotation_id = ?`,
      [quote.quotation_id],
    );
    await conn.query(
      `UPDATE enquiries SET status = 'accepted', status_int = 2 WHERE enquiry_id = ?`,
      [intent.enquiry_id],
    );

    const stepRows = resultRows<any>(await conn.query(
      `SELECT id FROM order_step_logs WHERE order_id = ? AND step = 1 LIMIT 1`,
      [orderId],
    ));
    if (stepRows.length === 0) {
      await conn.query(
        `INSERT INTO order_step_logs
           (order_id, step, step_status, performed_by, performed_by_id, remarks)
         VALUES (?, 1, '1', 'CUSTOMER', ?, 'Order placed')`,
        [orderId, intent.customer_id],
      );
    }

    await conn.query(
      `UPDATE payment_intents
          SET order_id = ?, quotation_id = COALESCE(quotation_id, ?)
        WHERE intent_id = ?`,
      [orderId, quote.quotation_id, intent.intent_id],
    );
  } else if (orderId) {
    const orderRows = resultRows<any>(await conn.query(
      `SELECT vendor_id FROM orders WHERE order_id = ? LIMIT 1`,
      [orderId],
    ));
    vendorId = Number(orderRows[0]?.vendor_id || 0) || null;
  }

  await conn.query(
    `UPDATE payment_intents
        SET status = 'escrow_held', razorpay_payment_id = ?,
            razorpay_signature = COALESCE(NULLIF(?, ''), razorpay_signature)
      WHERE intent_id = ? AND status <> 'released'`,
    [verification.razorpayPaymentId, verification.razorpaySignature, intent.intent_id],
  );

  const holdRows = resultRows<any>(await conn.query(
    `SELECT entry_id FROM escrow_ledger
      WHERE intent_id = ? AND direction = 'hold' LIMIT 1`,
    [intent.intent_id],
  ));
  if (holdRows.length === 0) {
    await conn.query(
      `INSERT INTO escrow_ledger (intent_id, order_id, vendor_id, amount, direction, reason)
       VALUES (?, ?, ?, ?, 'hold', ?)`,
      [intent.intent_id, orderId, vendorId, intent.amount, intent.purpose],
    );
  } else {
    await conn.query(
      `UPDATE escrow_ledger
          SET order_id = COALESCE(order_id, ?), vendor_id = COALESCE(vendor_id, ?)
        WHERE intent_id = ? AND direction = 'hold'`,
      [orderId, vendorId, intent.intent_id],
    );
  }

  if (intent.purpose === 'milestone' && intent.milestone_id && orderId) {
    // A milestone payment request is a payment-state transition only. It
    // must never reopen the already approved plan.
    await conn.query(
      `UPDATE order_plan SET customer_status = 'paid', updated_at = NOW()
        WHERE plan_id = ? AND order_id = ?`,
      [intent.milestone_id, orderId],
    );
  }

  if (intent.purpose === 'materials' && intent.material_ids) {
    const ids = Array.isArray(intent.material_ids)
      ? intent.material_ids
      : JSON.parse(String(intent.material_ids));
    if (Array.isArray(ids) && ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      const materialRows = resultRows<any>(await conn.query(
        `SELECT material_id, order_id, name, quantity, unit, rate
           FROM materials WHERE material_id IN (${placeholders})`,
        ids,
      ));
      await conn.query(
        `UPDATE materials SET status = 'PAID' WHERE material_id IN (${placeholders})`,
        ids,
      );
      for (const material of materialRows) {
        await conn.query(
          `UPDATE order_plan_materials
              SET payment_status = 'PAID', status = 'PAID', balance_cost = 0,
                  updated_at = NOW()
            WHERE order_id = ? AND title = ?
              AND CAST(COALESCE(qty, '0') AS DECIMAL(18,4)) = ?
              AND CAST(COALESCE(unit_cost, 0) AS DECIMAL(18,4)) = ?`,
          [material.order_id, material.name, Number(material.quantity), Number(material.rate)],
        );
      }
    }
  }

  const existingLegacyPayment = resultRows<any>(await conn.query(
    `SELECT id FROM payment_log
      WHERE provider_payment_id = ? OR payment_id = ? LIMIT 1`,
    [verification.razorpayPaymentId, verification.razorpayPaymentId],
  ));
  if (existingLegacyPayment.length === 0) {
    const paymentType = intent.purpose === 'quote'
      ? 'place_order'
      : intent.purpose === 'milestone' ? 'plan' : 'material';
    const paymentData = intent.material_ids
      ? (Array.isArray(intent.material_ids) ? JSON.stringify(intent.material_ids) : String(intent.material_ids))
      : null;
    await conn.query(
      `INSERT INTO payment_log
         (order_id, customer_id, vendor_id, amount, status, provider,
          provider_payment_id, payment_id, payment_status, currency,
          base_amount, payment_amount, payment_date, payment_data,
          payment_type, notes, created_at)
       VALUES (?, ?, ?, ?, 'success', 'razorpay', ?, ?, 'success', 'INR',
               ?, ?, NOW(), ?, ?, ?, NOW())`,
      [orderId, intent.customer_id, vendorId, Number(intent.amount),
       verification.razorpayPaymentId, verification.razorpayPaymentId,
       Number(intent.base_amount ?? intent.amount), Number(intent.amount),
       paymentData, paymentType, intent.purpose],
    );
  }

  return { orderId, vendorId };
}
