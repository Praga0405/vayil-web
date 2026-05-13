/**
 * Idempotency middleware.
 *
 * Frontends send `Idempotency-Key: <uuid>` on POSTs that create state
 * (payments, enquiries, etc). On the first request we run the handler
 * and cache the response. Replays within the table's retention window
 * return the cached response without re-running side effects.
 *
 * Storage: idempotency_keys table (created in migration 003).
 */
import { NextFunction, Response } from 'express';
import { exec, one } from '../db';
import { AuthRequest } from '../types';

export function idempotent() {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const key = (req.header('Idempotency-Key') || req.body?.idempotency_key || '').toString().trim();
    if (!key) return next();

    const endpoint = `${req.method} ${req.route?.path || req.path}`;
    const userId = Number(req.user?.id ?? 0);
    const userType = req.user?.userType || 'anon';

    const cached = await one<any>(
      `SELECT response_status, response_body FROM idempotency_keys WHERE id_key = :key LIMIT 1`,
      { key },
    );
    if (cached) {
      try {
        const body = cached.response_body ? JSON.parse(cached.response_body) : {};
        return res.status(cached.response_status).json(body);
      } catch {
        return res.status(cached.response_status).end();
      }
    }

    // Wrap res.json so we capture the body once the handler resolves.
    const origJson = res.json.bind(res);
    (res as any).json = (body: any) => {
      exec(
        `INSERT INTO idempotency_keys (id_key, user_id, user_type, endpoint, response_status, response_body)
         VALUES (:key, :userId, :userType, :endpoint, :status, :body)
         ON DUPLICATE KEY UPDATE response_status = VALUES(response_status), response_body = VALUES(response_body)`,
        { key, userId, userType, endpoint, status: res.statusCode || 200, body: JSON.stringify(body) },
      ).catch(() => { /* best effort */ });
      return origJson(body);
    };

    next();
  };
}
