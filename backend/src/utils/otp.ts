import axios from 'axios';
import { config } from '../config';
import { exec, one } from '../db';
import { ApiError } from './http';

export function generateOtp() {
  if (config.otpBypass) return config.otpBypassCode;
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function storeOtp(phone: string, purpose: string, otp: string) {
  await exec(
    `INSERT INTO otp_codes (phone, purpose, otp_hash, expires_at, consumed, created_at)
     VALUES (:phone, :purpose, SHA2(:otp, 256), DATE_ADD(NOW(), INTERVAL 10 MINUTE), false, NOW())`,
    { phone, purpose, otp }
  );
  // v4.5.2: also mirror the OTP onto the user row (vendors.otp /
  // customers.otp + expires_at + attempts + last_otp_sent_at). This
  // is the column set the mobile team's reference DB uses; their
  // direct queries (admin tooling, diagnostics) look there. Storage
  // in otp_codes remains the source of truth for verifyOtp().
  const table = purpose.startsWith('vendor') ? 'vendors' : 'customers';
  await exec(
    `UPDATE ${table}
        SET otp = :otp,
            otp_expires_at = DATE_ADD(NOW(), INTERVAL 10 MINUTE),
            otp_attempts = COALESCE(otp_attempts, 0) + 1,
            last_otp_sent_at = NOW()
      WHERE phone = :phone OR mobile = :phone`,
    { otp, phone },
  ).catch(() => { /* row may not exist yet on first-time signup */ });
}

export async function sendOtp(phone: string, otp: string) {
  if (!config.twoFactorApiKey || config.otpBypass) return { delivered: false, bypass: true };
  const url = `https://2factor.in/API/V1/${config.twoFactorApiKey}/SMS/${phone}/${otp}`;
  await axios.get(url, { timeout: 10000 });
  return { delivered: true };
}

export async function verifyOtp(phone: string, purpose: string, otp: string) {
  const row = await one<any>(
    `SELECT id FROM otp_codes
     WHERE phone = :phone AND purpose = :purpose AND consumed = false
       AND expires_at > NOW() AND otp_hash = SHA2(:otp, 256)
     ORDER BY id DESC LIMIT 1`,
    { phone, purpose, otp }
  );
  if (!row) throw new ApiError(400, 'Invalid or expired OTP');
  await exec(`UPDATE otp_codes SET consumed = true WHERE id = :id`, { id: row.id });
}
