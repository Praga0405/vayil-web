import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { config } from './config';
import { ApiError, fail } from './utils/http';
import { authRouter } from './routes/auth';
import { customerRouter } from './routes/customer';
import { vendorRouter } from './routes/vendor';
import { opsRouter } from './routes/ops';
import { commonRouter } from './routes/common';
import { paymentsRouter, paymentsWebhookRouter } from './routes/payments';
import { adminRouter } from './routes/admin';
import { adminMobileRouter } from './routes/adminMobile';
import { legacyCustomerRouter } from './routes/legacyCustomer';
import { legacyVendorRouter } from './routes/legacyVendor';
import { bareMobileRouter } from './routes/bareMobile';

const app = express();

// Trust the first proxy hop. Required when running behind Vercel (or
// any cloud load balancer) so express-rate-limit can read the real
// client IP from X-Forwarded-For instead of throwing
// ERR_ERL_UNEXPECTED_X_FORWARDED_FOR on every request.
app.set('trust proxy', 1);

app.use(helmet());

/* v4.5.23 — CORS hardening.
 * v4.5.24 — Lenient-prod mode (boot warns instead of throws).
 * v4.5.25 — Fix regression: wildcard CORS_ORIGIN now reflects in BOTH
 *           lenient prod and dev, matching v4.5.22 behaviour. Previously
 *           the `!config.isProd && includes('*')` guard meant production
 *           with the default `CORS_ORIGIN=*` (or unset) rejected every
 *           browser request, including same-origin POSTs from
 *           vayil-web.vercel.app. Symptom: "Failed to send OTP" on the
 *           web LoginModal. Mobile (no Origin header) kept working
 *           because it short-circuits at the `!origin` line above.
 *
 * Decision matrix:
 *
 *   ┌──────────────────────────────┬──────────────────────────────┐
 *   │ CORS_ORIGIN env              │ Behaviour                    │
 *   ├──────────────────────────────┼──────────────────────────────┤
 *   │ unset / "*"                  │ Reflect any origin (lenient) │
 *   │ "https://vayil.in,…"         │ Strict allow-list — only     │
 *   │                              │ exact-match origins pass     │
 *   └──────────────────────────────┴──────────────────────────────┘
 *
 * In strict mode (CORS_ORIGIN explicitly listed + STRICT_PROD_CONFIG=true
 * on launch), the wildcard branch never fires because corsOrigins won't
 * contain '*'. The config.ts warning surfaces if production is still
 * running on `*`.
 *
 * Mobile-app callers send NO Origin header at all (native Dio client
 * doesn't set one), so `!origin` is allowed unconditionally — mobile
 * traffic isn't restricted by CORS regardless of the env setting.
 */
const corsAllowFn = (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
  if (!origin) return cb(null, true);                          // mobile / server-to-server / Postman
  if (config.corsOrigins.includes('*')) return cb(null, true); // wildcard reflects any origin (lenient mode)
  if (config.corsOrigins.includes(origin)) return cb(null, true); // strict allow-list match
  // v4.5.25 — `cb(null, false)` (not `cb(new Error, false)`) is the cors
  // package's quiet-reject path: the response has no Access-Control-Allow-Origin
  // header so the browser blocks the request, but we don't dump a stack trace
  // to the logs for every disallowed origin (which would happen on every
  // attacker scan in production). Failed preflight = browser refuses the
  // subsequent real request. Safe.
  return cb(null, false);
};
app.use(cors({ origin: corsAllowFn, credentials: true }));

// Webhooks MUST receive the raw body for signature verification — mount
// the dedicated webhook router BEFORE any body parser.
app.use('/payments/webhooks', paymentsWebhookRouter);
app.use('/webhooks',          paymentsWebhookRouter);

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(rateLimit({ windowMs: 60_000, limit: 240 }));

/**
 * Legacy mobile shim — the Flutter apps post every request as
 * multipart/form-data (Dio.FormData.fromMap). express.json() returns
 * an empty body for those, so we layer a multer instance specifically
 * in front of the legacy routers.
 *
 * The instance does NOT consume file uploads here (handlers that need
 * files apply their own `upload.any()` middleware). It only fills
 * req.body from the multipart text fields when no file is present.
 */
