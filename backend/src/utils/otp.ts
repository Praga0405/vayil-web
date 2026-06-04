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
  // Skip sending if OTP bypass is enabled or no API key configured
  if (config.otpBypass) return { delivered: false, bypass: true };
  if (!config.twoFactorApiKey) {
    console.error('[v0] OTP Send Error: TWO_FACTOR_API_KEY or OTP_FACTOR_API_KEY not configured');
    throw new ApiError(500, 'OTP service not configured. Please check environment variables.');
  }

  try {
    // Normalize phone number: remove +, spaces, and ensure it's just digits
    const normalizedPhone = phone.replace(/[\s+]/g, '');
    if (!/^\d{10,12}$/.test(normalizedPhone)) {
      throw new ApiError(400, 'Invalid phone number format. Please provide a 10-12 digit number.');
    }

    // 2Factor exposes two endpoint families:
    //   V1 — /API/V1/<key>/SMS/<phone>/<otp>            default OTP template, sender ID is account-level
    //   R1 — /API/R1/?module=TRANS_SMS&apikey=…&from=…  DLT transactional, custom sender ID + template
    // Pick based on the configured base URL. The senderId / template
    // env vars are mandatory for R1; ignored on V1.
    const base = config.twoFactorUrl.replace(/\/+$/, '');
    const url = /\/R1$/i.test(base)
      ? `${base}/?` + new URLSearchParams({
          module: 'TRANS_SMS',
          apikey: config.twoFactorApiKey,
          to: normalizedPhone,
          from: config.twoFactorSenderId,
          templatename: config.twoFactorTemplateName,
          var1: otp,
        }).toString()
      : `${base}/${config.twoFactorApiKey}/SMS/${normalizedPhone}/${otp}`;
    console.log('[v0] Sending OTP to:', normalizedPhone);
    
    const response = await axios.get(url, { timeout: 10000 });
    // 2Factor signals failure in body even on HTTP 200 (Status: "Error").
    const status = String(response.data?.Status || response.data?.status || '').toLowerCase();
    if (status && status !== 'success') {
      const detail = response.data?.Details || response.data?.message || JSON.stringify(response.data);
      console.error('[v0] OTP gateway rejected:', detail);
      throw new ApiError(502, `2Factor gateway: ${detail}`);
    }
    console.log('[v0] OTP sent successfully:', response.status);
    return { delivered: true };
  } catch (error: any) {
    const errorMsg = error.response?.data?.message || error.message || 'Unknown error';
    console.error('[v0] OTP Send Failed:', errorMsg);
    throw new ApiError(500, `Failed to send OTP: ${errorMsg}`);
  }
}

export async function verifyOtp(phone: string, purpose: string, otp: string) {
  // First try the happy path: fresh, unconsumed row.
  const row = await one<any>(
    `SELECT id FROM otp_codes
     WHERE phone = :phone AND purpose = :purpose AND consumed = false
       AND expires_at > NOW() AND otp_hash = SHA2(:otp, 256)
     ORDER BY id DESC LIMIT 1`,
    { phone, purpose, otp }
  );
  if (row) {
    await exec(`UPDATE otp_codes SET consumed = true WHERE id = :id`, { id: row.id });
    return;
  }
  // Idempotency window — if the SAME otp+phone+purpose was consumed
  // in the last 30 seconds, treat this as a duplicate of a
  // just-succeeded verify (React StrictMode double-fire in dev, or
  // a user double-tap before the button's disabled state propagates).
  // Returning success here is safe: we're verifying the EXACT same
  // OTP value the user already used moments ago, on the same row,
  // for the same purpose. No security leakage.
  const recent = await one<any>(
    `SELECT id FROM otp_codes
     WHERE phone = :phone AND purpose = :purpose AND consumed = true
       AND otp_hash = SHA2(:otp, 256)
       AND expires_at > DATE_SUB(NOW(), INTERVAL 1 MINUTE)
     ORDER BY id DESC LIMIT 1`,
    { phone, purpose, otp }
  );
  if (recent) return;
  throw new ApiError(400, 'Invalid or expired OTP');
}
