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
  },
  jwtSecret: required('JWT_SECRET', 'dev-secret-change-me'),
  staffJwtSecret: required('STAFF_JWT_SECRET', 'dev-staff-secret-change-me'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',
  twoFactorApiKey: process.env.TWO_FACTOR_API_KEY || '',
  otpBypass: process.env.OTP_BYPASS === 'true',
  otpBypassCode: process.env.OTP_BYPASS_CODE || '123456',
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || '',
};
