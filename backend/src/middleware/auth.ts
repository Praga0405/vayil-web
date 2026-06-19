import { NextFunction, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AuthRequest, AuthUser, UserType } from '../types';
import { ApiError } from '../utils/http';

export function signToken(payload: AuthUser, staff = false) {
  return jwt.sign(payload, staff ? config.staffJwtSecret : config.jwtSecret, { expiresIn: config.jwtExpiresIn as any });
}

/**
 * Extract a JWT from the request. Mobile apps may send the token in
 * several places — accept all of them so the same middleware works for
 * the web canonical routes AND the legacy mobile shims:
 *
 *   • Authorization: Bearer <token>         (web + new mobile)
 *   • x-access-token: <token>                (legacy mobile alt header)
 *   • body.token / body.access_token         (Dio FormData with token field)
 *   • query.token                            (rare — legacy GET endpoints)
 */
export function extractToken(req: AuthRequest): string | undefined {
  // Headers are the safe path — always honoured.
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  const xat = req.headers['x-access-token'];
  if (typeof xat === 'string' && xat) return xat.trim();

  // v4.5.23 — Body / query token transport is a leak risk:
  //   - query.token shows up in access logs, Referer headers,
  //     server-side analytics, CDN cache keys, browser history.
  //   - body.token is fine over HTTPS but every endpoint that doesn't
  //     authenticate via header would still write the value into
  //     request-body debug logs.
  //
  // The legacy Flutter app's Dio FormData sometimes attaches `token`
  // in the body; we keep that path for dev/staging only so the mobile
  // team isn't broken mid-migration. Production REQUIRES header-based
  // auth — query/body tokens are ignored.
  if (!config.isProd) {
    const body: any = req.body || {};
    if (typeof body.token === 'string' && body.token) return body.token.trim();
    if (typeof body.access_token === 'string' && body.access_token) return body.access_token.trim();
    const q: any = req.query || {};
    if (typeof q.token === 'string' && q.token) return q.token.trim();
  }
  return undefined;
}

export function requireAuth(allowed?: UserType[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    const token = extractToken(req);
    if (!token) return next(new ApiError(401, 'Missing bearer token'));
    try {
      let decoded: any;
      try {
        decoded = jwt.verify(token, config.jwtSecret);
      } catch {
        decoded = jwt.verify(token, config.staffJwtSecret);
      }
      const legacyRole = decoded?.userType || decoded?.role || decoded?.user_role;
      const legacyId = decoded?.id || decoded?.userId || decoded?.user_id || decoded?.customer_id || decoded?.vendor_id || decoded?.admin_id;
      req.user = {
        ...decoded,
        id: legacyId,
        userType: legacyRole,
      } as AuthUser;
      if (allowed?.length && !allowed.includes(req.user.userType)) {
        throw new ApiError(403, 'Access denied for this role');
      }
      next();
    } catch (err) {
      next(err instanceof ApiError ? err : new ApiError(401, 'Invalid or expired token'));
    }
  };
}

export function requireRole(role: string) {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user?.roles?.includes(role)) return next(new ApiError(403, `Missing role: ${role}`));
    next();
  };
}

/**
 * Soft auth — sets req.user if a valid token is present, but never fails
 * the request. Useful for legacy endpoints that the mobile app sometimes
 * calls before login (e.g. /customer/ServiceList browsing).
 */
export function softAuth() {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    const token = extractToken(req);
    if (!token) return next();
    try {
      let decoded: any;
      try { decoded = jwt.verify(token, config.jwtSecret); }
      catch { decoded = jwt.verify(token, config.staffJwtSecret); }
      const legacyRole = decoded?.userType || decoded?.role || decoded?.user_role;
      const legacyId = decoded?.id || decoded?.userId || decoded?.user_id || decoded?.customer_id || decoded?.vendor_id || decoded?.admin_id;
      req.user = {
        ...decoded,
        id: legacyId,
        userType: legacyRole,
      } as AuthUser;
    } catch { /* ignore invalid token in soft mode */ }
    next();
  };
}
