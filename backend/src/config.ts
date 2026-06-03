import dotenv from 'dotenv';
dotenv.config();

const required = (name: string, fallback?: string) => {
  const value = process.env[name] || fallback;
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
};

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 9090),
  corsOrigins: (process.env.CORS_ORIGIN || '*').split(',').map((s) => s.trim()),
  db: {
    host: required('DB_HOST', 'localhost'),
    port: Number(process.env.DB_PORT || 3306),
    user: required('DB_USER', 'root'),
    password: process.env.DB_PASSWORD || '',
    database: required('DB_NAME', 'vayil'),
    // Enable TLS for managed providers (TiDB Cloud, PlanetScale, RDS).
    // Set DB_SSL=true to switch on; default off for local dev.
    ...(String(process.env.DB_SSL || '').toLowerCase() === 'true'
      ? { ssl: { minVersion: 'TLSv1.2' as const, rejectUnauthorized: true } }
      : {}),
  },
  jwtSecret: required('JWT_SECRET', 'dev-secret-change-me'),
  staffJwtSecret: required('STAFF_JWT_SECRET', 'dev-staff-secret-change-me'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',
  // 2Factor SMS OTP. Accepts both the legacy TWO_FACTOR_* names and
  // the OTPFactor_* names the ops team uses in their secret store.
  twoFactorApiKey:
    process.env.OTPFactor_API_KEY ||
    process.env.TWO_FACTOR_API_KEY ||
    '',
  twoFactorApiUrl:
    process.env.OTPFactor_API_URL ||
    process.env.TWO_FACTOR_API_URL ||
    'https://2factor.in/API/V1/',
  twoFactorSenderId:
    process.env.OTPFactor_API_senderId ||
    process.env.TWO_FACTOR_SENDER_ID ||
    '',
  twoFactorTemplateName:
    process.env.OTPFactor_TEMPLATE_NAME ||
    process.env.TWO_FACTOR_TEMPLATE_NAME ||
    'OTP',
  otpBypass: process.env.OTP_BYPASS === 'true',
  otpBypassCode: process.env.OTP_BYPASS_CODE || '123456',
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || '',
};
