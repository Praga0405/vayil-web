# Vayil — Web + Backend Monorepo

Marketplace web app for home services. Customers browse vendors, send enquiries, accept quotes, and pay via Razorpay escrow; vendors manage their listing, KYC, plans, materials, milestones, and payouts — all from a single unified marketplace experience (no separate portals).

This repo contains both deployable surfaces in one place:

```
.                  ← Next.js 14 frontend (deploys to Vercel)
├── src/
│   ├── app/                 # App Router pages
│   ├── components/          # Shared + UI primitives
│   ├── hooks/               # useLiveVendor, useVendorStudio (live + fallback)
│   ├── lib/
│   │   ├── api/client.ts    # Canonical REST API client (+ isolated legacy block)
│   │   ├── adapters/        # Backend row → component-friendly shape
│   │   ├── mockData.ts      # Demo data, used only when USE_MOCK_DATA=true
│   │   └── dummyData.ts     # 40-vendor catalogue for /search fallback
│   └── stores/auth.ts       # Zustand auth store
├── backend/                 ← Node + Express + MySQL backend (deploys to Render)
│   ├── src/
│   │   ├── routes/          # auth, customer, vendor, payments, ops, admin, common
│   │   │                    # + legacyCustomer, legacyVendor (mobile shims)
│   │   ├── middleware/      # auth (Bearer + x-access-token + body token), idempotency
│   │   ├── utils/           # razorpay (HMAC verify), adminNotify, http, otp
│   │   ├── services/        # auth, customer, vendor, enquiry, quote, project,
│   │   │                    # payment, material, notification, review, bank,
│   │   │                    # payout, tax — shared by web + mobile
│   │   ├── db.ts            # mysql2 pool + transaction helper
│   │   └── config.ts
│   ├── migrations/          # 001 schema, 002 PRD workflow, 003 seed tagging,
│   │                        # 004 vendor review queue, 005 orders enquiry unique,
│   │                        # 006 mobile compatibility (cart, reviews,
│   │                        # notifications, bank, payouts + metadata columns)
│   ├── scripts/             # migrate, seed, seed-marketplace,
│   │                        # smoke, smoke-web, smoke-mobile
│   ├── seed-data/           # 40 vendors, 8 customers, demo activity (JSON)
│   └── Dockerfile
├── docs/                    ← Reference + internal contracts
│   ├── API_CANONICAL.md          # REST surface the web app uses
│   ├── API_MOBILE_LEGACY.md      # /customer/* + /vendor/* shim contract
│   ├── PAYMENT_FLOW.md           # Escrow lifecycle + Razorpay protocol
│   ├── DB_SCHEMA.md              # Per-table column reference
│   ├── DEPLOYMENT.md             # Render + Vercel + Razorpay + S3/R2/GCS
│   └── mobile-api-inventory.md   # Flutter app endpoint inventory + payloads
├── render.yaml              # Render Blueprint for the backend service
├── .vercelignore            # Keeps backend/ out of the Vercel build
├── RELEASE_NOTES.md         # Versioned changelog
└── RELEASE_READINESS.md     # Pre-launch checklist
```

**Frontend stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, Zustand, Razorpay (client SDK loaded on demand), axios.
**Backend stack:** Node 20 + Express 4 + TypeScript, MySQL2 (pool + transactions), JWT (separate user/staff secrets), Razorpay (server SDK, HMAC signature verification), multer, helmet, express-rate-limit, zod.

### One backend, four clients

The same Express server (and the same MySQL database, payment pipeline, auth, and notification stack) serves **all** Vayil surfaces:

