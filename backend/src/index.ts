import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { ApiError, fail } from './utils/http';
import { authRouter } from './routes/auth';
import { customerRouter } from './routes/customer';
import { vendorRouter } from './routes/vendor';
import { opsRouter } from './routes/ops';
import { commonRouter } from './routes/common';
import { paymentsRouter } from './routes/payments';
import { adminRouter } from './routes/admin';

const app = express();

app.use(helmet());
app.use(cors({ origin: config.corsOrigins.includes('*') ? true : config.corsOrigins, credentials: true }));

// Webhooks MUST receive the raw body for signature verification, so mount
// the webhook route BEFORE the global JSON parser.
app.use('/payments/webhooks', paymentsRouter);
app.use('/webhooks', paymentsRouter);

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(rateLimit({ windowMs: 60_000, limit: 240 }));

app.use('/', commonRouter);
app.use('/auth', authRouter);
app.use('/customers', customerRouter);
app.use('/vendors', vendorRouter);
app.use('/ops', opsRouter);
app.use('/payments', paymentsRouter);

// Admin panel — Vayil-Admin-Panel-main posts to these paths verbatim.
// Mount under both casings since Express paths are case-sensitive.
app.use('/Admin', adminRouter);
app.use('/admin', adminRouter);

// Legacy aliases for the existing mobile/admin codebase.
app.use('/', authRouter);
app.use('/customer', customerRouter);
app.use('/vendor', vendorRouter);

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
