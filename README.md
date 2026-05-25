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
├── docs/                    ← Internal contracts + audits
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
┌────────────────────┐        HTTPS         ┌─────────────────────────┐
│   Next.js (web)    │ ───────────────────▶ │  Express (backend)      │
│   on Vercel        │  /auth  /customer    │  on Render              │
│                    │  /vendor /payments   │                         │
│   src/lib/api      │  /Admin  /ops        │  src/routes/*           │
│   src/hooks/*      │  Bearer JWT          │  middleware/auth        │
│   adapters/*       │  Idempotency-Key     │  middleware/idempotency │
└────────────────────┘                      └────────┬────────────────┘
        │                                            │
        │ Razorpay Checkout SDK                      │ Razorpay server SDK
        ▼                                            ▼              ┌──────────────────────┐
   checkout.razorpay.com                       MySQL (add-on)       │ Vayil Admin Panel    │
                                                     │              │ (React, Vite)        │
                                                     ▼              │ Praga0405/Vayil-     │
                                          payment_intents,          │ Admin-Panel-main     │
                                          escrow_ledger,            └──────────┬───────────┘
                                          materials, order_plan,               │
                                          vendor_review_queue,                 │ POST /Admin/*
                                          signoffs, rework_requests …          ▼
                                                                       (staff JWT, REST)
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
# Backend API base URL — point at local backend for full-stack dev
NEXT_PUBLIC_API_URL=http://localhost:9090

# When the backend isn't running, force the dummy-data fallback so /search etc. still works
# NEXT_PUBLIC_USE_MOCK_DATA=true

# Razorpay public key (use rzp_test_* for staging)
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_placeholder

# This app's own URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

| Variable                          | Required          | Description                                                       |
| --------------------------------- | ----------------- | ----------------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`             | yes               | Base URL of the backend API. When unset and `USE_MOCK_DATA` is not `false`, hooks serve dummy data. |
| `NEXT_PUBLIC_USE_MOCK_DATA`       | no                | `true` → always serve dummy; `false` → live only (show error on failure); unset → smart default. |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID`     | yes (for payment) | Razorpay public key. Used only as a fallback — backend `getSettings` is the source of truth. |
| `NEXT_PUBLIC_APP_URL`             | yes               | `http://localhost:3000` locally; `https://vayil.in` in production. |

**Backend** (`backend/.env`, copy from `backend/.env.example`):

```bash
NODE_ENV=development
PORT=9090
CORS_ORIGIN=http://localhost:3000

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=password
DB_NAME=vayil

JWT_SECRET=<openssl rand -base64 32>
STAFF_JWT_SECRET=<openssl rand -base64 32>
JWT_EXPIRES_IN=30d

# For dev — accept 123456 as the OTP for any phone
OTP_BYPASS=true
OTP_BYPASS_CODE=123456

# Live OTP (production)
TWO_FACTOR_API_KEY=

# Razorpay
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
```

> `.env` / `.env.local` are git-ignored. Never commit real secrets.

### 4. Initialise the database

```bash
cd backend
mysql -u root -p -e "CREATE DATABASE vayil;"
npm run migrate              # runs 001, 002, 003 — idempotent
npm run seed                 # super-admin staff + 6 base categories
npm run seed:marketplace     # 40 vendors + 8 customers + demo activity
                             # (use seed:marketplace:vendors for prod —
                             #  no fake enquiries/orders)
```

The default super-admin is `admin@vayil.in / ChangeMe@123`. Rotate immediately after first login.

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
| `npm run smoke`                      | Hits a handful of endpoints to confirm wiring                      |

---

## Deploying

| Service          | Source                                | Build               | Start             |
| ---------------- | ------------------------------------- | ------------------- | ----------------- |
| **Vercel** (web) | repo root                             | `npm run build`     | `npm start`       |
| **Render** (backend) | `backend/` via `render.yaml` Blueprint | Docker (multi-stage) | `node dist/index.js` |

### Render — backend in 6 steps

1. Push the repo to GitHub (already done — `Praga0405/vayil-web`).
2. Render → **New +** → **Blueprint** → select this repo. Render reads `render.yaml` and creates the `vayil-backend` service.
3. Provision **MySQL** (Render add-on or external — PlanetScale / RDS / DigitalOcean). Copy host / port / user / password into the service env vars.
4. Set remaining secrets per `backend/.env.example`. `JWT_SECRET` and `STAFF_JWT_SECRET` are auto-generated by Render; supply `RAZORPAY_*` and (for production) `TWO_FACTOR_API_KEY`.
5. Open a Render shell on the deployed service and seed:
   ```bash
   npm run migrate
   npm run seed
   npm run seed:marketplace:vendors      # production
   ```
6. Verify: `curl https://<your-render-url>/health` returns `{ "status": "ok" }`.

`CORS_ORIGIN` must list every web origin (`https://vayil.in`, Vercel preview URLs, `http://localhost:3000`) or browsers will block requests.

### Vercel — frontend

1. Connect the repo to Vercel — Next.js is auto-detected at the root.
2. Set `NEXT_PUBLIC_API_URL` to the Render URL and `NEXT_PUBLIC_RAZORPAY_KEY_ID` to the Razorpay public key.
3. Deploy. The `.vercelignore` keeps `backend/` out of the build context.

When both halves are live, set Razorpay's webhook URL to `https://<render-url>/payments/webhooks/razorpay` in the Razorpay dashboard and copy the signing secret into `RAZORPAY_WEBHOOK_SECRET`.

---

## Project structure (frontend)

```
src/
├── app/                                  # Next.js App Router
│   ├── page.tsx                          # Public home page (left untouched per audit)
│   ├── search/                           # Public vendor search
│   ├── vendors/[id]/                     # Public vendor profile + EnquiryModal
│   ├── bucket/                           # Multi-vendor enquiry bucket (localStorage)
│   ├── onboarding/profile/               # First-time customer profile completion
│   ├── account/                          # Customer (post-login)
│   │   ├── enquiries/, .../[id]/, .../[id]/pay/
│   │   ├── projects/, .../[id]/, .../[id]/plan/, .../[id]/materials/pay/
│   │   ├── notifications/, payments/, profile/
│   ├── vendor-studio/                    # Vendor (post-login)
│   │   ├── dashboard/, enquiries/, .../[id]/, .../[id]/quote/
│   │   ├── jobs/, .../[id]/, .../[id]/plan/, .../[id]/materials/, .../[id]/ask-payment/
│   │   ├── milestones/[id]/update/       # Post milestone progress + photos
│   │   ├── listing/, earnings/, setup/, payout/
│   ├── vendor-onboarding/                # 6-step wizard
│   ├── customer/                         # Legacy customer portal — now redirects
│   └── vendor/                           # Legacy vendor portal — now redirects
├── components/
│   ├── shared/                           # PublicHeader, PublicFooter,
│   │                                       AccountLayout, VendorStudioLayout,
│   │                                       LoginModal …
│   └── ui/                               # Button, Input, Modal, StatusBadge …
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
│   └── utils.ts                          # formatCurrency, calculateFees, …
└── stores/
    └── auth.ts                           # Zustand auth (user, token, persist)
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

- [`RELEASE_NOTES.md`](./RELEASE_NOTES.md) — versioned changelog (this file is the user-facing source of truth)
- [`RELEASE_READINESS.md`](./RELEASE_READINESS.md) — pre-launch checklist (deploy, backups, observability, post-launch hardening)
- [`backend/README.md`](./backend/README.md) — backend-specific deploy walkthrough (Render, MySQL, seed/unseed)
