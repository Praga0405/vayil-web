# Release Readiness — Open Items

Items that must be resolved before the marketplace can go live with real users.
Update statuses inline as each lands.

## Backend (vayil-web-backend repo)

- [ ] **Pre-existing TypeScript errors block `npm run build`.** `tsx` runtime
  works fine, but the Docker image build (`npm run build`) currently fails on:
  - `src/routes/auth.ts:47,51` — `Property 'handle' does not exist on type 'Router'`
  - `src/routes/ops.ts:17–19` — `'any' only refers to a type, but is being used as a value`
  - `src/routes/ops.ts:24` — `Property 'total' does not exist on type 'boolean'`

  Either fix the types, or change the Dockerfile to run via `tsx` instead of
  compiled output. Recommended: fix the types (1–2 h of work).

- [ ] Deploy to Render using bundled `render.yaml` Blueprint.
- [ ] Provision MySQL (Render add-on or external).
- [ ] Set env vars: DB_*, `JWT_SECRET`, `CORS_ORIGIN`,
  `OTP_BYPASS=true`, `OTP_BYPASS_CODE=123456` (replace with real OTP service later),
  `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` (test keys for now).
- [ ] First-run from Render shell:
  ```
  npm run migrate
  npm run seed
  npm run seed:marketplace            # staging
  # OR
  npm run seed:marketplace:vendors    # production
  ```
- [ ] Verify `/health` returns `{status:"ok"}`.
- [ ] Add Render daily MySQL backup.

## Frontend (vayil-web repo)

- [ ] Set `NEXT_PUBLIC_API_URL` on Vercel to the Render URL (per environment:
  preview, production).
- [ ] Confirm `/search` and `/vendors/[id]` show seeded vendors after deploy.
- [ ] **Tighten the "offline mode" fallbacks once the backend is reachable.**
  The following surfaces currently swallow API errors and continue with a
  success toast so the demo never blocks. Once Render is live they should
  surface real errors:
  - `src/app/vendors/[id]/page.tsx` — `EnquiryModal.submit` catch block
    (search for `TODO(post-launch)`).
  - `src/hooks/useLiveVendor.ts` — `useLiveVendor` and `useLiveVendors`
    fall through to `DUMMY_VENDORS` on any API failure. Keep the fallback
    for individual vendor 404s; remove for the list endpoint.
- [ ] When real auth service is supplied: swap the `setTimeout` block in
  `src/components/shared/LoginModal.tsx` for real OTP send/verify; the API
  client methods (`customerApi.sendOTP`, `verifyOTP`, `resendOTP`) are already
  in place.
- [ ] Razorpay swap: `NEXT_PUBLIC_RAZORPAY_KEY_ID` from test → live before
  going to real customers.

## Payments hardening

- [ ] Implement signature verification on backend
  (`POST /payments/verify` or webhook) before any `paymentUpdate` writes a
  success row. The frontend already passes signature fields through.
- [ ] Add `Idempotency-Key` header on every `placeOrder` and respect it on
  the backend for 5 minutes minimum.

## Observability

- [ ] Wire Sentry on web (DSN as env var) — capture page errors + failed
  mutations.
- [ ] Wire log shipping on Render (Logtail or BetterStack).
- [ ] Add a `/api/_health` proxy on the web app that pings the backend
  `/health` and surfaces status in the Vercel deployment.

## Data hygiene

- [ ] After real launch, run `npm run unseed:marketplace` on production to
  remove the demo vendors/customers/activity. Real signups will repopulate.

## Mobile parity (post-launch)

- [ ] Web push notifications (PRD P2).
- [ ] Analytics instrumentation through the funnel (PRD P2).
- [ ] Admin/ops dashboard surfaces (PRD P2).
