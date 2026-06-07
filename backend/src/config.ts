import dotenv from 'dotenv';
dotenv.config();

/* ──────────────────────────────────────────────────────────────────
 * v4.5.23 — Production fail-closed config.
 *
 * Before: every dev-friendly default also leaked into production —
 * "*" CORS, blank DB_PASSWORD, dev JWT secrets, plaintext 123456 OTP
 * bypass, missing Razorpay keys. The result: a forgotten env var on
 * launch day meant the app booted but with permissive defaults.
 *
 * Now the file is split into two phases:
 *   1. Read env vars + apply dev defaults.
 *   2. If NODE_ENV === 'production', assert critical security knobs
 *      are properly set and throw at startup if any aren't.
 *
 * Throwing at startup is intentional. Vercel surfaces the error in
 * the deployment build log; the bad config never serves a request.
 * ────────────────────────────────────────────────────────────────── */

const isProd = process.env.NODE_ENV === 'production';

/** Throws if the env var is missing in production. In dev it returns
 *  the fallback so local devs can run with zero config. */
function requireInProd(name: string, fallback: string, reason: string): string {
  const value = process.env[name];
  if (value) return value;
  if (isProd) {
    throw new Error(
      `[config] Refusing to start in production: ${name} is not set. ${reason}`,
    );
  }
  return fallback;
}

/** Returns a list of trimmed CORS origins. In dev, defaults to "*".
 *  In production, refuses to boot if the env var is missing or "*". */
function parseCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGIN;
  if (!raw) {
    if (isProd) {
      throw new Error(
        '[config] Refusing to start in production: CORS_ORIGIN is not set. ' +
        'Set it to a comma-separated list of exact origins, e.g. ' +
        '"https://vayil.in,https://admin.vayil.in".',
      );
    }
    return ['*'];
  }
  const origins = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (isProd && origins.includes('*')) {
    throw new Error(
      '[config] Refusing to start in production: CORS_ORIGIN contains "*". ' +
      'Use exact origins (https://vayil.in, …) — wildcard with credentials ' +
      'is a CVE.',
    );
  }
  return origins;
}

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd,
  port: Number(process.env.PORT || 9090),
  corsOrigins: parseCorsOrigins(),
  db: {
    host: requireInProd('DB_HOST', 'localhost',
      'Production must point at a managed DB — TiDB Cloud, RDS, etc.'),
    port: Number(process.env.DB_PORT || 3306),
    user: requireInProd('DB_USER', 'root',
      'Production must use a dedicated DB user, not root.'),
    password: isProd
      ? requireInProd('DB_PASSWORD', '',
          'Production DB requires a password; refusing to connect blank.')
      : (process.env.DB_PASSWORD || ''),
    database: requireInProd('DB_NAME', 'vayil',
      'Set DB_NAME to the production database, e.g. "vayil".'),
    // Enable TLS for managed providers (TiDB Cloud, PlanetScale, RDS).
    // Set DB_SSL=true to switch on; default off for local dev. Production
    // is asserted on TLS below in the post-config check.
    ...(String(process.env.DB_SSL || '').toLowerCase() === 'true'
      ? { ssl: { minVersion: 'TLSv1.2' as const, rejectUnauthorized: true } }
      : {}),
  },
  jwtSecret: requireInProd('JWT_SECRET', 'dev-secret-change-me',
    'Production must set JWT_SECRET to a strong random value (>= 32 bytes). ' +
    'Run: openssl rand -base64 32'),
  staffJwtSecret: requireInProd('STAFF_JWT_SECRET', 'dev-staff-secret-change-me',
    'Production must set STAFF_JWT_SECRET separately from JWT_SECRET. ' +
    'Run: openssl rand -base64 32'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || (isProd ? '7d' : '30d'),

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

  /** v4.5.23 — Payment-verify bypass must NEVER be enabled in
   *  production, even if the env var is set. The bypass flag is now
   *  ANDed with !isProd so a stale Vercel env var can't accidentally
   *  open up signature verification on a real launch. */
  paymentVerifyBypass: !isProd && process.env.PAYMENT_VERIFY_BYPASS === 'true',

  razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || '',
};

/* ─── Post-config safety checks ─── */
if (isProd) {
  // TLS to DB is mandatory in production.
  if (String(process.env.DB_SSL || '').toLowerCase() !== 'true') {
    throw new Error(
      '[config] Refusing to start in production: DB_SSL must be "true". ' +
      'Plaintext DB connections leak credentials over the network.',
    );
  }

  // Razorpay keys are mandatory in production — without them, the app
  // would fall into the dev-bypass code paths in razorpay.ts.
  if (!config.razorpayKeyId || !config.razorpayKeySecret) {
    throw new Error(
      '[config] Refusing to start in production: RAZORPAY_KEY_ID and ' +
      'RAZORPAY_KEY_SECRET must both be set. Without them, payment ' +
      'verification falls open.',
    );
  }

  // 2Factor SMS is mandatory in production unless OTP_BYPASS=true is
  // explicitly set (rare staging-prod scenario). We loudly warn either way.
  if (!config.twoFactorApiKey && !config.otpBypass) {
    throw new Error(
      '[config] Refusing to start in production: TWO_FACTOR_API_KEY ' +
      'is not set and OTP_BYPASS=true is not set. Real users would be ' +
      'unable to log in.',
    );
  }
  if (config.otpBypass) {
    // eslint-disable-next-line no-console
    console.warn(
      '[config] WARNING: OTP_BYPASS=true is set in production. Every ' +
      'phone number will accept the fixed bypass code as a valid OTP. ' +
      'Flip OTP_BYPASS=false and NEXT_PUBLIC_OTP_BYPASS=false before ' +
      'real users hit the platform.',
    );
  }

  // The dev fallback JWT strings would be caught by requireInProd above,
  // but we double-check the length here — a 12-byte secret is too short
  // even if it was supplied.
  if (config.jwtSecret.length < 32) {
    throw new Error(
      '[config] Refusing to start in production: JWT_SECRET is too ' +
      'short (need >= 32 chars). Run: openssl rand -base64 32',
    );
  }
  if (config.staffJwtSecret.length < 32) {
    throw new Error(
      '[config] Refusing to start in production: STAFF_JWT_SECRET is ' +
      'too short (need >= 32 chars).',
    );
  }
}
