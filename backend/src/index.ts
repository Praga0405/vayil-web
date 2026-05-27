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

const app = express();

app.use(helmet());
app.use(cors({ origin: config.corsOrigins.includes('*') ? true : config.corsOrigins, credentials: true }));

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

/* ─── Compatibility aliases (auth router already handled these) ─ */
app.use('/', authRouter);

app.use((_req, _res, next) => next(new ApiError(404, 'Route not found')));
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err instanceof ApiError ? err.status : 500;
  const message = err instanceof ApiError ? err.message : 'Internal Server Error';
  if (status >= 500) console.error(err);
  fail(res, status, message, err?.details || err?.issues);
});

app.listen(config.port, () => {
  console.log(`Vayil backend running on port ${config.port}`);
});

export default app;
