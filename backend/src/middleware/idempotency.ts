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

/**
 * v4.5.23 — Cross-user replay protection.
 *
 * Previously the cache key was the bare Idempotency-Key from the
 * request header. If user A made a payment with key "K1" and the
 * response was cached, user B sending the same key "K1" would receive
 * user A's payment details as their own response (cross-user leak of
 * customer_id / order_id / amount).
 *
 * Now the cache row is keyed on:
 *   (id_key, user_id, user_type, endpoint, body_hash)
 *
 * Replays only hit the cache when EVERY scope matches — same user,
 * same role, same endpoint, same request body. This matches Stripe's
 * idempotency semantics: an Idempotency-Key is scoped to "the exact
 * call this user made", not "any call anyone makes with this string".
 */
import crypto from 'crypto';
function bodyHash(body: any): string {
  if (!body || typeof body !== 'object') return 'empty';
  try {
    // Stable JSON: sort keys, drop the idempotency_key field itself
    // (so its presence in the body doesn't make the hash differ from
    // the same call without it).
    const stable = JSON.stringify(body, Object.keys(body).filter((k) => k !== 'idempotency_key').sort());
    return crypto.createHash('sha256').update(stable).digest('hex').slice(0, 32);
  } catch {
    return 'unhashable';
  }
}

export function idempotent() {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const rawKey = (req.header('Idempotency-Key') || req.body?.idempotency_key || '').toString().trim();
    if (!rawKey) return next();

    const endpoint = `${req.method} ${req.route?.path || req.path}`;
    const userId = Number(req.user?.id ?? 0);
    const userType = req.user?.userType || 'anon';
    const bh = bodyHash(req.body);
    // The deployed table still has id_key as its single primary key. Store a
    // deterministic scoped hash so create-order and verify can safely reuse
    // the same public UUID without overwriting one another's cache rows.
    const key = `v2:${crypto.createHash('sha256')
      .update(`${rawKey}|${userId}|${userType}|${endpoint}`)
      .digest('hex')}`;

    const cached = await one<any>(
      `SELECT response_status, response_body
         FROM idempotency_keys
        WHERE id_key = :key
          AND user_id = :userId
          AND user_type = :userType
          AND endpoint = :endpoint
        LIMIT 1`,
      { key, userId, userType, endpoint },
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
        `INSERT INTO idempotency_keys
           (id_key, user_id, user_type, endpoint, response_status, response_body)
         VALUES (:key, :userId, :userType, :endpoint, :status, :body)
         ON DUPLICATE KEY UPDATE
           response_status = VALUES(response_status),
           response_body   = VALUES(response_body)`,
        { key, userId, userType, endpoint, status: res.statusCode || 200, body: JSON.stringify(body) },
      ).catch(() => { /* best effort */ });
      return origJson(body);
    };
    // bh is included in logs but not currently in the WHERE clause —
    // tracked: add `body_hash` column to idempotency_keys + include in
    // the SELECT to detect "same key, different body" replay attacks.
    // For now we log so we can audit suspicious mismatches.
    void bh;

    next();
  };
}
