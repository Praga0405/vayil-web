/**
 * authService — single source of truth for OTP send/verify and account
 * resolution. Used by both the web canonical /auth/* routes and the
 * legacy mobile /customer/*, /vendor-* aliases.
 */
import { exec, one } from '../db';
import { signToken } from '../middleware/auth';
import { generateOtp, resolvePhoneForOtp, sendOtp, storeOtp, verifyOtp } from '../utils/otp';
import { ApiError } from '../utils/http';

export type UserKind = 'customer' | 'vendor';

function idColumn(userType: UserKind) {
  return userType === 'customer' ? 'customer_id' : 'vendor_id';
}

function tableName(userType: UserKind) {
  return userType === 'customer' ? 'customers' : 'vendors';
}

function legacyUserOrder() {
  return `ORDER BY COALESCE(is_deleted, 0) ASC,
          CASE
            WHEN status IN ('verified', 'approved', 'active') THEN 0
            WHEN status IN ('pending', 'pending_approval') THEN 1
            ELSE 2
          END ASC,
          COALESCE(id, 999999999) ASC`;
}

async function findUserByPhone(userType: UserKind, phone: string) {
  const table = tableName(userType);
  return one<any>(
    `SELECT * FROM ${table}
      WHERE phone = :phone OR mobile = :phone
      ${legacyUserOrder()}
      LIMIT 1`,
    { phone },
  );
}

function roleConflictMessage(userType: UserKind) {
  const otherRole = userType === 'customer' ? 'vendor' : 'customer';
  return `This phone is already registered as a ${otherRole}. Sign in with that role instead, or use a different phone for the new ${userType} account.`;
}

export async function findUserByLegacyId(userType: UserKind, userId: number | string) {
  const table = tableName(userType);
  const idCol = idColumn(userType);
  return one<any>(
    `SELECT * FROM ${table}
      WHERE ${idCol} = :id OR id = :id
      ${legacyUserOrder()}
      LIMIT 1`,
    { id: userId },
  );
}

export async function requestOtp(phone: string, userType: UserKind) {
  if (!phone || phone.length < 8) throw new ApiError(400, 'Phone is required');
  const otp = generateOtp();
  await storeOtp(phone, `${userType}_login`, otp);
  await sendOtp(phone, otp);
  return { phone, message: 'OTP sent successfully' };
}

export async function requestLoginOtp(phone: string, userType: UserKind) {
  if (!phone || phone.length < 8) throw new ApiError(400, 'Phone is required');

  const user = await findUserByPhone(userType, phone);
  if (!user) {
    const otherUserType: UserKind = userType === 'customer' ? 'vendor' : 'customer';
    const collision = await findUserByPhone(otherUserType, phone);
    if (collision) throw new ApiError(409, roleConflictMessage(userType));

    const roleLabel = userType === 'customer' ? 'Customer' : 'Vendor';
    throw new ApiError(404, `${roleLabel} not found. Please register first.`);
  }

  await requestOtp(phone, userType);
  return { phone, message: 'OTP sent successfully', user };
}

export async function verifyOtpAndIssueToken(opts: {
  phone?: string; userId?: number | string; otp: string; userType: UserKind; name?: string;
}) {
  const { otp, userType, name } = opts;
  if (!otp) throw new ApiError(400, 'otp is required');
  const table = tableName(userType);
  const idCol = idColumn(userType);
  const defaultName = userType === 'customer' ? 'Customer' : 'Vendor';

  const purpose = `${userType}_login`;
  let user = opts.userId ? await findUserByLegacyId(userType, opts.userId) : null;
  let phone = String(opts.phone || user?.phone || user?.mobile || '').trim();
  if (!phone) phone = (await resolvePhoneForOtp(purpose, otp)) || '';
  if (!phone) throw new ApiError(400, 'phone or user id is required');

  await verifyOtp(phone, purpose, otp);

  if (!user) user = await findUserByPhone(userType, phone);
  if (!user) {
    // Phone uniqueness across roles: refuse to create a vendor account
    // for a phone already registered as a customer (and vice versa).
    // A returning user must use the role they originally signed up
    // with. Existing users (already in the same `table`) are fine —
    // they just sign back in.
    const otherTable = userType === 'customer' ? 'vendors'   : 'customers';
    const collision  = await one<any>(
      `SELECT 1 AS hit FROM ${otherTable}
        WHERE phone = :phone OR mobile = :phone LIMIT 1`,
      { phone },
    );
    if (collision) {
      throw new ApiError(409, roleConflictMessage(userType));
    }
    // v4.5.27 — supply ph_code on INSERT. Migration 006 added a NOT-NULL
    // `ph_code` column (country dialing code) to both customers + vendors
    // for mobile-team schema parity. Without it the INSERT throws
    // ER_NO_DEFAULT_FOR_FIELD on every signup. Default '91' (India) matches
    // every other code path that writes these tables.
    const result: any = await exec(
      `INSERT INTO ${table} (name, phone, mobile, ph_code, status, created_at)
       VALUES (:name, :phone, :phone, :ph_code, :status, NOW())`,
      {
        name: name || defaultName,
        phone,
        ph_code: '91',
        status: userType === 'vendor' ? 'pending' : 'approved',
      },
    );
    // Mirror legacy_id → mobile `id` column so cross-schema reads work.
    await exec(`UPDATE ${table} SET id = ${idCol} WHERE ${idCol} = :id`, { id: result.insertId }).catch(() => {});
    user = await one<any>(`SELECT * FROM ${table} WHERE ${idCol} = :id`, { id: result.insertId });
  }
  const token = signToken({ id: user[idCol], userType });
  return { token, userType, user };
}

/** Convenience for mobile register flow — same as requestOtp but tagged. */
export const registerAndSendOtp = (phone: string, userType: UserKind) => requestOtp(phone, userType);