const legacyForm = multer().none();
function legacyMultipart(req: Request, res: Response, next: NextFunction) {
  const ct = req.headers['content-type'] || '';
  if (typeof ct === 'string' && ct.startsWith('multipart/form-data')) {
    // multer.none() rejects file fields. Routes that explicitly need
    // file uploads (upload_files) install upload.any() themselves —
    // by routing them BEFORE this middleware via the legacyVendorRouter /
    // legacyCustomerRouter instances we avoid the conflict.
    return legacyForm(req, res, (err) => {
      if (!err) return next();
      const code = (err as any).code;
      const msg  = (err as any).message || '';
      // Pass through if the handler installs its own multer.
      if (code === 'LIMIT_UNEXPECTED_FILE') return next();
      // Empty / truncated bodies (e.g. axios + form-data with no fields)
      // produce "Unexpected end of form" from busboy. Treat it as an
      // empty body rather than a 500 — the route's pickId/pickPhone
      // helpers default to '' anyway.
      if (msg.includes('Unexpected end of form')) { req.body = {}; return next(); }
      return next(err);
    });
  }
  next();
}

/* ─── Canonical routes — JSON only ────────────────────────────── */
app.use('/', commonRouter);
app.use('/auth', authRouter);
app.use('/customers', customerRouter);
app.use('/vendors', vendorRouter);
app.use('/ops', opsRouter);
app.use('/payments', paymentsRouter);

// Mount adminMobileRouter FIRST so its open /loginAdmin endpoint can
// match before the existing adminRouter's router-level requireAuth
// middleware rejects unauthenticated requests. The two routers expose
// disjoint paths (mobile: loginAdmin, addCity, …; existing: GetVendorList,
// VendorDetails, …) so there's no collision.
app.use('/Admin', adminMobileRouter);
app.use('/admin', adminMobileRouter);
app.use('/Admin', adminRouter);
app.use('/admin', adminRouter);

/* ─── Legacy mobile shims — accept multipart + JSON ────────────
 *  Mount AFTER canonical so canonical wins on overlapping paths.
 *  Mobile uses /customer/<name> and /vendor/<name>. We deliberately
 *  do NOT mount legacyVendorRouter at bare `/` — its router-level
 *  requireAuth would fire on every unrelated request (e.g. /health,
 *  /favicon.ico) and respond 403 before the catch-all 404 handler.
 *  If a future mobile build calls bare paths like /step1 without a
 *  prefix, expose those individually here. */
app.use('/customer', legacyMultipart, legacyCustomerRouter);
app.use('/vendor',   legacyMultipart, legacyVendorRouter);
// v4.5.2 — the customer Flutter app posts /CustomerupdatePlan as a
// BARE path (no /customer prefix). Mount the same router under '/' so
// `legacyCustomerRouter.post('/CustomerupdatePlan')` resolves at both
// /customer/CustomerupdatePlan AND /CustomerupdatePlan.
// We add the open routes to bare '/' too so register/verifyOtp etc.
// don't try to consume the multipart twice — the requireAuth on
// /CustomerupdatePlan still gates it.
app.use('/', legacyMultipart, legacyCustomerRouter);

/* v4.5.26 — Bare-path public aliases for mobile team. The mobile team
 * sends a handful of lookup calls without any prefix (no /customer, no
 * /vendor). These all map to public handlers already implemented on the
 * legacy routers. Mounted AFTER the prefixed routers so prefixed paths
 * still resolve first.
 *
 * Routes exposed:
 *   GET  /getLanguages, /getTools, /getToolList, /listStatus,
 *        /get_states_by_country_id
 *   POST /get_city, /listProofTypes, /upload_files
 *
 * Routes deliberately NOT exposed (admin-only mutations the mobile team
 * listed but which require admin auth — kept behind the admin gate):
 *   POST /service-category/toggle, /service-subcategory/toggle,
 *        /service-tag/toggle, /ProofStatus
 * The /service-categories, /service-subcategories, /service-tags READ
 * endpoints are already public via the commonRouter mounted at '/'.
 */
app.use('/', legacyMultipart, bareMobileRouter);

/* ─── Compatibility aliases (auth router already handled these) ─ */
app.use('/', authRouter);

app.use((_req, _res, next) => next(new ApiError(404, 'Route not found')));
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err instanceof ApiError ? err.status : 500;
  const message = err instanceof ApiError ? err.message : 'Internal Server Error';
  if (status >= 500) console.error(err);
  fail(res, status, message, err?.details || err?.issues);
});

// Only bind a port when running standalone (local dev, Docker, Render,
// Railway). On Vercel serverless we just export the express app —
// pages/api/[...all].ts invokes it per-request.
if (!process.env.VERCEL) {
  app.listen(config.port, () => {
    console.log(`Vayil backend running on port ${config.port}`);
  });
}

export default app;
