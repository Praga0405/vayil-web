# Release readiness — flip these before going live

This file is the single checklist for moving from dev/demo to
production. Every flag below is a deliberate dev-mode convenience —
**leaving any of them on in production is a bug**.

Last updated: 2026-06-03 · v4.5.10.

## ⚠ Critical — must be flipped

| Env var | Where | Demo value | Production value | What it does |
|---|---|---|---|---|
| `OTP_BYPASS` | backend | `true` | `false` | When `true`, `sendOtp()` short-circuits (no SMS sent) and `generateOtp()` always returns `OTP_BYPASS_CODE`. Anyone can sign in with the known code — **never ship this on**. |
| `OTP_BYPASS_CODE` | backend | `123456` | *(unset / irrelevant when bypass off)* | The fixed code used during bypass. Unused in prod. |
| `NEXT_PUBLIC_OTP_BYPASS` | frontend | `true` | `false` *(or unset)* | Drives the amber "Dev mode" banner in the login modal. Cosmetic — but if you flip the backend off and leave this on, users will see "Enter 123456" and the real OTP they get by SMS won't be that. Always flip together. |
| `NEXT_PUBLIC_OTP_BYPASS_CODE` | frontend | `123456` | *(unset)* | Code shown in the banner. Only meaningful with bypass on. |
| `PAYMENT_VERIFY_BYPASS` | backend | `true` | `false` | When `true`, Razorpay payment-verification skips signature checks so smoke tests + the demo can run without live keys. Production must verify HMAC signatures — leaving this on lets anyone mark a payment as paid. |
| `NEXT_PUBLIC_USE_MOCK_DATA` | frontend | `false` | `false` | When `true`, the frontend short-circuits API calls to in-memory data. Should be `false` everywhere except local UI-only work. |

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

## Rotation reminders (already-exposed test secrets)

- Razorpay test keys (`rzp_test_SGoCvCYBwqFk9G`) — rotate after
  leadership signoff. No production impact, but hygiene.
- 2Factor API key — if it was pasted into chat at any point, regen
  on the 2Factor dashboard before flipping to live SMS.
