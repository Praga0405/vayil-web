# Release readiness — flip these before going live

This file is the single checklist for moving from dev/demo to
production. Every flag below is a deliberate dev-mode convenience —
**leaving any of them on in production is a bug**.

Last updated: 2026-07-23 · v4.5.103.

## ⚠ Critical — must be flipped

### v4.5.103 workflow release gate

Before promoting the demo-feedback workflow:

- [ ] Run `backend/migrations/014_demo_feedback_workflow.sql` before routing traffic to the new build.
- [ ] Confirm `quotation.quote_version`, `payment_intents.platform_fee_amount`,
  `payment_intents.vendor_payout_amount`, and `signoffs.release_status` exist.
- [ ] Use a staff JWT to confirm `GET /Admin/fund-releases` is protected and returns
  the customer close queue.
- [ ] Complete one test-mode material payment and verify customer total equals the
  material subtotal (no customer 5% fee).
- [ ] Confirm the same payment intent shows the 5% fee only in vendor/admin settlement
  and credits only the persisted vendor payout.
- [ ] Confirm customer rating/close does not credit the vendor wallet.
- [ ] Release the project from Admin and verify exactly one wallet credit and one
  platform-fee ledger row. Retry release and confirm balances do not change.
- [ ] Confirm the customer close action remains disabled until every milestone is complete.
- [ ] Re-run customer and vendor demo login with `123456`; v4.5.103 intentionally does
  not modify OTP behavior.


| Env var | Where | Demo value | Production value | What it does |
|---|---|---|---|---|
| `OTP_BYPASS` | backend | `true` | `false` | When `true`, `sendOtp()` short-circuits (no SMS sent) and `generateOtp()` always returns `OTP_BYPASS_CODE`. Anyone can sign in with the known code — **never ship this on**. |
| `OTP_BYPASS_CODE` | backend | `123456` | *(unset / irrelevant when bypass off)* | The fixed code used during bypass. Unused in prod. |
| `NEXT_PUBLIC_OTP_BYPASS` | frontend | `true` | `false` *(or unset)* | Drives the amber "Dev mode" banner in the login modal. Cosmetic — but if you flip the backend off and leave this on, users will see "Enter 123456" and the real OTP they get by SMS won't be that. Always flip together. |
| `NEXT_PUBLIC_OTP_BYPASS_CODE` | frontend | `123456` | *(unset)* | Code shown in the banner. Only meaningful with bypass on. |
| `PAYMENT_VERIFY_BYPASS` | backend | `true` | `false` | When `true`, Razorpay payment-verification skips signature checks so smoke tests + the demo can run without live keys. Production must verify HMAC signatures — leaving this on lets anyone mark a payment as paid. |
| `NEXT_PUBLIC_USE_MOCK_DATA` | frontend | `false` | `false` | When `true`, the frontend short-circuits API calls to in-memory data. Should be `false` everywhere except local UI-only work. |

## Temporary code bypasses

| Bypass | Where | Demo state | Production requirement | Risk |
|---|---|---|---|---|
| Unauthenticated vendor status update | `backend/src/routes/adminMobile.ts` and `backend/src/routes/admin.ts` -> `POST /Admin/VendorStatusUpdate` | Route is mounted before admin auth so testers can update newly registered vendors without staff JWTs. | Move both route mounts back behind admin auth before production. | Anyone with the endpoint URL could set a vendor to `pending`, `verified`, `pending_approval`, `approved`, or `rejected`. |
| Standalone demo-login token promotion | `src/lib/api/client.ts` | A `dev_customer_token_<phone>` or `dev_vendor_token_<phone>` marker is silently exchanged through `/auth/otp/send` + `/auth/otp/verify` using `NEXT_PUBLIC_OTP_BYPASS_CODE` (default `123456`) before protected API calls. This keeps the current one-step demo login while allowing real enquiry/payment APIs. | Replace the standalone demo login pages with the canonical OTP UI, then remove marker promotion. Disable `OTP_BYPASS` and `NEXT_PUBLIC_OTP_BYPASS` together. | The known demo code can authenticate any eligible demo account while backend bypass is enabled. Promotion itself does not bypass the backend; it stops working when backend bypass is disabled. |

## Required to be set in production (currently demo-friendly defaults)

