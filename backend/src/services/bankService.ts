/**
 * bankService — vendor bank account CRUD. Edits go through an
 * `edit_requested_at` review workflow (matching the old mobile flow:
 * AddBankDetails / EditBankDetails / EditBankDetailsReq).
 */
import { exec, one, query } from '../db';
import { ApiError } from '../utils/http';

export interface BankDetailsInput {
  account_holder: string;
  account_number: string;
  ifsc_code: string;
  bank_name?: string;
  branch?: string;
  upi_id?: string;
  is_primary?: boolean;
}

export async function addBankDetails(vendorId: number | string, b: BankDetailsInput) {
  if (!b.account_holder || !b.account_number || !b.ifsc_code) {
    throw new ApiError(400, 'account_holder, account_number, ifsc_code required');
  }
  // If marked primary (or first row), demote others.
  const existing = await query<any>('SELECT bank_id FROM bank_details WHERE vendor_id = :id', { id: vendorId });
  const makePrimary = b.is_primary !== false && (existing.length === 0 || b.is_primary === true);
  if (makePrimary && existing.length) {
    await exec('UPDATE bank_details SET is_primary = false WHERE vendor_id = :id', { id: vendorId });
  }
  const result: any = await exec(
    `INSERT INTO bank_details (vendor_id, account_holder, account_number, ifsc_code,
                                bank_name, branch, upi_id, is_primary, status)
     VALUES (:vid, :holder, :acct, :ifsc, :bank, :branch, :upi, :primary, 'active')`,
    {
      vid: vendorId, holder: b.account_holder, acct: b.account_number, ifsc: b.ifsc_code,
      bank: b.bank_name ?? null, branch: b.branch ?? null, upi: b.upi_id ?? null,
      primary: makePrimary,
    },
  );
  return one<any>('SELECT * FROM bank_details WHERE bank_id = :id', { id: result.insertId });
}

export async function listBankDetails(vendorId: number | string) {
  return query<any>(
    'SELECT * FROM bank_details WHERE vendor_id = :id ORDER BY is_primary DESC, bank_id DESC',
    { id: vendorId },
  );
}

export async function getPrimaryBank(vendorId: number | string) {
  return one<any>(
    'SELECT * FROM bank_details WHERE vendor_id = :id AND is_primary = true LIMIT 1',
    { id: vendorId },
  );
}

/** Direct edit (admin / first edit after add). */
export async function editBankDetails(vendorId: number | string, bankId: number | string, b: Partial<BankDetailsInput>) {
  const cur = await one<any>(
    'SELECT * FROM bank_details WHERE bank_id = :id AND vendor_id = :vid',
    { id: bankId, vid: vendorId },
  );
  if (!cur) throw new ApiError(404, 'Bank record not found');
  const merged = { ...cur, ...b } as any;
  await exec(
    `UPDATE bank_details SET account_holder = :holder, account_number = :acct,
                              ifsc_code = :ifsc, bank_name = :bank, branch = :branch,
                              upi_id = :upi, status = 'active'
       WHERE bank_id = :id`,
    {
      id: bankId, holder: merged.account_holder, acct: merged.account_number,
      ifsc: merged.ifsc_code, bank: merged.bank_name, branch: merged.branch,
      upi: merged.upi_id,
    },
  );
  return one<any>('SELECT * FROM bank_details WHERE bank_id = :id', { id: bankId });
}

/** Request edit (queued for ops review — mobile EditBankDetailsReq). */
export async function requestEditBankDetails(vendorId: number | string, bankId: number | string, b: Partial<BankDetailsInput>) {
  const cur = await one<any>(
    'SELECT * FROM bank_details WHERE bank_id = :id AND vendor_id = :vid',
    { id: bankId, vid: vendorId },
  );
  if (!cur) throw new ApiError(404, 'Bank record not found');
  await exec(
    `UPDATE bank_details SET status = 'pending_edit', edit_requested_at = NOW(),
                              edit_payload = :payload
       WHERE bank_id = :id`,
    { id: bankId, payload: JSON.stringify(b) },
  );
  return one<any>('SELECT * FROM bank_details WHERE bank_id = :id', { id: bankId });
}
