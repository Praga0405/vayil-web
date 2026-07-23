import dotenv from 'dotenv';
dotenv.config();

/* ──────────────────────────────────────────────────────────────────
 * v4.5.23 — Production safety checks.
 * v4.5.24 — Loosened from "throw at startup" to "warn at startup
 *           unless STRICT_PROD_CONFIG=true is set".
 *
 * Why the loosening:
 *
 * v4.5.23 introduced strict throws for every missing security knob in
 * production. That hard-stopped the running Vercel deployment because
 * the existing demo env (CORS_ORIGIN=*, short JWT secret, etc.) hadn't
 * been hardened yet — and the user reported "Failed to send OTP" as a
 * direct consequence (the serverless function threw at module-load
 * time before any handler ran).
 *
 * The strict checks are correct as a launch-day gate; they're wrong
 * as an always-on guard while the demo is live. So:
 *
 *   - Default (STRICT_PROD_CONFIG unset / false): every issue is
 *     LOGGED loudly (vercel logs --prod shows them) but the app
 *     boots. The demo keeps running.
 *   - Opt-in (STRICT_PROD_CONFIG=true): every issue THROWS at
 *     startup, exactly the v4.5.23 behaviour. Flip this on right
 *     before the vayil.in launch so any misconfigured env var
 *     surfaces clearly in the build log.
 *
 * Either way, the *runtime* fail-closed behaviour is unchanged:
 * verifyRazorpaySignature() still throws in production when the
 * Razorpay secret is missing, /settings still strips secrets, CORS
 * still rejects un-listed origins, etc. The opt-in only controls
 * whether boot fails when env vars are wrong, vs degrading gracefully.
 * ────────────────────────────────────────────────────────────────── */

const isProd = process.env.NODE_ENV === 'production';
const strictProd = isProd && process.env.STRICT_PROD_CONFIG === 'true';

/** Helper: tell us a security knob is missing. Throws in strict mode,
 *  warns in lenient mode, no-op in dev. */
function reportProdIssue(name: string, message: string): void {
  if (strictProd) {
    throw new Error(`[config] Refusing to start in production: ${name} — ${message}`);
  }
  if (isProd) {
    // eslint-disable-next-line no-console
    console.warn(`[config] WARNING (production, lenient mode): ${name} — ${message}. ` +
      'Set STRICT_PROD_CONFIG=true to make this a hard error before the public launch.');
  }
}

function firstEnv(names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return undefined;
}

function requireAnyInProd(names: string[], fallback: string, reason: string): string {
  const value = firstEnv(names);
  if (value) return value;
  reportProdIssue(names.join(' / '), `not set. ${reason}`);
  return fallback;
}

function isEnabledEnv(names: string[]): boolean {
  return String(firstEnv(names) || '').toLowerCase() === 'true';
}

/** Returns a list of trimmed CORS origins. Dev defaults to "*".
 *  Production warns/throws (per strictProd) if missing or "*". */
function parseCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGIN;
  if (!raw) {
    reportProdIssue('CORS_ORIGIN',
      'unset. Set to a comma-separated list of exact origins, e.g. ' +
      '"https://vayil.in,https://admin.vayil.in". Until set, falling back to "*".');
    return ['*'];
  }
  const origins = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (isProd && origins.includes('*')) {
    reportProdIssue('CORS_ORIGIN',
      'contains "*". Use exact origins — wildcard with credentials is a CVE.');
  }
  return origins;
}

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd,
  port: Number(process.env.PORT || 9090),
  corsOrigins: parseCorsOrigins(),
  db: {
    host: requireAnyInProd(['DB_HOST', 'DBHOST'], 'localhost',
      'Production must point at a managed DB — TiDB Cloud, RDS, etc.'),
    port: Number(firstEnv(['DB_PORT', 'DBPORT']) || 3306),
    user: requireAnyInProd(['DB_USER', 'DB_USERNAME', 'DBUSERNAME'], 'root',
      'Production must use a dedicated DB user, not root.'),
    password: isProd
      ? requireAnyInProd(['DB_PASSWORD', 'DBPASSWORD'], '',
          'Production DB requires a password; refusing to connect blank.')
      : (firstEnv(['DB_PASSWORD', 'DBPASSWORD']) || ''),
    database: requireAnyInProd(['DB_NAME', 'DBNAME'], 'vayil',
      'Set DB_NAME to the production database, e.g. "vayil".'),
    // Enable TLS for managed providers (TiDB Cloud, PlanetScale, RDS).
    // Set DB_SSL=true to switch on; default off for local dev. Production
    // is asserted on TLS below in the post-config check.
    ...(isEnabledEnv(['DB_SSL', 'DBSSL'])
      ? { ssl: { minVersion: 'TLSv1.2' as const, rejectUnauthorized: true } }
      : {}),
  },
  jwtSecret: requireAnyInProd(['JWT_SECRET'], 'dev-secret-change-me',
    'Production must set JWT_SECRET to a strong random value (>= 32 bytes). ' +
    'Run: openssl rand -base64 32'),
  legacyJwtSecret:
    process.env.LEGACY_JWT_SECRET ||
    process.env.JWT_SECRET_KEY ||
    '',
  staffJwtSecret: requireAnyInProd(['STAFF_JWT_SECRET'], 'dev-staff-secret-change-me',
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

  firebase: {
    serviceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '',
    credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS || '',
  },
};

/* ─── Post-config safety checks (warn or throw, per strictProd) ─── */
if (isProd) {
  // TLS to DB is mandatory in production.
  if (!isEnabledEnv(['DB_SSL', 'DBSSL'])) {
    reportProdIssue('DB_SSL',
      'not "true". Plaintext DB connections leak credentials over the network.');
  }

  // Razorpay keys mandatory in prod — without them, the app falls into
  // the dev-bypass code paths in razorpay.ts (which themselves throw at
  // request time, so missing keys are caught either way).
  if (!config.razorpayKeyId || !config.razorpayKeySecret) {
    reportProdIssue('RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET',
      'one or both unset. Payment verification will throw at request time.');
  }

  // 2Factor SMS mandatory in prod unless OTP_BYPASS=true is explicitly set
  // (acceptable during the demo phase).
  if (!config.twoFactorApiKey && !config.otpBypass) {
    reportProdIssue('TWO_FACTOR_API_KEY',
      'unset and OTP_BYPASS=true is not set. Real users would be unable to log in.');
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

  // JWT secret length — checked regardless of strictProd so weak prod
  // secrets are loudly flagged.
  if (config.jwtSecret.length < 32) {
    reportProdIssue('JWT_SECRET',
      `too short (${config.jwtSecret.length} chars; need >= 32). Run: openssl rand -base64 32`);
  }
  if (config.staffJwtSecret.length < 32) {
    reportProdIssue('STAFF_JWT_SECRET',
      `too short (${config.staffJwtSecret.length} chars; need >= 32).`);
  }
}