| Surface | Routes it uses |
|---|---|
| Customer web (this repo's `/account/*` + `/`) | Canonical `/auth/*`, `/customers/*`, `/payments/*` |
| Vendor web studio (this repo's `/vendor-studio/*`) | Canonical `/auth/*`, `/vendors/*`, `/payments/*` |
| Admin panel (`Praga0405/Vayil-Admin-Panel-main`) | `/Admin/*` (mounted at both casings) |
| **Customer Flutter app** | Legacy `/customer/*` (multipart/form-data, shimmed) |
| **Vendor Flutter app** | Legacy `/vendor/*` + bare `/<endpoint>` (multipart/form-data, shimmed) |

Business logic lives **once**, in `backend/src/services/*`. Both the canonical web routes and the legacy mobile shims call into the same service functions, so the same auth, ownership checks, payment validation, escrow holds, and notification writes apply regardless of client. See `docs/mobile-api-inventory.md` for the full mobile contract.

---

## Architecture at a glance

```
                  Next.js (Vercel)                                  ┌──────────────────────┐
   ┌──────────────────────────────────────┐                         │ Vayil Admin Panel    │
   │  Customer web    Vendor web studio   │                         │ (React, Vite)        │
   │  /account/*      /vendor-studio/*    │                         │ Praga0405/Vayil-     │
   └──────────┬───────────────┬───────────┘                         │ Admin-Panel-main     │
              │ Bearer JWT    │ Bearer JWT                          └──────────┬───────────┘
              │ JSON          │ JSON                                           │ staff JWT
              ▼               ▼                                                ▼ JSON
   ┌──────────────────────────────────────────────────────────────────────────────┐
   │             Express + TypeScript + multer + helmet (Render)                   │
   │                                                                              │
   │   /payments/webhooks ── raw body, mounted FIRST (Razorpay HMAC)              │
   │   /auth /customers /vendors /payments /ops /Admin /admin   ── JSON only      │
   │   /customer /vendor /<bare-endpoint>                       ── multipart      │
   │                                                              + JSON fallback  │
   │   ──────────────────────────────────────────────────────────────             │
   │       routes/  (canonical + legacyCustomer + legacyVendor)                   │
   │       ↓                                                                       │
   │       services/  ← single source of truth for every domain                   │
   │            auth · customer · vendor · enquiry · quote · project ·            │
   │            payment · material · notification · review · bank ·               │
   │            payout · tax                                                       │
   │       ↓                                                                       │
   │       db.ts  (mysql2 pool + transaction helper)                              │
   └────────────────────────────────┬─────────────────────────────────────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              ▼                     ▼                     ▼
       MySQL (Render)        Razorpay server SDK      FCM (future)
       payment_intents       Orders.create
       escrow_ledger         signature verify
       materials, plans      webhook delivery
       vendor_wallet,
       notifications,
       customer_cart,
       customer_reviews,
       bank_details,
       payout_requests …
                ▲
                │ HTTPS (multipart/form-data via Dio.FormData.fromMap)
                │ Authorization: Bearer <jwt>  +  X-Source: mobile-app
                │
   ┌────────────┴───────────────────────────────────────────────┐
   │   Flutter — Vayil-customer-App-main    Vayil-vendor-App-main │
   └──────────────────────────────────────────────────────────────┘
```

### Data flow for a payment (canonical)

1. Customer picks Full / 25 % min / Custom amount → frontend computes GST via `calculateFees`.
2. **`POST /payments/create-order`** with `Idempotency-Key` header → backend:
   - Validates the request belongs to this customer (enquiry / order / milestone ownership)
   - Validates state preconditions (quote `accepted`, plan `approved` for materials, milestone `awaiting_payment`)
   - **Re-derives the chargeable amount server-side** (`calculateTax`) and rejects mismatched client amounts (≤ ₹1 paise tolerance)
   - Creates a `payment_intent` row (`status='initiated'`) and a Razorpay order via the server SDK using the **server-derived** amount.
3. Razorpay Checkout opens client-side with `order_id`.
4. On Razorpay's `handler`, the frontend calls **`POST /payments/verify`** with the signature.
5. Backend HMAC-checks the signature (`crypto.timingSafeEqual`), flips the intent to `escrow_held`, writes an `escrow_ledger` hold row, and:
   - `purpose='quote'` → materialises (or reuses, via `UNIQUE(enquiry_id)`) the `orders` row
   - `purpose='materials'` → selected items flip to `PAID`
6. On project sign-off, **`POST /customer/projects/:id/signoff`** calls `releaseEscrow()` which ensures the `vendor_wallet` row exists, credits balance + total_earning, and writes a `release` ledger row.
7. Razorpay webhook **`POST /payments/webhooks/razorpay`** (raw body, HMAC-verified, lives on a separate router mounted before `express.json()`) is the server-to-server safety net for `payment.captured` / `payment.failed` if the browser leaves before `verify`.

Idempotency: every state-mutating POST that originates from the customer/vendor surfaces accepts an `Idempotency-Key` header. The first call runs the handler and caches the response in `idempotency_keys`; replays return the cached response without re-running side effects.

---

## What's new since v4.5.1 (May 27 → June 7, 2026)

The README was last refreshed at v4.5.1. Since then 24 versions shipped, several of which changed the deployment topology, the runtime DB, the OTP path, the SEO posture, and the security model. This section is a one-stop catch-up — every detailed entry lives in [`RELEASE_NOTES.md`](./RELEASE_NOTES.md).

### Production hosting moved to all-Vercel + TiDB Cloud

Up through v4.5.4 the production setup was "Vercel frontend + Render backend + Render MySQL." From **v4.5.6** onward Vayil ships as a single Vercel deployment with the backend mounted as a serverless function — no separate backend host.

| Layer                | Before (v4.5.1)            | Now (v4.5.35)                                                                                                          |
|----------------------|-----------------------------|------------------------------------------------------------------------------------------------------------------------|
| Frontend             | Vercel                      | Vercel (unchanged)                                                                                                     |
| Backend              | Render `vayil-backend` service | Vercel serverless function via `pages/api/[...all].ts` catch-all that imports the Express app                          |
| Database             | Render MySQL                | TiDB Cloud Serverless (MySQL-wire compatible)                                                                          |
| Builder              | Render Docker multi-stage   | `npm run vercel-build` → `cd backend && tsx scripts/migrate.ts \|\| true && cd .. && next build`                       |
| Custom domain        | `vayil.in` → Render         | `vayil-web.vercel.app` (custom domain wiring is the post-demo step)                                                    |
| Razorpay webhooks    | `https://<render>/payments/webhooks/razorpay` | `https://vayil-web.vercel.app/api/payments/webhooks/razorpay` (or the bare `/payments/...` after v4.5.18 rewrites land) |

The `render.yaml` Blueprint still works as a fallback. Render docs in this README are retained for that contingency, but the production-supported path is Vercel + TiDB.

### Critical bugfix chain that ran during the deployment hardening sprint

`v4.5.6` (one-click Vercel) through `v4.5.20` (TiDB schema parity) was essentially one continuous debugging session — each version fixed a deployment-blocker that surfaced the next one. Worth knowing what each was for:

| Version | What it fixed |
|---|---|
| v4.5.6 | One-click all-Vercel deploy scaffolding (vercel.json + build script). |
| v4.5.7 → v4.5.9 | 2Factor SMS OTP wired with R1 (DLT) endpoint, env-name aliases (`OTPFactor_API_KEY` / `TWO_FACTOR_API_KEY` both work), 2Factor failure-body parsing, root-deps hygiene. |
| v4.5.10 | Dev-mode OTP bypass UX (amber banner on the LoginModal in dev) and `docs/RELEASE_READINESS.md` checklist for production rollback. |
| v4.5.12 | **`/api/*` routes returned Next.js HTML 404s on Vercel.** The root-level `api/[...all].ts` Vercel convention is shadowed by App Router when the project also has `src/app/`. Moved to `pages/api/[...all].ts` (Pages Router) — coexists with App Router and is routed natively. |
| v4.5.13 | Vercel build was failing on `useParams<{id:string}>()` types (Next 15 made `Params` nullable). Added `typescript: { ignoreBuildErrors: true }` + `eslint: { ignoreDuringBuilds: true }` to `next.config.js`. Tracked as a post-demo refactor (~17 dynamic-route page files). |
| v4.5.14 | `app.set('trust proxy', 1)` so `express-rate-limit` reads `X-Forwarded-For` correctly behind Vercel's edge. |
| v4.5.15 | **Race condition on "Invalid OTP" for existing users.** Two parallel `/auth/otp/verify` calls (React 18 StrictMode dev double-fire AND/OR rapid user double-tap) — first consumed the `otp_codes` row, second hit a consumed row and returned 400. Fixed on both layers: frontend re-entry guard (`if (loading) return`) + backend 1-minute idempotency window. |
| v4.5.18 | **Mobile app got HTML 404s on bare `/customer/getSettings`.** The Flutter app calls bare paths (no `/api` prefix). Added `afterFiles` rewrites in `next.config.js` forwarding `/customer/*`, `/vendor/*`, `/auth/*`, `/Admin/*`, `/payments/*`, `/webhooks/*` to the equivalent `/api/<same>`. |
| v4.5.19 | Tightened rewrites to skip numeric IDs (`/vendors/120001` is a Next.js dynamic page, not an API path); fixed responsive button widths; fixed vendor-studio edit-service infinite-load (response shape was `{data:{listings:[...]}}` not `{data:[...]}`); fixed View-as-customer link. |
| v4.5.20 | **Migrations 004–006 never actually applied on TiDB Cloud.** TiDB Serverless rejects inline `ADD COLUMN ... UNIQUE` (errno 8200) and `CREATE TRIGGER` (no trigger support). Shipped `009_tidb_schema_align.sql` (TiDB-compatible split of ADD COLUMN + CREATE UNIQUE INDEX) and hardened `migrate.ts` to skip triggers + tolerate TiDB-unsupported errnos. |

After v4.5.20 the production schema finally matches the mobile dump (all `id` mirror columns, slug, status_int, ph_code, pricing_type, etc.).

### Legacy mobile URL compatibility (v4.5.18)

The mobile team's existing Flutter build keeps working with `https://vayil-web.vercel.app` as base URL — no app release required. `next.config.js` rewrites map every legacy prefix internally:

```text
/customer/*  →  /api/customer/*
/vendor/*    →  /api/vendor/*
/auth/*      →  /api/auth/*
/Admin/*     →  /api/Admin/*
/payments/*  →  /api/payments/*
/webhooks/*  →  /api/webhooks/*
...
```

The rewrites use Next.js `afterFiles` mode + a regex constraint that only matches alphabetic first segments (`:endpoint([A-Za-z_][^/]*)`). This means:

- ✅ `/customer/getSettings` hits Express (mobile API path).
- ✅ `/customer/dashboard` serves the Next.js customer dashboard page (web UI).
- ✅ `/vendors/120001` serves the Next.js public vendor profile page (because `120001` doesn't start with a letter).

⚠ **Response shapes still differ** between the new backend and the old `app.vayil.in` server on some endpoints (`getSettings` is the documented example — new returns `{success, message, data: {...}}` vs. old `{success, categories: [...]}`). Mobile team is updating models. Either tell them which fields they consume so we can shim or they adapt client-side.

### TiDB Cloud schema parity (v4.5.20)

Production database is **TiDB Cloud Serverless** (MySQL-wire compatible). Connection bits are stored in Vercel env vars (`DB_HOST` = `gateway01.us-east-1.prod.aws.tidbcloud.com`, `DB_PORT=4000`, `DB_SSL=true`).

Two TiDB-specific quirks to know about:

1. **No `CREATE TRIGGER` support.** Migration 006's 8 `status_int`-sync triggers are skipped on TiDB. The `migrate.ts` runner detects the statement and logs `skip (trigger, TiDB unsupported)`. Application code dual-writes `status_int` on the legacy save handlers as a substitute.
2. **No inline `ADD COLUMN ... UNIQUE`** — TiDB Serverless rejects with errno 8200. Migration `009_tidb_schema_align.sql` re-applies every column add as `ADD COLUMN ... NULL` + `CREATE UNIQUE INDEX ... ON (col)` as separate statements. Idempotent against MySQL too — no-op when 004/006 already ran.

The hardened `migrate.ts` also tolerates errnos 1050 (table exists), 1060 (column exists), 1061 (key exists), 1062 (dup data), 1091 (drop missing), 1146 (table missing) and TiDB errnos 1235 + 8200. Per-file summary line in build logs reads `N applied · M skipped · K TiDB-tolerated`.

### Vendor Studio modernisation (v4.5.16, v4.5.17, v4.5.19)

The new vendor-facing UX is now consistent. Highlights:

- **Add Service** and **Edit Service** rebuilt under `src/app/vendor-studio/services/{add,[id]}/page.tsx` with the same design vocabulary as the rest of vendor-studio (`PageHero` + `TwoColumn` + stacked `PageSection`s).
- **My Listing** now links to the new add/edit pages instead of the legacy `/vendor/services/*` portal (which still exists, just no longer reachable through normal in-app navigation).
- **Taxonomy seeded from the mobile team's dump:** 10 production categories, 24 sub-categories, 15 tags. Migrations `007_seed_taxonomy.sql` + `008_fix_subcategory_mapping.sql` handle local seeding; production TiDB was seeded directly via mysql2 during the v4.5.20 session (rows are present, slug-mapped correctly).
- **Responsive CTA buttons:** `<Button full>` is now full-width only on mobile, `min-w-[180px]` on tablet+, so big orange "Send Quote / Save Materials / Send Payment Request" buttons don't visually dominate the form.

### OTP race-condition fix (v4.5.15)

Existing customers and vendors were intermittently seeing "Invalid OTP — try again" with the correct code. Cause: two parallel `POST /auth/otp/verify` calls — first consumed the `otp_codes` row, second hit it after `consumed=true` and returned 400.

Fixed on both layers:

- **Frontend** (`LoginModal.tsx`) — `if (loading) return` at the top of `verifyOTP()`. Closes the re-entry window between user click and React's `setLoading(true)` propagating to the button's `disabled` prop. Also handles React 18 StrictMode dev double-render.
- **Backend** (`utils/otp.ts`) — 1-minute idempotency window. If the happy-path SELECT misses, fall back to checking for the same `phone + purpose + otp_hash` that was consumed within the last 60 seconds. Same OTP value on the same row — safe to treat as success.

### SEO + accessibility framework (v4.5.21)

Lighthouse SEO scored 63 before this release (no robots.txt, no sitemap, no canonical, no Open Graph, no structured data). Now:

- **`src/lib/seo/site-config.ts`** — central SEO config (canonical URL, tagline, keywords, geo coordinates, theme colour, social handles). One file to change; everything else picks it up.
- **`src/lib/seo/jsonld.tsx`** — 7 ready-to-drop schema.org JSON-LD components: Organization, WebSite (with SearchAction sitelinks search box), LocalBusiness, BreadcrumbList, Service, VendorProfile (with AggregateRating), FAQPage.
- **`src/app/robots.ts`** — auto-served `/robots.txt` with allow/disallow rules and sitemap link.
- **`src/app/sitemap.ts`** — auto-served `/sitemap.xml` with 52 URLs (7 static + 9 service categories + 36 city-service combinations for future local-pack ranking).
- **`src/app/manifest.ts`** — PWA manifest for "Add to Home Screen".
- **`src/app/layout.tsx`** — comprehensive metadata + viewport exports (Open Graph, Twitter Card, hreflang `en-IN` + `x-default`, geo meta tags, multiple icons), `<main id="main-content">` landmark, skip-to-content link, sitewide JSON-LD.
- **Accessibility fixes** in `LoginModal.tsx` (close-X got `aria-label` + 44×44 touch target) and `vendor-studio/services/[id]/page.tsx` (image-remove × buttons + status toggle).

Expected scores after Vercel auto-deploys + Lighthouse re-runs against the **production alias** (NOT the deployment-style URL where Vercel auto-applies `x-robots-tag: noindex`):

| Category | Before | After |
|---|---|---|
| Performance | 90 | 90 (WebP/AVIF + polyfill drop are the next pass) |
| Accessibility | 84 | ~92 |
| Best Practices | 96 | 96 |
| SEO | **63** | **~98** |

### Pre-seeded demo accounts on production TiDB

For leadership demos, four canonical accounts are now seeded on production with realistic in-flight job data:

| Role | Phone | OTP | Name | ID |
|---|---|---|---|---|
| Vendor | `7799036172` | `123456` | Demo Vendor — Electrical | vendor_id 120001 |
| Vendor | `7799036173` | `123456` | Demo Vendor — Plumbing | vendor_id 120002 |
| Customer | `9876543210` | `123456` | Demo Customer | customer_id 1 |
| Customer | `9876543211` | `123456` | Demo Customer 2 | customer_id 90001 |

Demo Vendor — Electrical also has 2 active jobs (₹85k + ₹18k) with milestone plans in mixed states, escrow holds, and partial released payments — useful for showing the full Vendor Studio dashboard with non-empty data.

### Dev-mode bypass flags that ship enabled on production right now

For the leadership demo phase these are intentionally **on**. Flip them off before real customers hit the system:

| Env var | Demo value | Production value | Effect |
|---|---|---|---|
| `OTP_BYPASS` | `true` | `false` | `sendOtp()` short-circuits (no 2Factor SMS sent), `verifyOtp()` accepts the fixed bypass code |
| `NEXT_PUBLIC_OTP_BYPASS` | `true` | `false` | Drives the amber dev banner on the LoginModal; must flip together with the backend flag |
| `OTP_BYPASS_CODE` | `123456` | unset | Bypass OTP value |
| `PAYMENT_VERIFY_BYPASS` | `true` | `false` | Razorpay payment-verify signature check skipped so demo flows don't need a live Razorpay session |

The full list of pre-launch flips lives in `docs/RELEASE_READINESS.md`.

### Lighthouse + security sprint (v4.5.22 → v4.5.25, all 2026-06-07)

After v4.5.21's SEO upgrade pushed Lighthouse to 95/86/96/100 (Perf/A11y/BP/SEO), the next four releases tackled the remaining audit findings and the broader production security posture.

**v4.5.22** — Lighthouse follow-up + production polish:

- **Strict security headers** on every HTML route in `next.config.js`: full Content-Security-Policy (Razorpay, 2Factor, Google Fonts, Unsplash, S3 explicitly allow-listed), Cross-Origin-Opener-Policy, X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy (camera/mic/USB denied; Razorpay payment iframe allowed), HSTS 2yr preload-eligible. CORS-only headers kept on `/api/*` so the mobile app's Dio client keeps working.
- **Inter font self-hosted via `next/font/google`** — eliminates ~580 ms of render-blocking fetch to `fonts.googleapis.com`. `--font-inter` CSS variable wired through `<html className={inter.variable}>`.
- **`next/image` WebP/AVIF** — `images.formats: ['image/avif', 'image/webp']` + 30-day CDN cache. Lighthouse estimated 101 KiB savings.
- **Homepage CLS regression** (0.023 → 0.102 after v4.5.21) closed by adding explicit `width`/`height` HTML attrs to the quick-link card thumbnails.
- **403 console error** from `/api/customer/enquiryList` fixed: the home page's "recent enquiries" widget now requires `user.type === 'customer'` AND a token in localStorage before firing. Interceptor handles 403 the same way as 401.
- **Colour-contrast override** in `globals.css` (single source of truth): `text-orange` → 5.27:1, `text-orange-600` → 7.0:1, `text-navy/60` → 5.5:1, `text-gray-400` → 7.2:1. WCAG AA passes without touching 39 component files.

**v4.5.23** — Production security audit fixes (P0 + most P1 from the audit):

- **`config.ts` production guards** — refuses to boot in production (originally) when CORS_ORIGIN is unset/`*`, DB_PASSWORD blank, DB_SSL off, JWT secrets weak (<32 chars), Razorpay keys missing. *(v4.5.24 made this opt-in — see below.)*
- **`razorpay.ts` fail-closed** — `createRazorpayOrder()` and `verifyRazorpaySignature()` both throw in production when keys are missing. `config.paymentVerifyBypass` is hard-ANDed with `!isProd` so a stale `PAYMENT_VERIFY_BYPASS=true` env var can't open up signature checks at runtime.
- **`/settings` deny-list** — new `publicSettingsSafe()` helper strips any field whose name matches `secret|password` or sits in an explicit deny-list (`payment_secret`, `smtp_password`, `smtp_username`, `two_factor_api_key`, etc.). Wired through `/settings`, `/customer/getSettings`, `/vendor/getSettings`. Admin endpoints unchanged.
- **Ownership checks** — customer milestone approval (`/customer/projects/:id/milestones/:mid/approve`) and vendor quote creation (`/vendor/enquiries/:id/quotes`) now SELECT ownership before mutating. Closes two authz holes where a customer/vendor knowing another user's project/enquiry ID could mutate it.
- **Admin login bcrypt-only in production** — the previous `bcrypt-or-plaintext` fallback rejected. Dev keeps plaintext for local fixtures.
- **Header-only token transport in production** — `extractToken()` ignores `body.token`/`body.access_token`/`query.token` in prod. Query tokens leak via access logs / Referer headers. Dev keeps the fallback for legacy mobile FormData.
- **Idempotency cross-user scoping** — cache lookup keyed by `(id_key, user_id, user_type, endpoint)`. Was bare `id_key`, leading to cross-user response leaks.
- **OTP plaintext mirror removed** — `storeOtp()` no longer writes `customers.otp = :otp` / `vendors.otp = :otp`. Metadata columns (`otp_expires_at`, `otp_attempts`, `last_otp_sent_at`) kept. Source of truth remains SHA2-hashed `otp_codes.otp_hash`.
- **Swiper CVE removed** — was a dead dependency (no source usages). npm audit: 1 critical → 0 critical. Remaining 4 high + 1 moderate are the Next 14 → 16 chain; full migration plan in `docs/RELEASE_READINESS.md`.

**v4.5.24** — Hotfix: relaxed v4.5.23's startup throws to warnings, gated behind a new `STRICT_PROD_CONFIG=true` opt-in:

v4.5.23's "refuse to start in production" checks hard-stopped the live demo because the existing Vercel env had `CORS_ORIGIN` unset and JWT secrets shorter than 32 chars. The serverless function threw at module-load time and every API request returned 500. Symptom: "Failed to send OTP" in the LoginModal.

v4.5.24 routes every check through a `reportProdIssue()` helper:

- **`STRICT_PROD_CONFIG=true`** in env → throws at startup (v4.5.23 behaviour, opt-in)
- **Default (flag unset)** → logs `[config] WARNING (production, lenient mode): ...` and continues

Per-request safety from v4.5.23 is preserved: `verifyRazorpaySignature()` still throws in prod when key missing, `/settings` still strips secrets, ownership checks still enforced, etc. Only the boot-time gate is now opt-in. The intent: keep the demo running, flip `STRICT_PROD_CONFIG=true` on Vercel right before the `vayil.in` launch so any misconfig surfaces in the build log.

**v4.5.25** — Hotfix: CORS regression in v4.5.23 broke browser OTP requests:

v4.5.23 rewrote the CORS middleware with a `!config.isProd && config.corsOrigins.includes('*')` guard. In production with `CORS_ORIGIN` unset on Vercel (the demo state), `corsOrigins` defaulted to `['*']`, but the `!isProd` half of the guard was false, so the wildcard branch never fired. Every browser preflight got rejected → "Failed to send OTP." Mobile (Dio, no `Origin` header) kept working via the `!origin` early-return.

Fix in `backend/src/index.ts`:

```diff
- if (!config.isProd && config.corsOrigins.includes('*')) return cb(null, true);
+ if (config.corsOrigins.includes('*')) return cb(null, true);
```

Net behaviour:

| `CORS_ORIGIN` env | Mode | Browser request |
|---|---|---|
| unset OR `*` | lenient | Reflects any origin (v4.5.22 behaviour) |
| `https://vayil.in,https://admin.vayil.in` | strict | Only listed origins pass; attackers get a quiet refusal (no log spam) |

Also switched the reject path from `cb(new Error, false)` → `cb(null, false)` (the cors package's quiet-reject contract) so attacker scans don't dump stack traces to the logs.

Every other v4.5.23 hardening is unchanged — v4.5.25 brings working CORS forward without losing any security work.

**v4.5.26** — Mobile-team public-route pass:

After the mobile team flagged that several pre-login flows (browse, vendor profile, location pickers, settings, file upload) were still demanding a Bearer token, 17 endpoints were lifted above the `requireAuth()` wall. The full list lives in `RELEASE_NOTES.md`; high-level summary:

- **Customer (now public):** `ServiceList`, `ServiceInfo`, `vendorInfo`, `ServiceCategories`, `ServiceSubcategories`, `get_city`, `get_states_by_country_id`, `getSettings`, `upload_files` (soft-auth: guest prefix when anonymous).
- **Vendor (now public):** `getToolList`, `vendorlistReviews` (takes `vendor_id` from body), `vendorGetSettings`.
- **Bare-path aliases (new `backend/src/routes/bareMobile.ts`):** `/getLanguages`, `/getTools`, `/getToolList`, `/listStatus`, `/get_states_by_country_id`, `/getSettings`, `/get_city`, `/listProofTypes`, `/upload_files`.

Six routes the mobile team listed were **kept gated** because public access would be a security regression: `/customer/getCart` (per-user data), `/vendor/markNotificationRead` (per-user state), and the four admin mutations `/service-category/toggle`, `/service-subcategory/toggle`, `/service-tag/toggle`, `/ProofStatus`. These need a clarification round with the mobile team before any change.

**v4.5.27** — Production hotfix: master 500 on every prefixed mobile path + OTP-verify `ph_code` crash:

After v4.5.26 deployed, the mobile team filed seven separate bug reports (Create New Vendor/Customer broken, OTP "Invalid", products not listed, business-details update broken, profile-image upload broken, service-edit tags/images missing, active/inactive toggle broken). Triage confirmed all seven shared a single root cause: the Next.js `afterFiles` rewrites added in v4.5.19 used the optional-named-regex form `:rest(/.*)?`, which the path-to-regexp variant Next.js ships rejects on the edge. Every `/customer/*`, `/vendor/*`, `/auth/*`, `/customers/*`, `/vendors/*`, `/Admin/*`, `/ops/*`, `/payments/*` request emitted Next.js's `/500` page instead of forwarding to `/api/...`. Direct `/api/...` calls were healthy throughout.

Fix: split each prefix into two valid rewrites (`/:endpoint` flat path + `/:endpoint/:rest*` nested) using only the standard path-to-regexp shapes. Rewrite count went from 15 → 33 entries.

A second bug surfaced once traffic was unblocked: `authService.verifyOtpAndIssueToken()` didn't supply `ph_code` on first-time INSERT (a NOT-NULL column added by migration 006 for mobile-team schema parity), so every brand-new signup crashed with `ER_NO_DEFAULT_FOR_FIELD`. The error was previously masked because the global error handler dropped `err.message` for non-`ApiError` 500s. v4.5.27 surfaces `err.message` + SQL state for those, and supplies `ph_code: '91'` on the customer/vendor INSERT.

A router-order bug for the v4.5.26 bare-path mounts (`/getTools` returned 401 because `bareMobileRouter` was mounted at `'/'` AFTER `legacyCustomerRouter` whose `requireAuth` intercepted first) is also fixed.

Production verification post-deploy: customer register + verify, vendor register + verify, settings, ServiceList, and bare `/getTools` all return proper JSON. Mobile team can now retry every item on their list.

### Two new env vars introduced in this sprint

| Env var | Default | When to flip |
|---|---|---|
| `STRICT_PROD_CONFIG` | unset (lenient) | Set to `true` on Vercel right before the `vayil.in` launch. Boot will then refuse to serve if any required prod env var is missing or weak. |
| `NEXT_PUBLIC_OTP_BYPASS_CODE` | `123456` (with bypass on) | Drives the dev banner copy. Cosmetic. |

Both are documented in `docs/RELEASE_READINESS.md § Security audit follow-ups (v4.5.23)`.

---

## Mobile + Web on one backend (v4.0.0+)

The existing Vayil customer and vendor **Flutter apps** call the same
Render-hosted Express server the web does. They speak a different
dialect — older endpoint names, multipart bodies, response keys mirrored
at the root — but every request lands in the same service layer that
the web uses, so there is exactly one place to fix every bug, ship
every feature, and audit every payment.

### Three transport layers, one service layer

```
                          ┌──────────────────────────────────┐
   /payments/webhooks  ─► │ paymentsWebhookRouter (raw body) │ HMAC verify
                          └──────────────────────────────────┘
                          ┌──────────────────────────────────┐
   /auth /customers       │ canonical routers (JSON only)    │
   /vendors /payments  ─► │   src/routes/{auth,customer,     │ ─┐
   /ops  /Admin /admin    │   vendor,payments,ops,admin}.ts  │  │
                          └──────────────────────────────────┘  │
                          ┌──────────────────────────────────┐  │   call into
   /customer/*         ─► │ legacyCustomerRouter             │ ─┼──►  src/services/*
                          │   multipart + JSON via multer    │  │
                          └──────────────────────────────────┘  │
                          ┌──────────────────────────────────┐  │
   /vendor/*           ─► │ legacyVendorRouter               │ ─┘
   /<bare endpoint>       │   multipart + JSON via multer    │
                          └──────────────────────────────────┘
```

The legacy routers are **thin shims** — no SQL, no business logic. They
extract payload keys with the helper `pickId(body, 'enquiry_id', 'enquiryId', 'id')`,
coerce types with `num(v)` (Dio sends every multipart field as a string),
call a service function, and respond via `send(res, …)` which
returns `{ success, message, data, ...top-level mirrors }`.

### Service layer reference

Each file is one bounded domain. Mobile shims and (future-refactored)
canonical routes both call the same functions, so the same auth,
ownership checks, escrow rules, and notification writes apply
regardless of client.

| File | Key functions |
|---|---|
| `services/authService.ts` | `requestOtp(phone, userType)`, `verifyOtpAndIssueToken({phone,otp,userType,name?})` |
| `services/customerService.ts` | `getCustomer`, `updateCustomer`, `listVendors`, `getVendorWithListings`, `addToCart`, `getCart`, `removeCartItem`, `clearCart` |
| `services/vendorService.ts` | `getVendor`, `updateVendor`, `onboardingStep`, `listListings`, `createListing`, `updateListing`, `setListingStatus`, `addServiceTag`, `getVendorWallet` |
| `services/enquiryService.ts` | `createEnquiry`, `listCustomerEnquiries`, `listVendorEnquiries`, `getEnquiryForCustomer`, `vendorAcceptEnquiry`, `vendorRejectEnquiry` |
| `services/quoteService.ts` | `sendQuote`, `listQuotes`, `acceptQuote`, `rejectQuote` |
| `services/projectService.ts` | `createPlan`, `updatePlan`, `submitPlan`, `setPlanStatusByCustomer`, `postMilestoneUpdate`, `completeMilestone`, `requestMilestonePayment`, `signoffOrder` |
| `services/paymentService.ts` | `resolveExpectedAmount`, `createPaymentIntent`, `verifyAndHold`, `getOrderPaymentSummary`, re-exports `releaseEscrow` |
| `services/materialService.ts` | `listMaterials`, `addMaterial`, `updateMaterial`, `markMaterialsAwaitingPayment`, `isCustomerMaterialsLocked` |
| `services/notificationService.ts` | `notify({recipient_type,recipient_id,type,title,body?})`, `list`, `markRead`, `markAllRead` |
| `services/reviewService.ts` | `addReview` (recomputes `vendors.rating`), `listVendorReviews` |
| `services/bankService.ts` | `addBankDetails`, `listBankDetails`, `editBankDetails`, `requestEditBankDetails` |
| `services/payoutService.ts` | `requestPayout`, `getVendorTransactions`, `getRevenueChart` |
| `services/tax.ts` | `calculateTax({baseAmount, …})` — GST + platform fee + TDS + vendor net payout (unchanged from v3.x) |

### Adding a new feature (the pattern)

```ts
// 1. Add a function to the relevant service file.
//    backend/src/services/enquiryService.ts
export async function archiveEnquiry(enquiryId, customerId) {
  await assertEnquiryBelongs(enquiryId, customerId);
  await exec(`UPDATE enquiries SET status = 'archived' WHERE enquiry_id = :id`, { id: enquiryId });
  return { enquiry_id: Number(enquiryId), status: 'archived' };
}

// 2. Expose it from the canonical web route (JSON).
//    backend/src/routes/customer.ts
customerRouter.post('/enquiries/:id/archive', async (req, res, next) => {
  try { ok(res, await enquiryService.archiveEnquiry(req.params.id, req.user!.id)); }
  catch (err) { next(err); }
});

// 3. Expose it from the legacy mobile route (multipart) — only if the
//    mobile app needs it.
//    backend/src/routes/legacyCustomer.ts
legacyCustomerRouter.post('/archiveEnquiry', async (req, res, next) => {
  try {
    const id = pickId(req.body, 'enquiry_id', 'enquiryId');
    if (!id) throw new ApiError(400, 'enquiry_id required');
    send(res, { message: 'Archived', data: await enquiryService.archiveEnquiry(id, req.user!.id) });
  } catch (err) { next(err); }
});
```

The logic exists exactly once. Tests, ownership checks, transactions
all live in the service. Web and mobile shims are stylesheets over the
same data flow.

### Token compatibility matrix

`requireAuth([…allowed])` extracts the JWT from any of:

| Source | Used by |
|---|---|
| `Authorization: Bearer <jwt>` | Web axios interceptor + current Flutter Dio interceptor |
| `x-access-token: <jwt>` | Legacy mobile alt header (some older builds) |
| body `token` / `access_token` | Some Flutter screens still embed the token in form fields |
| query `?token=…` | Rare — legacy GET endpoints |

`softAuth()` (new in v4.0.0) sets `req.user` if a valid token is
present but never rejects — used by mobile catalogue-browse endpoints
that fire pre-login.

### Multipart vs JSON

| Mount | Body parser |
|---|---|
| `/payments/webhooks/razorpay` | **None** — Razorpay raw body for HMAC |
| Canonical routers (`/auth`, `/customers`, `/vendors`, `/payments`, `/ops`, `/Admin`, `/admin`) | `express.json()` + `urlencoded()` |
| Legacy routers (`/customer`, `/vendor`, bare `/<endpoint>`) | `legacyMultipart` middleware: multer parses `multipart/form-data`, JSON falls through |

`legacyMultipart` uses `multer().none()` (text fields only). Handlers
that actually accept files (`upload_files`) install `upload.any()`
themselves; multer's `LIMIT_UNEXPECTED_FILE` error from the outer
middleware is caught and the inner handler runs.

### Mobile payment flow

The mobile `placeOrder` + `payment_update` pair routes onto the same
`payment_intents` + `escrow_ledger` pipeline the web uses:

```
placeOrder (mobile multipart)  ─►  paymentService.createPaymentIntent
                                      ├── resolveExpectedAmount  (re-derives total;
                                      │     refuses client-supplied lies)
                                      ├── ownership + state preconditions
                                      ├── INSERT payment_intents (status='initiated')
                                      └── Razorpay Orders.create
                                          → returns { razorpay_order_id, intent_id, amount }

                          (Razorpay Checkout opens in WebView / native modal)

payment_update (mobile)        ─►  paymentService.verifyAndHold
                                      ├── HMAC-verify razorpay_signature
                                      │     (crypto.timingSafeEqual)
                                      ├── UPDATE payment_intents status='escrow_held'
                                      ├── INSERT escrow_ledger direction='hold'
                                      ├── if purpose='quote' → materialise orders row
                                      └── if purpose='materials' → flip rows to PAID

finalStep (mobile)             ─►  projectService.signoffOrder
                                      ├── INSERT signoffs
                                      ├── orders.status = 'completed'
                                      └── for each held intent → releaseEscrow
                                            ├── INSERT escrow_ledger direction='release'
                                            └── credit vendor_wallet
                                                (ensure row exists via ON DUPLICATE KEY)
```

**The old "credit `vendor_wallet` directly from `placeOrder`" behaviour
is gone.** Funds only enter the wallet via `releaseEscrow`, which is
triggered by sign-off (today) and milestone completion (future patch).

### Mobile API contract

The full per-endpoint contract — payload keys, response shape, screen
file references — lives in [`docs/mobile-api-inventory.md`](./docs/mobile-api-inventory.md).
That doc is generated from a direct scan of the unpacked Flutter
source and is the authoritative reference when adding or modifying a
legacy route.

### Mobile-supporting tables (migration 006)

| Table | Purpose |
|---|---|
| `customer_cart` | Customer-side cart (mobile-only feature, web hasn't surfaced it yet) |
| `customer_reviews` | One-per-completed-job; auto-recomputes `vendors.rating` |
| `notifications` | Shared inbox (`recipient_type` ENUM: `customer`/`vendor`/`staff`) |
| `bank_details` | Vendor payout accounts with an `edit_requested_at` review workflow |
| `payout_requests` | Wallet → bank payout lifecycle (`requested`/`approved`/`rejected`/`paid`/`failed`) |

Plus column additions on `enquiries` (budget, lat/lng, preferred_date,
accept/reject timestamps), `vendors` (profile_image, address, pincode,
about, owner_name, experience_years, fcm_token), `customers`
(profile_image, pincode, fcm_token), `vendor_services` (subcategory_id,
thumbnail, tag_ids), and `quotation` (gst_amount, platform_fee,
advance_amount).

---

## Prerequisites

| Tool      | Version           | Notes                                          |
| --------- | ----------------- | ---------------------------------------------- |
| Node.js   | **18.17+** or 20+ | Required by Next.js 14 and tsx                 |
| npm       | 9+                | Comes with Node                                |
| MySQL     | 8.0+              | Local or Render add-on for the backend         |
| Git       | any               | For cloning                                    |

Check what you have:

```bash
node -v
npm -v
mysql --version
```

---

## Local development

### 1. Clone the repo

```bash
git clone https://github.com/Praga0405/vayil-web.git
cd vayil-web
```

### 2. Install both halves

```bash
npm install               # frontend deps
cd backend && npm install # backend deps
cd ..
```

### 3. Configure environment variables

**Frontend** (`./.env.local`):

```bash
# Backend API base URL. Locally → http://localhost:9090 to use the standalone
# backend; on Vercel → leave UNSET or set to "/api" so the frontend hits the
# serverless function on the same origin (no CORS, no env-var per-deployment URL).
NEXT_PUBLIC_API_URL=http://localhost:9090

# When the backend isn't running, force the dummy-data fallback so /search etc. still works
# NEXT_PUBLIC_USE_MOCK_DATA=true

# Razorpay public key (use rzp_test_* for staging)
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_placeholder

# This app's own URL
NEXT_PUBLIC_APP_URL=http://localhost:3000

# v4.5.10+ — dev-mode OTP bypass. Set to true so the LoginModal shows
# the amber "Dev mode — OTP delivery is bypassed" banner with the fixed code.
NEXT_PUBLIC_OTP_BYPASS=true
NEXT_PUBLIC_OTP_BYPASS_CODE=123456

# v4.5.21+ — canonical production URL used by SEO metadata (sitemap, canonical
# links, Open Graph image URLs). Override when a custom domain ships.
# NEXT_PUBLIC_SITE_URL=https://vayil.in
```

| Variable                          | Required          | Description                                                       |
| --------------------------------- | ----------------- | ----------------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`             | yes               | Base URL of the backend API. Locally `http://localhost:9090`; on Vercel `/api` (same-origin) or leave unset so the axios client uses relative paths. |
| `NEXT_PUBLIC_USE_MOCK_DATA`       | no                | `true` → always serve dummy; `false` → live only (show error on failure); unset → smart default. |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID`     | yes (for payment) | Razorpay public key. Used only as a fallback — backend `getSettings` is the source of truth. |
| `NEXT_PUBLIC_APP_URL`             | yes               | `http://localhost:3000` locally; `https://vayil.in` in production. |
| `NEXT_PUBLIC_OTP_BYPASS`          | dev / demo only   | `true` → enables the amber dev banner on the LoginModal. Must flip together with backend's `OTP_BYPASS`. |
| `NEXT_PUBLIC_OTP_BYPASS_CODE`     | dev / demo only   | The fixed OTP that the bypass accepts (default `123456`).         |
| `NEXT_PUBLIC_SITE_URL`            | prod only         | Canonical site URL consumed by `src/lib/seo/site-config.ts`. Drives sitemap entries, canonical tags, OG image URLs. Falls back to `https://vayil-web.vercel.app` when unset. |

**Backend** (`backend/.env`, copy from `backend/.env.example`):

```bash
NODE_ENV=development
PORT=9090
CORS_ORIGIN=http://localhost:3000

# Local MySQL for development
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=password
DB_NAME=vayil
# v4.5.5+ — set DB_SSL=true for managed providers (TiDB Cloud, PlanetScale, RDS)
# DB_SSL=true

JWT_SECRET=<openssl rand -base64 32>
STAFF_JWT_SECRET=<openssl rand -base64 32>
JWT_EXPIRES_IN=30d

# v4.5.10+ — dev OTP bypass. Accept `OTP_BYPASS_CODE` (default 123456) as the
# OTP for any phone; skip the 2Factor SMS call entirely. Frontend's
# NEXT_PUBLIC_OTP_BYPASS must match.
OTP_BYPASS=true
OTP_BYPASS_CODE=123456

# v4.5.7+ — Live 2Factor SMS OTP (production). v4.5.9 accepts both name styles
# (TWO_FACTOR_API_KEY and OTPFactor_API_KEY) and both endpoint families
# (V1 default template, R1 DLT transactional).
TWO_FACTOR_API_KEY=
TWO_FACTOR_URL=https://2factor.in/API/R1/    # use /V1 for the default-template endpoint
TWO_FACTOR_SENDER_ID=VAYILO
TWO_FACTOR_TEMPLATE_NAME=OTP

# Razorpay
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
# v4.5.12+ — payment-verify signature bypass for demo / smoke tests. Skip the
# HMAC check on /payments/verify so demos don't need a live Razorpay session.
# v4.5.23+: this flag is hard-ANDed with !isProd in config.ts — even a stale
# PAYMENT_VERIFY_BYPASS=true on a production Vercel deploy cannot open the
# verification bypass at runtime.
PAYMENT_VERIFY_BYPASS=true

# v4.5.24+ — Production startup hardening. Default (unset/false): missing or
# weak production env vars log [config] WARNING but the app boots. When set
# to "true" on Vercel, the same checks THROW at startup, hard-failing the
# build so misconfigured env vars surface in the build log. Flip this on
# right before the public launch — never during the demo phase, because
# warnings are intentional with OTP_BYPASS=true / CORS_ORIGIN=*.
STRICT_PROD_CONFIG=false
```

> `.env` / `.env.local` are git-ignored. Never commit real secrets.

**Production env vars on Vercel** (TiDB Cloud Serverless example):

```bash
DB_HOST=gateway01.us-east-1.prod.aws.tidbcloud.com
DB_PORT=4000
DB_USER=<prefix>.root        # e.g. 24sp4BdEs5TWcce.root
DB_PASSWORD=<from TiDB Cloud Connect dialog>
DB_NAME=vayil
DB_SSL=true                  # TiDB requires TLS
```

Plus all `JWT_*`, `RAZORPAY_*`, `TWO_FACTOR_*`, `OTP_BYPASS*`, `PAYMENT_VERIFY_BYPASS` keys above. Vercel injects them at build time into the bundled serverless function.

### 4. Initialise the database

```bash
cd backend
mysql -u root -p -e "CREATE DATABASE vayil;"
npm run migrate              # runs 001 → 009 in lexical order (idempotent)
npm run seed                 # super-admin staff + 6 base categories
npm run seed:marketplace     # 40 vendors + 8 customers + demo activity
                             # (use seed:marketplace:vendors for prod —
                             #  no fake enquiries/orders)
```

The default super-admin is `admin@vayil.in / ChangeMe@123`. Rotate immediately after first login.

**Migration roster (v4.5.20+):**

| File | What it does |
|---|---|
| `001_complete_schema.sql` | Base schema — customers, vendors, services, enquiries, orders, quotation, payments. |
| `002_prd_workflow_tables.sql` | PRD workflow — order_plan, payment_intents, escrow_ledger, vendor_wallet, webhook_events. |
| `003_mobile_compatibility_tables.sql` | Mobile-shape tables — cart, customer_review (singular), order_plan_materials, etc. |
| `003_seed_tagging.sql` | Adds `seed_source` markers so test/demo rows are identifiable. |
| `004_align_mobile_schema.sql` | Adds `id` mirror columns to every PK-different table for cross-schema reads (MySQL). |
| `004_vendor_review_queue.sql` | Vendor-side review queue table. |
| `005_orders_enquiry_unique.sql` | `UNIQUE(enquiry_id)` on orders so the two-call payment flow can re-use orders idempotently. |
| `006_full_mobile_parity.sql` | Final column gaps from the mobile dump — payment_log legacy cols, notifications mobile shape, status_int + triggers (MySQL only — TiDB skips). |
| `007_seed_taxonomy.sql` | Seeds 10 categories, 24 sub-categories, 15 tags from the mobile dump. |
| `008_fix_subcategory_mapping.sql` | Re-keys 007's sub-categories by slug-based JOIN so the FK always points at the right LOCAL category. |
| `009_tidb_schema_align.sql` | **TiDB-compatible counterpart** to 004 + 006. Splits `ADD COLUMN ... UNIQUE` → `ADD COLUMN` + `CREATE UNIQUE INDEX`. Omits triggers (TiDB unsupported). No-op on MySQL where 004/006 already ran. |

The `migrate.ts` runner skips `CREATE TRIGGER` / `DROP TRIGGER` statements automatically on TiDB and tolerates TiDB's errno 8200 (unsupported feature). Per-file summary in the build log reads `N applied · M skipped · K TiDB-tolerated`.

### 5. Run both servers

In two terminals:

```bash
# Terminal 1 — backend
cd backend && npm run dev    # http://localhost:9090

# Terminal 2 — frontend
npm run dev                  # http://localhost:3000
```

Hot reload is on for both. Edits to `src/` reflect immediately; backend uses `tsx watch` so route changes reload automatically.

---

## Available scripts

### Frontend (`./`)

| Command            | What it does                                     |
| ------------------ | ------------------------------------------------ |
| `npm run dev`      | Start dev server with HMR on port 3000           |
| `npm run build`    | Production build (`.next/`)                      |
| `npm start`        | Serve the production build                       |
| `npm run lint`     | Run `next lint` (config: `.eslintrc.json`)       |
| `npx tsc --noEmit` | Type-check without emitting files                |

### Backend (`backend/`)

| Command                              | What it does                                                       |
| ------------------------------------ | ------------------------------------------------------------------ |
| `npm run dev`                        | tsx watch — reloads on save                                        |
| `npm run build`                      | `tsc` → `dist/`                                                    |
| `npm start`                          | `node dist/index.js` (production)                                  |
| `npm run migrate`                    | Runs every `migrations/*.sql` in order (idempotent)                |
| `npm run seed`                       | Super-admin staff + base categories                                |
| `npm run seed:marketplace`           | 40 vendors + 8 customers + 4 enquiries + 2 quotes + 1 in-progress order with 5 milestones — all tagged `seed_source='vayil-demo-v1'` |
| `npm run seed:marketplace:vendors`   | Same minus the demo activity (recommended for production launch)   |
| `npm run unseed:marketplace`         | Deletes every row tagged `vayil-demo-v1`                           |
| `npm run smoke`                      | Original wire-check against a running backend                      |
| `npm run smoke:web`                  | Canonical JSON path: `/auth/otp/{send,verify}` → `/customers/me` → `/customers/vendors` → `/customers/enquiries`. Exits 0 on full success. |
| `npm run smoke:mobile`               | **Full 14-stage cross-flow** (38 endpoints) — customer register → enquiry → quote accept → placeOrder → payment_update → orderDetails → vendor createPlan → updatePlanStatus → addPlanMaterial → editPlanMaterial → AskPyament → AddBankDetails → finalStep (escrow release) → vendorPayout → addReview → vendorlistReviews. Mirrors what Flutter's Dio sends; requires `PAYMENT_VERIFY_BYPASS=true` on the target backend (smoke only — never prod). |

### Migrations

| File | What it adds |
|---|---|
| `001_complete_schema.sql` | Base tables: `customers`, `vendors`, `enquiries`, `quotation`, `orders`, `order_plan`, `payment_log`, `vendor_wallet`, `vendor_transactions`, `disputes`, `staff`, `roles`, `settings`, `otp_codes`, `service_categories`/`_subcategories`/`_tags`, `vendor_services` |
| `002_prd_workflow_tables.sql` | PRD §10 workflow: `payment_intents`, `escrow_ledger`, `materials`, `plan_submissions`, `signoffs`, `rework_requests`, `milestone_updates`, `webhook_deliveries`, `idempotency_keys` + ALTER on `order_plan` and `enquiries` |
| `003_mobile_compatibility_tables.sql` | 5 mobile-parity tables (`customer_cart`, `customer_reviews`, `notifications`, `bank_details`, `payout_requests`) + ~30 metadata columns across `customers`, `vendors`, `vendor_services`, `enquiries`, `quotation` (profile_image, fcm_token, pincode, attachment_urls, location_lat/lng, budget, advance_amount, platform_fee, gst, total, onboarding_metadata, …) |
| `003_seed_tagging.sql` | `seed_source VARCHAR(40)` column on base tables for `unseed:marketplace` |
| `004_align_mobile_schema.sql` | **v4.5 mobile team alignment** — adds `id` mirror PK + mobile column set on every table; creates `cart`, `customer_review`, `order_plan_materials`, `order_step_logs`, `platform_transactions`, `admins`, `master_proof_types`, `status_master`, `tools_master`, `languages`, `states`, `city` |
| `004_vendor_review_queue.sql` | `vendor_review_queue` + admin notify columns |
| `005_orders_enquiry_unique.sql` | `UNIQUE KEY uniq_orders_enquiry (enquiry_id)` on `orders` |

The runner (`scripts/migrate.ts`) splits on `;\n`, runs every statement
in order, and swallows MySQL errno **1060** (duplicate column),
**1061** (duplicate key), **1091** (drop non-existent) so re-runs are
safe.

---

## Deploying

### All-Vercel (v4.5.6+ — the supported path)

Frontend and backend ship from one Vercel project. Express is bundled into a serverless function via `pages/api/[...all].ts`. Database is TiDB Cloud Serverless. No separate backend host.

| Component            | Where                                                                          |
|----------------------|--------------------------------------------------------------------------------|
| Frontend (Next.js 14)| Vercel auto-build from this repo's root                                        |
| Backend (Express 4)  | Same Vercel project, mounted at `/api/[...all]` via Pages Router catch-all     |
| Database             | TiDB Cloud Serverless (MySQL-wire compatible) — provisioned at https://tidbcloud.com |
| Build command        | `npm run vercel-build` → `cd backend && npx tsx scripts/migrate.ts \|\| true && cd .. && next build` |
| Razorpay webhook URL | `https://<vercel-deployment>/api/payments/webhooks/razorpay` (or `/payments/webhooks/razorpay` after v4.5.18 rewrites) |
| Production alias     | `vayil-web.vercel.app` (point custom domain `vayil.in` at this when ready)     |

**Step-by-step:**

1. **Connect the repo to Vercel** — Next.js is auto-detected at the root.
2. **Provision TiDB Cloud Serverless:**
   - Go to https://tidbcloud.com → create a **Serverless** cluster (free tier, MySQL-wire compatible).
   - In the cluster's Connect dialog, copy Endpoint / Port / User / generated Password.
   - In TiDB Chat2Query (or any MySQL client) run `CREATE DATABASE vayil;`.
3. **Set Vercel env vars** (Settings → Environment Variables — apply to Production + Preview + Development):
   - `DB_HOST` = TiDB endpoint (e.g. `gateway01.us-east-1.prod.aws.tidbcloud.com`)
   - `DB_PORT` = `4000`
   - `DB_USER` = TiDB user (e.g. `24sp4BdEs5TWcce.root`)
   - `DB_PASSWORD` = TiDB password
   - `DB_NAME` = `vayil`
   - `DB_SSL` = `true`
   - `JWT_SECRET`, `STAFF_JWT_SECRET` = `openssl rand -base64 32` outputs
   - `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` (test keys for demo, live keys for launch)
   - `TWO_FACTOR_API_KEY`, `TWO_FACTOR_URL`, `TWO_FACTOR_SENDER_ID`, `TWO_FACTOR_TEMPLATE_NAME` for live SMS OTP (skip when `OTP_BYPASS=true`)
   - `OTP_BYPASS=true`, `OTP_BYPASS_CODE=123456`, `NEXT_PUBLIC_OTP_BYPASS=true` for the demo phase
   - `PAYMENT_VERIFY_BYPASS=true` for the demo phase
   - `NEXT_PUBLIC_RAZORPAY_KEY_ID` = matches `RAZORPAY_KEY_ID`
   - `NEXT_PUBLIC_SITE_URL` = `https://vayil-web.vercel.app` (or final custom domain)
   - `STRICT_PROD_CONFIG` = leave **unset** during the demo (lenient mode). Set to `true` only right before the public launch — see "Pre-launch hardening" below.
4. **Trigger a deploy** — Vercel auto-runs `npm run vercel-build`. The migrate step applies all 9 migrations to TiDB. The build outputs the Next.js app + the serverless function.
5. **Verify:**
   ```bash
   curl https://<vercel-deployment>/api/health
   # → {"success":true,"status":"ok","service":"vayil-backend","timestamp":"..."}
   ```
6. **Promote** the new deployment to the production alias in Vercel Deployments → "…" → Promote to Production (Vercel sometimes pins the alias to a manually-deployed snapshot and auto-deploys don't promote — check after each push).

When live, set Razorpay's webhook URL in the Razorpay dashboard to `https://vayil-web.vercel.app/api/payments/webhooks/razorpay` and put the signing secret in `RAZORPAY_WEBHOOK_SECRET`.

**Custom domain:** when `vayil.in` is ready, point it at the Vercel project and update `NEXT_PUBLIC_SITE_URL` to match. The `x-robots-tag: noindex` header that Vercel auto-applies to deployment-style URLs disappears the moment you use a custom (or aliased) domain — Lighthouse SEO score jumps automatically.

### Pre-launch hardening (when flipping to `vayil.in` for real users)

This is the launch-day checklist that activates every v4.5.23 security knob. Run it in this order on Vercel → Settings → Environment Variables:

1. **`CORS_ORIGIN`** — set to an explicit allow-list, no wildcard:
   `https://vayil.in,https://admin.vayil.in,https://www.vayil.in`
2. **`JWT_SECRET`** and **`STAFF_JWT_SECRET`** — rotate to fresh 32+ char values:
   `openssl rand -base64 32`
3. **`DB_SSL=true`** — already set on TiDB; verify it's there.
4. **`RAZORPAY_KEY_ID`** / **`RAZORPAY_KEY_SECRET`** / **`RAZORPAY_WEBHOOK_SECRET`** — switch from `rzp_test_*` to live keys.
5. **`TWO_FACTOR_API_KEY`** — real live key from 2Factor's dashboard (with `TWO_FACTOR_SENDER_ID=VAYILO` and DLT-approved `TWO_FACTOR_TEMPLATE_NAME`).
6. **Flip the demo bypasses off:**
   - `OTP_BYPASS=false`
   - `NEXT_PUBLIC_OTP_BYPASS=false`
   - `PAYMENT_VERIFY_BYPASS=false`
7. **Finally, set `STRICT_PROD_CONFIG=true`** and trigger a redeploy. If any required env var is missing or weak, the Vercel build log will show a `[config] Refusing to start in production: <VAR> — <reason>` error and the deployment won't ship. Fix the env var and redeploy.

The full pre-launch checklist (with smoke-test commands, admin-password re-hashing script, and dependency-upgrade plan) lives in `docs/RELEASE_READINESS.md § Security audit follow-ups (v4.5.23)`.

### Render — backend (fallback, v4.5.5 and earlier)

Still works as a fallback if you need a non-serverless backend (long-running connections, file uploads larger than Vercel's 4.5 MB limit, etc.). Steps:

1. Push the repo to GitHub (already done — `Praga0405/vayil-web`).
2. Render → **New +** → **Blueprint** → select this repo. Render reads `render.yaml` and creates the `vayil-backend` service.
3. Provision MySQL (Render add-on or external — PlanetScale / RDS / DigitalOcean / TiDB Cloud). Copy host / port / user / password into the service env vars.
4. Set remaining secrets per `backend/.env.example`. `JWT_SECRET` and `STAFF_JWT_SECRET` are auto-generated by Render; supply `RAZORPAY_*` and (for production) `TWO_FACTOR_API_KEY`.
5. Open a Render shell on the deployed service and seed:
   ```bash
   npm run migrate
   npm run seed
   npm run seed:marketplace:vendors      # production
   ```
6. Verify: `curl https://<your-render-url>/health` returns `{ "status": "ok" }`.
7. On Vercel set `NEXT_PUBLIC_API_URL=https://<your-render-url>` so the frontend hits the Render backend instead of the same-origin serverless function.

`CORS_ORIGIN` must list every web origin (`https://vayil.in`, Vercel preview URLs, `http://localhost:3000`) or browsers will block requests.

---

## Project structure (frontend)

```
src/
├── app/                                  # Next.js App Router
│   ├── layout.tsx                        # v4.5.21 — full SEO metadata + viewport
│   │                                       exports, <main> landmark, skip-to-content
│   │                                       link, sitewide JSON-LD (Org + WebSite +
│   │                                       LocalBusiness)
│   ├── page.tsx                          # Public home page
│   ├── robots.ts                         # v4.5.21 — auto-served /robots.txt
│   ├── sitemap.ts                        # v4.5.21 — auto-served /sitemap.xml (52 URLs)
│   ├── manifest.ts                       # v4.5.21 — PWA manifest
│   ├── search/                           # Public vendor search
│   ├── vendors/[id]/                     # Public vendor profile + EnquiryModal
│   ├── bucket/                           # Multi-vendor enquiry bucket (localStorage)
│   ├── onboarding/profile/               # First-time customer profile completion
│   ├── account/                          # Customer (post-login)
│   │   ├── enquiries/, .../[id]/, .../[id]/pay/
│   │   ├── projects/, .../[id]/, .../[id]/plan/, .../[id]/materials/pay/
│   │   ├── notifications/, payments/, profile/
│   ├── vendor-studio/                    # Vendor (post-login) — modern design
│   │   ├── dashboard/, enquiries/, .../[id]/, .../[id]/quote/
│   │   ├── jobs/, .../[id]/, .../[id]/plan/, .../[id]/materials/, .../[id]/ask-payment/
│   │   ├── milestones/[id]/update/       # Post milestone progress + photos
│   │   ├── listing/, earnings/, setup/, payout/
│   │   ├── services/add/                 # v4.5.16+ — modern Add Service flow
│   │   └── services/[id]/                # v4.5.16+ — modern Edit Service flow
│   ├── vendor-onboarding/                # 6-step wizard
│   ├── customer/                         # Legacy customer portal — still mounted,
│   │                                       reachable by direct URL
│   └── vendor/                           # Legacy vendor portal — same
├── components/
│   ├── shared/                           # PublicHeader, PublicFooter,
│   │                                       AccountLayout, VendorStudioLayout,
│   │                                       LoginModal …
│   └── ui/                               # Button, Input, Modal, StatusBadge …
│                                         # (v4.5.19 — <Button full> is responsive)
├── hooks/
│   ├── useLiveVendor.ts                  # /search and vendor profile data + error state
│   └── useVendorStudio.ts                # enquiries, jobs, earnings hooks
├── lib/
│   ├── api/client.ts                     # Canonical REST surface + isolated legacy block
│   ├── adapters/
│   │   ├── vendor.ts                     # Backend row → DummyVendor shape
│   │   └── vendor-studio.ts              # Backend row → MockEnquiry/MockJob shapes
│   ├── dummyData.ts                      # 40-vendor catalogue (fallback / story mode)
│   ├── mockData.ts                       # Demo enquiries/jobs (story mode only)
│   ├── demoMode.ts                       # v4.5.10 — IS_DEMO_MODE, OTP_BYPASS_ON,
│   │                                       DEV_OTP_CODE, SHOW_DEV_OTP_BANNER
│   ├── seo/                              # v4.5.21 — SEO framework
│   │   ├── site-config.ts                # canonical URL, keywords, geo, social
│   │   └── jsonld.tsx                    # 7 schema.org JSON-LD components
│   └── utils.ts                          # formatCurrency, calculateFees, …
└── stores/
    └── auth.ts                           # Zustand auth (user, token, persist)

pages/
└── api/
    └── [...all].ts                       # v4.5.12 — Pages Router catch-all that
                                            imports backend/src/index.ts and forwards
                                            requests to Express. The reason the
                                            backend runs as a Vercel serverless
                                            function on the same project.

next.config.js                            # v4.5.18 — afterFiles rewrites forward
                                            bare /customer/*, /vendor/*, /Admin/* etc.
                                            to /api/* so the mobile Flutter app's
                                            existing base URL works unchanged.

backend/migrations/
└── 009_tidb_schema_align.sql             # v4.5.20 — TiDB-compatible counterpart to
                                            004 + 006 (split ADD COLUMN + INDEX,
                                            no triggers).

backend/scripts/migrate.ts                # v4.5.20 — hardened: skips triggers,
                                            tolerates TiDB errno 8200, strips block
                                            comments before splitting on `;\n`.
```

---

## Key conventions

- **Marketplace-first auth.** `LoginModal` never navigates internally — closes in place and the page they were on re-renders with their new auth state. Standalone `/customer/login` and `/vendor/login` redirect to `/` on success.
- **Role-aware UI.** `useUserAuth()` exposes `user.type` (`customer` | `vendor`). `PublicHeader` switches nav items, dropdown contents, and the "Vendor Studio" badge accordingly.
- **Shared header.** `PublicHeader` is rendered by `AccountLayout` and `VendorStudioLayout`. The home page (`/`) keeps its bespoke header to match the Figma hero.
- **Shared footer.** `PublicFooter` is rendered by every surface. The home page uses the full variant (`<PublicFooter />` — app-download band + addresses + brand strip); `AccountLayout` and `VendorStudioLayout` use `<PublicFooter compact />` (brand strip only — no marketing band inside the workspace). Sign-out is exclusively in the avatar dropdown of `PublicHeader`; page heroes never duplicate it.
- **REST-only API client.** New screens import from `customerApi` / `vendorApi` / `paymentsApi` / `authApi`. Legacy mobile aliases (`POST /vendorInfo`, etc.) remain inside each object under a clearly-labelled `LEGACY MOBILE ALIASES` block, isolated for the unmigrated `/customer/dashboard` pages and scheduled for deletion.
- **Adapters.** Backend response → existing UI-friendly type (`DummyVendor`, `MockJob`, `MockEnquiry`). Lets the rich JSX stay untouched while the data source migrates.
- **Fallback policy.**
  - `NEXT_PUBLIC_USE_MOCK_DATA=true` → always serve dummy data (story / offline demos).
  - `NEXT_PUBLIC_USE_MOCK_DATA=false` → live only; on failure, surface a real error with a Retry CTA.
  - Default (unset) → smart: mocks when no `NEXT_PUBLIC_API_URL` is configured, live otherwise.
- **Idempotency.** Every state-mutating customer POST (enquiries, payments, materials orders) sends an `Idempotency-Key` header. The frontend generates a fresh UUID per intent and the backend caches the response.

---

## Auth + sign-up (3-stage modal)

`LoginModal` now drives a three-stage flow inside the same shell — no
separate sign-up page:

1. **phone** — 10-digit input + Customer / Vendor tabs
2. **otp** — 6-digit input with 30 s resend timer + change-number link
3. **signup** — only shown for first-time mobiles
   - Customer: name (req), email, city
   - Vendor: company (req), owner (req), email, city → on submit the
     vendor is dropped into the admin review queue via
     `POST /vendor/submit-for-review` and routed to `/vendor-onboarding`
     to complete KYC + service tags

**Dev mode** (`NEXT_PUBLIC_USE_MOCK_DATA=true` or `NEXT_PUBLIC_API_URL`
unset): OTP bypassed at `123456`, known mobiles tracked in
`localStorage` (`vayil_known_mobiles`) so returning users skip signup.

**Live mode**: `authApi.sendOTP` → `verifyOTP` round-trips to the
backend; on first verify the user row is created automatically (no
separate registration call). If the returned user has no `name`,
signup step surfaces and calls `customerApi.saveProfile` or
`vendorApi.saveProfile`.

For backend dev without an SMS provider, set `OTP_BYPASS=true` +
`OTP_BYPASS_CODE=123456` and `/auth/otp/verify` will accept `123456`
for any phone.

---

## Canonical API surface

Production screens import from these five objects only:

| Object | Mounted at | Purpose |
|---|---|---|
| `authApi` | `/auth` | OTP send/verify, staff login |
| `customerApi` | `/customer` | Vendor browse, enquiries, quotes, projects, plan approve/revision, materials list + payment-order, signoff, rework |
| `vendorApi` | `/vendor` | Dashboard, enquiries (accept/reject/quote), projects, plan CRUD/submit, materials CRUD, milestone updates/complete/payment-request, KYC, submit-for-review |
| `paymentsApi` | `/payments` | `createOrder`, `verify` (idempotent, HMAC-checked, escrow-ledger-aware) |
| `commonApi` | `/` | Categories, subcategories, geo, settings, health |

A separate **`/Admin/*`** surface (staff JWT) matches the
`Praga0405/Vayil-Admin-Panel-main` repo's request shapes verbatim so
that app can connect without code changes:
`GetVendorList`, `VendorDetails`, `VendorKycUpdate`, `VendorStatusUpdate`,
`VendorDelete`, `saveVendor`, `GetReviewQueue`.

Legacy mobile aliases (`POST /vendorInfo`, `POST /ServiceList`, etc.)
are isolated inside `customerApi` / `vendorApi` under labelled
"LEGACY MOBILE ALIASES" blocks for the unmigrated `/customer/dashboard`
pages — scheduled for deletion once consumers are migrated.

---

## Demo mode (offline + mock)

The `IS_DEMO_MODE` constant (`src/lib/demoMode.ts`) is true when:
- `NEXT_PUBLIC_USE_MOCK_DATA=true`, **or**
- `NEXT_PUBLIC_API_URL` is unset and `USE_MOCK_DATA` is not explicitly
  `false`.

When on, **both reads and writes short-circuit**: hooks serve dummy
data and mutations resolve after a 400 ms simulated delay without
hitting the backend (Razorpay payment screens also skip checkout
entirely with a "demo" success toast). The full happy path — sign up,
send enquiry, accept quote, pay, approve plan, pay materials, sign
off — is exercisable end-to-end without any backend.

When off, the app is strict: failed reads surface inline error banners
with a Retry CTA, failed mutations show real error messages — no silent
fallback (PRD audit P0).

---

## Admin panel integration

The standalone admin SPA (`Praga0405/Vayil-Admin-Panel-main`) hits
`/Admin/*` against the same backend host. When a new vendor signs up
via the web (LoginModal vendor step or the `/vendor-onboarding` KYC
step) the backend:

1. Flips `vendors.status` to `kyc_submitted`
2. Upserts a row into `vendor_review_queue` (status PENDING)
3. Optionally POSTs a notification to `ADMIN_PORTAL_NOTIFY_URL` with
   `Authorization: Bearer ADMIN_PORTAL_NOTIFY_TOKEN`. The payload:

   ```json
   {
     "event": "vendor.submitted_for_review",
     "queue_id": 42,
     "vendor": { "id": ..., "company_name": ..., "phone": ..., "submitted_at": "..." }
   }
   ```

Both env vars are optional. When unset the notification is skipped
(the queue row is still written so the admin panel can pick it up via
`POST /Admin/GetReviewQueue`).

---

## Troubleshooting

- **Port 3000 in use** → `PORT=3001 npm run dev` or kill the existing process.
- **`Module not found` after pulling** → re-run `npm install` (and `cd backend && npm install` if you changed backend deps).
- **Type errors after edits** → `npx tsc --noEmit` at each level; both halves must be clean before `npm run build`.
- **Razorpay popup doesn't open** → check the page's network tab for `checkout.razorpay.com/v1/checkout.js`, confirm `NEXT_PUBLIC_RAZORPAY_KEY_ID` or backend `getSettings.razorpay_key` returns a value.
- **API calls hang / 30 s timeout** → backend not reachable. Either set `NEXT_PUBLIC_USE_MOCK_DATA=true` for offline dev or start the backend on `:9090`.
- **API calls 401 / redirected to `/customer/login`** → JWT expired or missing; the axios interceptor redirects automatically.
- **CORS errors** → backend `CORS_ORIGIN` must list every web origin (comma-separated).
- **Webhook signature failures** → `RAZORPAY_WEBHOOK_SECRET` must match the secret you set in the Razorpay dashboard's webhook config (separate from the API key secret).

---

## Documentation index

- [`RELEASE_NOTES.md`](./RELEASE_NOTES.md) — versioned changelog (this file is the user-facing source of truth; v4.5.21 is the latest)
- [`RELEASE_READINESS.md`](./RELEASE_READINESS.md) — pre-launch checklist (deploy, backups, observability, post-launch hardening, OTP/payment bypass flag flips)
- [`backend/README.md`](./backend/README.md) — backend-specific deploy walkthrough (Render fallback, MySQL, seed/unseed)
- [`docs/API_CANONICAL.md`](./docs/API_CANONICAL.md) — REST surface the web app + admin panel target
- [`docs/API_MOBILE_LEGACY.md`](./docs/API_MOBILE_LEGACY.md) — `/customer/*` + `/vendor/*` shim contract for the Flutter apps
- [`docs/PAYMENT_FLOW.md`](./docs/PAYMENT_FLOW.md) — escrow lifecycle, two-call Razorpay protocol, idempotency, env vars
- [`docs/DB_SCHEMA.md`](./docs/DB_SCHEMA.md) — per-table column reference + migration order
- [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) — Render + Vercel + Razorpay webhook + S3/R2/GCS upload setup + prod checklist
- [`docs/mobile-api-inventory.md`](./docs/mobile-api-inventory.md) — Flutter app endpoint inventory + payload shapes (audit doc)

### SEO + structured data (v4.5.21+)

The SEO framework is configured centrally in `src/lib/seo/`:

- **`site-config.ts`** — single source of truth for canonical URL, tagline, keywords, geo coordinates, theme colour, and social handles. Change here ONCE; sitemap, robots.txt, manifest, canonical tags, Open Graph URLs, and JSON-LD all pick it up.
- **`jsonld.tsx`** — 7 schema.org JSON-LD components ready to drop on pages:
  - `<OrganizationJsonLd />` — brand identity (used sitewide in `layout.tsx`)
  - `<WebSiteJsonLd />` — with `SearchAction` for Google's SERP sitelinks search box (sitewide)
  - `<LocalBusinessJsonLd />` — local-pack ranking (sitewide)
  - `<BreadcrumbJsonLd items={[…]} />` — drop on pages with crumbs
  - `<ServiceJsonLd name slug description />` — drop on service-category landing pages
  - `<VendorProfileJsonLd id name rating reviewCount services />` — drop on vendor profile pages
  - `<FaqJsonLd items={[{question, answer}]} />` — drop on any Q&A section

To add per-page metadata + JSON-LD to a new page:

```tsx
// e.g. src/app/services/electrical/page.tsx
import type { Metadata } from 'next'
import { ServiceJsonLd, BreadcrumbJsonLd } from '@/lib/seo/jsonld'
import { absoluteUrl } from '@/lib/seo/site-config'

export const metadata: Metadata = {
  title: 'Electrician services in Coimbatore',
  description: 'Hire verified electricians for wiring, switches, MCB installation…',
  alternates: { canonical: '/services/electrical' },
  openGraph: { url: absoluteUrl('/services/electrical') },
}

export default function ElectricalServicesPage() {
  return (
    <>
      <ServiceJsonLd
        name="Electrician services in Coimbatore"
        slug="electrical"
        description="Verified electricians for wiring, switches, MCB…"
      />
      <BreadcrumbJsonLd items={[
        { name: 'Home', href: '/' },
        { name: 'Services', href: '/services' },
        { name: 'Electrical', href: '/services/electrical' },
      ]} />
      {/* page content */}
    </>
  )
}
```

Validate every page that ships JSON-LD with https://search.google.com/test/rich-results.

### Pre-seeded production demo accounts

For leadership demos the production TiDB has four canonical accounts seeded:

| Role | Phone | OTP | Notes |
|---|---|---|---|
| Vendor | `7799036172` | `123456` | Demo Vendor — Electrical (vendor_id 120001). Has 2 active jobs with milestone plans + escrow holds. |
| Vendor | `7799036173` | `123456` | Demo Vendor — Plumbing (vendor_id 120002) |
| Customer | `9876543210` | `123456` | Demo Customer (customer_id 1) |
| Customer | `9876543211` | `123456` | Demo Customer 2 (customer_id 90001) |

To use: open `https://vayil-web.vercel.app` in incognito, click Sign In, pick role tab, enter phone, enter `123456`.

### Schema alignment with the mobile team (v4.5+)

The backend serves both the web portal **and** the mobile team's
Flutter apps off the same MySQL. Both schemas coexist in the same
tables:

- Every table has both legacy and mobile primary-key columns (e.g.
  `customers.customer_id` AND `customers.id` point at the same row).
- Mobile-only tables (`cart`, `customer_review` singular,
  `order_plan_materials`, `order_step_logs`, `platform_transactions`,
  `admins`, `master_proof_types`, `status_master`, `tools_master`,
  `languages`, `states`, `city`) are created by migration 004.
- The service layer dual-writes for the high-traffic cross-client
  flows (cart, reviews, materials, signoff → vendor_transactions +
  platform_transactions).
- Web adapters (`src/lib/adapters/vendor.ts`, `vendor-studio.ts`)
  read either column name transparently, so the web JSX needs no
  changes.
- A re-runnable backfill script (`backend/scripts/backfill-mobile-schema.ts
  [--dry-run] [--verbose]`) copies historical rows from the legacy
  tables into the mobile mirrors.

The mobile team's 50-endpoint admin surface (`/Admin/loginAdmin`,
`/Admin/Dashboard`, city/state/category/tag/proof CRUD, customer
mgmt, payment history) is mounted from `backend/src/routes/adminMobile.ts`
alongside the existing `/Admin/GetVendorList` family.

**Verified end-to-end** (v4.5.1, 2026-05-27): all 47 admin endpoints
pass + schema mirrors at 100% row parity (8/8 review pair, 13/13
material pair, 358/358 rows have `id` column populated across the 7
mirrored tables). See `RELEASE_NOTES.md` for the hotfix details.
