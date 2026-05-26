/**
 * authService — single source of truth for OTP send/verify and account
 * resolution. Used by both the web canonical /auth/* routes and the
 * legacy mobile /customer/*, /vendor-* aliases.
 */
import { exec, one } from '../db';
import { signToken } from '../middleware/auth';
import { generateOtp, sendOtp, storeOtp, verifyOtp } from '../utils/otp';
import { ApiError } from '../utils/http';

export type UserKind = 'customer' | 'vendor';

export async function requestOtp(phone: string, userType: UserKind) {
  if (!phone || phone.length < 8) throw new ApiError(400, 'Phone is required');
  const otp = generateOtp();
  await storeOtp(phone, `${userType}_login`, otp);
  await sendOtp(phone, otp);
  return { phone, message: 'OTP sent successfully' };
}

export async function verifyOtpAndIssueToken(opts: {
  phone: string; otp: string; userType: UserKind; name?: string;
}) {
  const { phone, otp, userType, name } = opts;
  if (!phone || !otp) throw new ApiError(400, 'phone and otp are required');
  await verifyOtp(phone, `${userType}_login`, otp);
  const table = userType === 'customer' ? 'customers' : 'vendors';
  const idCol = userType === 'customer' ? 'customer_id' : 'vendor_id';
  const defaultName = userType === 'customer' ? 'Customer' : 'Vendor';

  let user = await one<any>(
    `SELECT * FROM ${table} WHERE phone = :phone OR mobile = :phone LIMIT 1`,
    { phone },
  );
  if (!user) {
    // Phone uniqueness across roles: refuse to create a vendor account
    // for a phone already registered as a customer (and vice versa).
    // A returning user must use the role they originally signed up
    // with. Existing users (already in the same `table`) are fine —
    // they just sign back in.
    const otherTable = userType === 'customer' ? 'vendors'   : 'customers';
    const otherRole  = userType === 'customer' ? 'vendor'    : 'customer';
    const collision  = await one<any>(
      `SELECT 1 AS hit FROM ${otherTable}
        WHERE phone = :phone OR mobile = :phone LIMIT 1`,
      { phone },
    );
    if (collision) {
      throw new ApiError(409,
        `This phone is already registered as a ${otherRole}. Sign in with that role instead, or use a different phone for the new ${userType} account.`,
      );
    }
    const result: any = await exec(
      `INSERT INTO ${table} (name, phone, mobile, status, created_at)
       VALUES (:name, :phone, :phone, :status, NOW())`,
      {
        name: name || defaultName,
        phone,
        status: userType === 'vendor' ? 'pending' : 'active',
      },
    );
    user = await one<any>(`SELECT * FROM ${table} WHERE ${idCol} = :id`, { id: result.insertId });
  }
  const token = signToken({ id: user[idCol], userType });
  return { token, userType, user };
}

/** Convenience for mobile register flow — same as requestOtp but tagged. */
export const registerAndSendOtp = (phone: string, userType: UserKind) => requestOtp(phone, userType);
