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
  // 2Factor SMS OTP. Accept every naming variant the ops team has
  // used in their Vercel secret store: TWO_FACTOR_*, OTP_FACTOR_*,
  // and the camel-case OTPFactor_* form (current secret names).
  twoFactorApiKey:
    process.env.TWO_FACTOR_API_KEY ||
    process.env.OTP_FACTOR_API_KEY ||
    process.env.OTPFactor_API_KEY ||
    '',
  twoFactorUrl:
    process.env.TWO_FACTOR_URL ||
    process.env.OTP_FACTOR_URL ||
    process.env.OTPFactor_API_URL ||
    'https://2factor.in/API/V1',
  twoFactorSenderId:
    process.env.TWO_FACTOR_SENDER_ID ||
    process.env.OTP_FACTOR_SENDER_ID ||
    process.env.OTPFactor_API_senderId ||
    '',
  twoFactorTemplateName:
    process.env.TWO_FACTOR_TEMPLATE_NAME ||
    process.env.OTP_FACTOR_TEMPLATE_NAME ||
    process.env.OTPFactor_TEMPLATE_NAME ||
    'OTP',
  otpBypass: process.env.OTP_BYPASS === 'true',
  otpBypassCode: process.env.OTP_BYPASS_CODE || '123456',
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || '',
};