| Env var | Why |
|---|---|
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Live keys (not `rzp_test_*`) for real charges. |
| `RAZORPAY_WEBHOOK_SECRET` | HMAC secret for `/payments/webhooks/razorpay`. Without it, webhooks can't be verified. |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Frontend checkout widget needs the **public** live key. |
| `OTPFactor_API_KEY` (or `TWO_FACTOR_API_KEY`) | Real 2Factor account API key. |
| `OTPFactor_API_URL` | Should be the R1 (DLT) URL for sender-ID-tagged messaging. |
| `OTPFactor_API_senderId` | Live DLT-approved sender (e.g. `VAYILO`). |
| `OTPFactor_TEMPLATE_NAME` | The exact DLT template name registered with TRAI. |
| `AWS_REGION`, `AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Required for file uploads (KYC docs, attachments, materials photos). Without them, `/upload_files` falls back to local disk which is wiped on every serverless cold start. |
| `JWT_SECRET`, `STAFF_JWT_SECRET` | Long random strings — `openssl rand -base64 32`. Demo defaults are placeholders. |
| `CORS_ORIGIN` | The exact production domain(s). Don't ship with `*`. |
| `ADMIN_PORTAL_NOTIFY_URL` / `ADMIN_PORTAL_NOTIFY_TOKEN` | If the admin portal expects vendor-review webhooks. |

## Schema / DB

- Migration `006_full_mobile_parity.sql` matches the mobile team's
  reference dump. Idempotent — safe to re-run.
- Production MySQL must support TLS (TiDB Cloud / PlanetScale / RDS).
  Set `DB_SSL=true` on the backend env.
- Do **not** seed `seed-marketplace.ts` in production unless you
  actually want the demo vendors/services live.

## Pre-launch smoke checklist

- [ ] All "Critical" flags above flipped to production values.
- [ ] All "Required" env vars populated.
- [ ] `npm run migrate` against prod DB succeeds.
- [ ] `npm run smoke:web`, `smoke:mobile`, `smoke:admin` against
      staging URL all green.
- [ ] Send one real OTP to a team phone — confirm SMS arrives and
      the sender ID shows as `VAYILO`.
- [ ] Run one real Razorpay `₹1` test payment end-to-end — confirm
      escrow ledger row created and webhook signature verified.
- [ ] Confirm S3 upload from the customer KYC page works and URL is
      reachable from the vendor side.
- [ ] Revoke / rotate any test secrets that were shared in chat or
      Slack during the demo phase.
- [ ] Remove the standalone demo-token promotion after replacing
      `/customer/login` and `/vendor/login` with the canonical OTP flow.
- [ ] Confirm `JWT_SECRET` and `STAFF_JWT_SECRET` are independently generated,
      at least 32 characters, and do not produce fallback-secret warnings.

## Rotation reminders (already-exposed test secrets)

- Razorpay test keys (`rzp_test_SGoCvCYBwqFk9G`) — rotate after
  leadership signoff. No production impact, but hygiene.
- 2Factor API key — if it was pasted into chat at any point, regen
  on the 2Factor dashboard before flipping to live SMS.
- TiDB Cloud password used during seeding (`CQVwcg…`) — rotate via
  TiDB Cloud → Connect → Generate Password, then update Vercel
  `DB_PASSWORD`.

## Current demo payment compatibility (v4.5.97)

- Production payment pages always call the real Razorpay create-order and
  verify endpoints. They no longer inherit the broad frontend `IS_DEMO_MODE`
  value that is true when same-origin API rewrites are used.
- Local development can still simulate checkout through
  `IS_PAYMENT_DEMO_MODE`; this flag is hard-disabled when
  `NODE_ENV=production`.
- The current one-step demo login is intentionally unchanged for the scheduled
  demo. Its synthetic token is promoted to a signed backend JWT on the first
  protected request, using the existing OTP bypass configuration.
- Razorpay test-key checkout is prefilled with the non-routable test contact
  `9000090000`, because the scheduled `555...` demo login is not a valid Indian
  payment contact. Live keys do not receive any dummy prefill values.
- Vercel runtime logs observed during the 2026-07-22 investigation warned that
  JWT secrets were missing/short and fallback demo values were active. Set and
  rotate both JWT secrets before a real-user launch even though the current
  demo remains operational.
- The production verification created a real Razorpay Test Mode order, but the
  configured Razorpay account rejected the official domestic test card and
  listed netbanking methods with `Payment could not be completed`. Confirm test
  payment-method enablement in the Razorpay dashboard before the demo; this is
  external to application order creation and signature verification.

---

## Security audit follow-ups (v4.5.23, 2026-06-07)

This section consolidates the P0/P1/P2 findings from the production-readiness security audit. Items marked ✅ are fixed in code; items marked ⏳ need ops/business action before the `vayil.in` launch.

### P0 — Must be done before real users

| Item | Status | Notes |
|---|---|---|
| Demo bypass flags must be off in production | ⏳ | Flip `OTP_BYPASS`, `NEXT_PUBLIC_OTP_BYPASS`, `PAYMENT_VERIFY_BYPASS` to `false` on Vercel. `config.ts` now refuses to boot in production if `TWO_FACTOR_API_KEY` is missing + bypass is off (forces you to wire 2Factor before launch). |
| Frontend `npm audit` advisories | ✅ (Swiper critical) / ⏳ (Next major) | Swiper 11→12 wasn't even used in code — removed entirely. Critical prototype-pollution gone. Next 14→16 chain (4 high + 1 moderate) remains: it's a 2-major-version jump including React 19, scoped as a separate post-demo upgrade so we don't regress production hardening with framework changes. |
| Payment verification fail-open | ✅ | `verifyRazorpaySignature()` now throws in production when key missing; `config.paymentVerifyBypass` is hard-AND-ed with `!isProd` so a stale env var can't open up the bypass. `createRazorpayOrder()` similarly throws in prod rather than minting `order_dev_*` IDs. |
| Public settings exposes secrets | ✅ | New `publicSettingsSafe()` helper in `backend/src/routes/common.ts` strips any field whose name matches `secret|password` or is in an explicit deny-list. Wired through `/settings`, `/customer/getSettings`, `/vendor/getSettings`. Admin endpoints unchanged (admins are authed + role-checked). |
| CORS too broad (`*` + credentials) | ✅ | `config.ts` refuses to boot in production if `CORS_ORIGIN` is unset or contains `*`. `index.ts` CORS callback rejects un-listed origins; native mobile (no `Origin` header) still allowed. |
| Route ownership checks missing | ✅ | Customer milestone approval (`/customer/projects/:id/milestones/:mid/approve`) now verifies project belongs to the calling customer. Vendor quote creation (`/vendor/enquiries/:id/quotes`) verifies enquiry is addressed to the calling vendor and rejects quotes on rejected/cancelled/completed enquiries. |
| Auth tokens exposed to XSS | ⏳ partial | localStorage JWTs remain (full HttpOnly-cookie migration tracked separately — large because every API client needs to switch from `Authorization` header to credentialed cookies). Mitigations applied: 401/403 now silently clears the stale token on public pages; CSP shipped in v4.5.21 mitigates script-injection paths. **Action before launch:** decide whether to do the cookie migration or accept localStorage risk + short JWT lifetime (`JWT_EXPIRES_IN=7d` in prod, was 30d). |
| Admin auth plaintext fallback | ✅ | `loginAdmin` now rejects non-bcrypted passwords in production. Dev still allows plaintext for local fixtures. Any existing prod admin row with a plaintext password must be re-hashed before launch (small script: `UPDATE admins SET password = bcrypt(password) WHERE password NOT LIKE '$2_$%'`). |

### P1 — Should be done before launch

| Item | Status | Notes |
|---|---|---|
| Production config fail-closed | ✅ | `config.ts` rewrite: missing `DB_PASSWORD`, weak `JWT_SECRET` (< 32 chars), `DB_SSL` not `true`, missing Razorpay keys, missing 2Factor key — all throw at startup in production. The deployment never serves a single request with a bad config. |
| OTP plaintext mirror on user row | ✅ | `storeOtp()` no longer writes `customers.otp = :otp` / `vendors.otp = :otp`. Metadata cols (`otp_expires_at`, `otp_attempts`, `last_otp_sent_at`) kept; plaintext value removed. Source of truth remains `otp_codes.otp_hash` (SHA2). |
| Token transport — query/body | ✅ | `extractToken()` ignores `body.token` / `body.access_token` / `query.token` in production. Header-based auth only. Dev keeps body/query fallback so existing local test fixtures and the legacy mobile app's Dio FormData continue to work mid-migration. |
| Idempotency key scoping | ✅ | Cache lookup now keyed by `(id_key, user_id, user_type, endpoint)` — was bare `id_key` only. Cross-user replay leak closed. (Adding `body_hash` to the schema for tamper detection is a follow-up — current impl computes the hash but doesn't yet filter on it.) |
| Build gates disabled | ⏳ | `next.config.js` still has `typescript.ignoreBuildErrors: true` + `eslint.ignoreDuringBuilds: true` (added in v4.5.13 to unblock the Vercel build past 17 known `useParams<{id:string}>()` type mismatches). Re-enable after refactoring those pages to type-guard `useParams()` result. |
| Security headers / CSP | ✅ | v4.5.21 + v4.5.22 shipped strict CSP, COOP, X-Frame-Options DENY, HSTS, Permissions-Policy etc. on every HTML route. CORS retained on `/api/*` so the mobile app still works. |
| Upload validation hardening | ⏳ | Currently accepts broad multipart and trusts client `content-type`. Pre-launch: add magic-byte sniff (e.g. `file-type` npm), per-request file count cap, separate private S3 bucket for KYC docs, fail-closed in production when S3 env vars are missing. |

### P2 — Process

| Item | Owner |
|---|---|
| Audit logging for admin, payment, KYC, settings, auth-sensitive actions | Engineering follow-up — wire to a `audit_log` table or external service (Datadog / BetterStack). |
| Remove demo phone numbers & OTPs from public production docs | Marketing / Docs — README + RELEASE_NOTES currently document `9876543210 / 123456`. Either redact post-demo OR rotate to non-public test numbers before launch. |
| CI security gates (npm audit, dependency review, smoke tests with bypasses off) | DevOps — add a GitHub Actions workflow that runs `npm audit --audit-level=high` and the smoke suites against a staging deploy with all bypass flags off. |

### Re-hash any existing plaintext admins (one-time)

If `admins.password` for any production row is NOT bcrypt-hashed (doesn't start with `$2a$` / `$2b$` / `$2y$`), the new login code will reject it. Re-hash them before launch:

```sql
-- Find affected rows
SELECT id, email, LEFT(password, 4) AS prefix FROM admins
 WHERE password NOT LIKE '$2_$%' AND status = 'active';

-- For each one, ask the admin to log in via "forgot password" so they
-- set a new password through the canonical bcrypt-hashing flow. OR
-- run a one-off hashing script that takes a plaintext value and
-- updates the row in-place. Don't post the new password back to the
-- user — make them rotate it on first login.
```

### Dependency upgrade plan (separate sprint)

The remaining `npm audit` findings all chain off Next 14 → 16:

```
high      @next/eslint-plugin-next
high      eslint-config-next
high      glob              (transitive via eslint-config-next)
high      next              (CVE-2024-* range, needs >= 16.2.7)
moderate  postcss           (transitive via next)
```

Next 16 is a 2-major-version jump from our current 14.2.29. It includes:

- React 19 (concurrent features default, new transition API)
- Async `params` / `searchParams` (the type changes we currently bypass with `ignoreBuildErrors` get worse, not better)
- Removed `next/legacy/image`
- Middleware API changes
- Updated minimum Node version (20.18 → 20.19)

Recommended approach when scoped:

1. Branch off `main`, run `npm install next@^16 react@^19 react-dom@^19 eslint-config-next@^16`.
2. Run `npx @next/codemod@latest next-async-request-api` to migrate sync → async params.
3. Test every page that uses `useParams()` / `useSearchParams()` / dynamic `[id]` segments.
4. Verify Razorpay checkout still loads under React 19 (some 3rd-party scripts hook into React internals).
5. Re-enable `typescript.ignoreBuildErrors: false` once the params migration is clean.
6. Full regression of customer + vendor + admin smoke suites against a staging deploy with bypass flags off.
7. Soak for 48h on a staging URL before promoting to production.

ETA estimate: 2-3 engineer days of focused work + 1 day of regression.
