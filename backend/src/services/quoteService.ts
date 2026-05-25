/**
 * quoteService — send / list / accept / reject. Powers
 * /vendor/sendQuotationToCustomer + /customer/QuotationList +
 * /customer/updateQuotation on mobile, and the canonical
 * /vendors/enquiries/:id/quotes + /customers/quotes/:id/{accept,reject}
 * on web.
 */
import { exec, one, query, transaction } from '../db';
import { ApiError } from '../utils/http';
import { calculateTax } from './tax';

export interface SendQuoteInput {
  vendor_id: number | string;
  enquiry_id: number | string;
  amount: number;
  message?: string;
  estimated_days?: number;
  valid_until?: string;
  advance_amount?: number;
}

export async function sendQuote(b: SendQuoteInput) {
  if (!b.amount || b.amount <= 0) throw new ApiError(400, 'amount must be > 0');
  const tax = calculateTax({ baseAmount: Number(b.amount) });
  const totalGst = (tax.gstOnPlatformFee ?? 0) + (tax.gstOnProject ?? 0);
  const result: any = await exec(
    `INSERT INTO quotation
       (enquiry_id, vendor_id, amount, message, estimated_days, valid_until,
        gst_amount, platform_fee, advance_amount, status, created_at)
     VALUES (:eid, :vid, :amount, :msg, :days, :valid,
             :gst, :fee, :adv, 'sent', NOW())`,
    {
      eid: b.enquiry_id, vid: b.vendor_id, amount: b.amount,
      msg: b.message ?? null, days: b.estimated_days ?? null,
      valid: b.valid_until ?? null,
      gst: totalGst, fee: tax.platformFee ?? null,
      adv: b.advance_amount ?? null,
    },
  );
  await exec(`UPDATE enquiries SET status = 'quoted' WHERE enquiry_id = :id`, { id: b.enquiry_id });
  return one<any>('SELECT * FROM quotation WHERE quotation_id = :id', { id: result.insertId });
}

export async function listQuotes(enquiryId: number | string) {
  return query<any>(
    'SELECT * FROM quotation WHERE enquiry_id = :id ORDER BY quotation_id DESC',
    { id: enquiryId },
  );
}

export async function getQuote(quotationId: number | string) {
  const row = await one<any>('SELECT * FROM quotation WHERE quotation_id = :id', { id: quotationId });
  if (!row) throw new ApiError(404, 'Quote not found');
  return row;
}

/** Ownership-checked accept (transactional — siblings → rejected, enquiry → accepted). */
export async function acceptQuote(customerId: number | string, quotationId: number | string) {
  const row = await one<any>(
    `SELECT q.quotation_id, q.enquiry_id
       FROM quotation q JOIN enquiries e ON e.enquiry_id = q.enquiry_id
      WHERE q.quotation_id = :id AND e.customer_id = :cid LIMIT 1`,
    { id: quotationId, cid: customerId },
  );
  if (!row) throw new ApiError(404, 'Quote not found');
  await transaction(async (conn) => {
    await conn.query(`UPDATE quotation SET status = 'accepted' WHERE quotation_id = ?`, [row.quotation_id]);
    await conn.query(
      `UPDATE quotation SET status = 'rejected'
         WHERE enquiry_id = ? AND quotation_id <> ? AND status = 'sent'`,
      [row.enquiry_id, row.quotation_id],
    );
    await conn.query(`UPDATE enquiries SET status = 'accepted' WHERE enquiry_id = ?`, [row.enquiry_id]);
  });
  return { quotation_id: row.quotation_id, enquiry_id: row.enquiry_id, status: 'accepted' };
}

export async function rejectQuote(customerId: number | string, quotationId: number | string, reason?: string) {
  const row = await one<any>(
    `SELECT q.quotation_id, q.enquiry_id
       FROM quotation q JOIN enquiries e ON e.enquiry_id = q.enquiry_id
      WHERE q.quotation_id = :id AND e.customer_id = :cid LIMIT 1`,
    { id: quotationId, cid: customerId },
  );
  if (!row) throw new ApiError(404, 'Quote not found');
  await exec(
    `UPDATE quotation SET status = 'rejected', message = COALESCE(:reason, message) WHERE quotation_id = :id`,
    { id: row.quotation_id, reason: reason ?? null },
  );
  return { quotation_id: row.quotation_id, enquiry_id: row.enquiry_id, status: 'rejected', reason: reason ?? null };
}
