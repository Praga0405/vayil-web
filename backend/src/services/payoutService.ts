/**
 * payoutService — vendor wallet → bank payout request lifecycle.
 * Mobile calls vendorPayout to kick this off; ops processes
 * the payout_requests row separately.
 */
import { exec, one, query, transaction } from '../db';
import { ApiError } from '../utils/http';
import { getPrimaryBank } from './bankService';

export async function requestPayout(vendorId: number | string, amount: number, bankId?: number | string, note?: string) {
  if (!amount || amount <= 0) throw new ApiError(400, 'amount must be > 0');
  const wallet = await one<any>('SELECT * FROM vendor_wallet WHERE vendor_id = :id', { id: vendorId });
  if (!wallet || Number(wallet.balance) < amount) {
    throw new ApiError(400, `Insufficient balance (have ${wallet?.balance ?? 0})`);
  }
  const bank = bankId
    ? await one<any>('SELECT * FROM bank_details WHERE bank_id = :id AND vendor_id = :vid',
        { id: bankId, vid: vendorId })
    : await getPrimaryBank(vendorId);
  if (!bank) throw new ApiError(400, 'No bank account on file');

  const payoutId = await transaction(async (conn) => {
    // Hold the funds: debit wallet immediately so the same balance can't
    // be requested twice. If ops rejects, we credit it back.
    await conn.query(
      `UPDATE vendor_wallet SET balance = balance - ? WHERE vendor_id = ?`,
      [amount, vendorId],
    );
    const [ins]: any = await conn.query(
      `INSERT INTO payout_requests (vendor_id, bank_id, amount, status, note)
       VALUES (?, ?, ?, 'requested', ?)`,
      [vendorId, bank.bank_id, amount, note ?? null],
    );
    return ins.insertId;
  });

  return one<any>('SELECT * FROM payout_requests WHERE payout_id = :id', { id: payoutId });
}

export async function listPayouts(vendorId: number | string, limit = 50) {
  return query<any>(
    `SELECT p.*, b.account_holder, b.account_number, b.ifsc_code
       FROM payout_requests p
       LEFT JOIN bank_details b ON b.bank_id = p.bank_id
      WHERE p.vendor_id = :id
      ORDER BY p.payout_id DESC
      LIMIT :limit`,
    { id: vendorId, limit },
  );
}

export async function getVendorTransactions(vendorId: number | string, opts: { currentMonth?: boolean; limit?: number } = {}) {
  // Canonical source is escrow_ledger (post-v4). vendor_transactions is
  // a legacy table that older mobile flows used to write into; reading
  // from the ledger means signoff-driven releases show up immediately.
  const where = ['vendor_id = :id', "direction = 'release'"];
  if (opts.currentMonth) {
    where.push("YEAR(created_at) = YEAR(NOW()) AND MONTH(created_at) = MONTH(NOW())");
  }
  const rows = await query<any>(
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
      WHERE ${where.join(' AND ')}
      ORDER BY entry_id DESC
      LIMIT :limit`,
    { id: vendorId, limit: opts.limit ?? 100 },
  );
  // Fall back to the legacy vendor_transactions table if the new ledger
  // is empty — keeps backwards compat for vendors who pre-date v4.0.
  if (rows.length > 0) return rows;
  const legacy = await query<any>(
    `SELECT * FROM vendor_transactions
       WHERE vendor_id = :id
        ${opts.currentMonth ? "AND YEAR(created_at) = YEAR(NOW()) AND MONTH(created_at) = MONTH(NOW())" : ''}
       ORDER BY id DESC LIMIT :limit`,
    { id: vendorId, limit: opts.limit ?? 100 },
  );
  return legacy;
}

export async function getRevenueChart(vendorId: number | string, months = 6) {
  // Sum per-month released amounts from escrow_ledger for this vendor.
  return query<any>(
    `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month,
            COALESCE(SUM(amount), 0)         AS revenue
       FROM escrow_ledger
      WHERE vendor_id = :id AND direction = 'release'
        AND created_at >= DATE_SUB(NOW(), INTERVAL :months MONTH)
      GROUP BY DATE_FORMAT(created_at, '%Y-%m')
      ORDER BY month ASC`,
    { id: vendorId, months },
  );
}
