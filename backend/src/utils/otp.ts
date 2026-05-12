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
