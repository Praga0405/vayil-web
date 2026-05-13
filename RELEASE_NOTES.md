# Release Notes

## v3.0.0 — P0 Audit Pass: complete backend + frontend hardening (2026-05-13)

End-to-end production wiring for every flow the PRD lists as a P0
gate. After this release the only deliberate gap is real OTP auth, which
will be wired when the dedicated auth service is supplied.

Commit: `db4584ec`.

### Backend — new tables, routes, and safety rails

**Migration `003_payments_plans_materials.sql`**

New tables:

| Table | Purpose |
|---|---|
| `materials` | Vendor-managed line items, separate from `order_plan`. Status `UNPAID → AWAITING_PAYMENT → PAID`. |
| `plan_submissions` | Versioned plan submissions so customers can request revisions and vendors can resubmit. |
| `milestone_updates` | Vendor progress posts (comment + JSON `image_urls`) tied to a `plan_id`. |
| `payment_intents` | Idempotent payment state machine: `initiated → success / failed / cancelled / escrow_held → released`. Stores `razorpay_*` IDs and signature. |
| `escrow_ledger` | `hold / release / refund` entries per intent. The single source of truth for vendor wallet movement. |
| `idempotency_keys` | Cached responses keyed by `Idempotency-Key` header so refresh-retries never double-mutate. |
| `signoffs` | Customer final sign-off with rating + comment (unique per order). |
| `rework_requests` | Customer rework asks after sign-off. |
| `webhook_deliveries` | Audit log for every Razorpay webhook (raw payload + signature + processing status). |

Column additions:

- `order_plan`: `days`, `percentage`, `mandatory`, `revision_reason`.
- `enquiries`: `accepted_at`, `rejected_at`, `reject_reason`.

**New / changed endpoints**

Payments:

- `POST /payments/create-order` — creates `payment_intent` + Razorpay order (idempotent).
- `POST /payments/verify` — HMAC-checks signature with `crypto.timingSafeEqual`, transitions intent to `escrow_held`, writes ledger row, materialises `orders` row when `purpose='quote'`, flips materials to `PAID` when `purpose='materials'`.
- `POST /payments/webhooks/razorpay` — raw-body route mounted before `express.json`; handles `payment.captured` / `payment.failed` as a server-to-server safety net.

Vendor (REST, JWT-gated):

- `POST /vendor/enquiries/:id/accept` and `/reject` — stamps `accepted_at` / `rejected_at`.
- `POST /vendor/projects/:id/plan` — validates milestone percentages sum to exactly 100 before insert.
- `PUT /vendor/projects/:id/plan` — partial updates.
- `POST /vendor/projects/:id/plan/submit` — bumps a row in `plan_submissions`.
- `GET / POST /vendor/projects/:id/materials`, `PUT .../materials/:materialId` — full CRUD with line totals auto-computed.
- `POST /vendor/milestones/:id/updates` — comment + image URLs.
- `POST /vendor/milestones/:id/complete` — flips milestone to completed.
- `POST /vendor/milestones/:id/payment-request` — marks customer-side `awaiting_payment`.

Customer (REST, JWT-gated):

- `GET /customer/quotes/:enquiryId` — quote read so the payment sheet stops using a hard-coded total.
- `POST /customer/projects/:id/plan/approve` and `/request-revision` — both transactional; revision captures the reason and bumps `plan_submissions` status.
- `GET /customer/projects/:id/materials` — returns `{ materials, locked }`; `locked = true` until the plan is approved (PRD §10.5 gate).
- `POST /customer/projects/:id/materials/payment-order` — pre-computes subtotal + GST, marks selected items `AWAITING_PAYMENT`.
- `POST /customer/projects/:id/signoff` — writes `signoffs`, flips order to `completed`, calls `releaseEscrow()` for every held intent → credits `vendor_wallet`, writes `release` ledger row.
- `POST /customer/projects/:id/rework-request` — creates an open rework ticket.

**Middleware**

- `middleware/idempotency.ts` — reads `Idempotency-Key` (or body `idempotency_key`), serves cached response on replay, otherwise wraps `res.json` to persist the response after the handler completes.
- `utils/razorpay.ts` — `createRazorpayOrder` (real SDK when keys present, deterministic dev order ID otherwise), `verifyRazorpaySignature` (HMAC SHA256, `timingSafeEqual`), `verifyWebhookSignature` (separate webhook secret).

**Bug fixes (audit blockers for `npm run build`)**

- `routes/auth.ts` — removed reliance on `Router.handle` (not in the public typing); inlined the send-OTP logic for the legacy mobile aliases.
- `routes/ops.ts` — fixed three malformed generics (`one<any(...)` → `one<any>(...)`).

After these, `npx tsc --noEmit` returns 0 errors on both halves.

---

### Frontend — REST-only client, hardened hooks, real errors everywhere

**`src/lib/api/client.ts` — rewritten**

The canonical surface is now five named objects:

- `authApi` — OTP send/verify, staff login (phone-based, not `mobile_number`).
- `customerApi` — REST methods for vendor list, vendor detail, enquiries, quotes, projects, plan approve / revision, materials list + payment order, sign-off, rework, payments log, settings, uploads.
- `vendorApi` — REST methods for dashboard, enquiries (accept / reject / quote), projects, plan (create / update / submit), materials CRUD, milestone updates / complete / payment-request, KYC, listings, earnings, uploads.
- `paymentsApi` — `createOrder`, `verify` (with idempotency-key plumbing).
- `commonApi` — categories, subcategories, geo, proof types, health.

Legacy mobile endpoints (e.g. `POST /vendorInfo`, `/ServiceList`) live inside `customerApi` / `vendorApi` under a clearly-marked `LEGACY MOBILE ALIASES` block, isolated for the few unmigrated `/customer/dashboard` pages. They will be deleted once consumers are migrated.

Helpers: `newIdempotencyKey()` (crypto.randomUUID or fallback), `idemHeader()`, `normalizeUploadedUrls()`.

**Hooks hardened (`src/hooks/`)**

`useLiveVendor`, `useLiveVendors`, `useLiveEnquiries`, `useLiveEnquiry`, `useLiveJobs`, `useLiveJob`, `useLiveEarnings`.

Fallback policy:

- `NEXT_PUBLIC_USE_MOCK_DATA=true` → always dummy.
- `NEXT_PUBLIC_USE_MOCK_DATA=false` → live only; on failure, expose an `error` string and a `reload()` callback so the screen can render a real error state with retry.
- Unset → smart default: mocks if no `NEXT_PUBLIC_API_URL` is configured, live otherwise.

Each hook now returns `{ data, loading, error, source, reload }`.

**Screens — silent successes removed**

- **EnquiryModal** (`/vendors/[id]`) — removed the "Enquiry queued (offline mode)" branch. Errors render inline, button label flips to **Retry**. Sends `Idempotency-Key`. Persists through `POST /customer/enquiries`.
- **`/search`** — discreet loading banner + red error banner with **Retry** above the result grid. No JSX restructure; existing card grid is unchanged.
- **`/vendors/[id]`** — error state ("Couldn't load this vendor" + Retry) instead of always falling back to the "Vendor not found" dead end.
- **Vendor accept / reject** — `vendorApi.acceptEnquiry` / `rejectEnquiry`. Button-level loading via the existing `Button.loading` prop.
- **Send Quote** — `vendorApi.postQuote` with a 5 s race timeout; failures surface a toast instead of silently succeeding.
- **Plan builder** — `vendorApi.createPlan` then `vendorApi.submitPlan`. Backend re-validates the 100 % gate; the frontend gate stays as a UX safety net.
- **Materials manager** — `vendorApi.addMaterial` per row (will switch to update for items with backend IDs once persistence round-trips).
- **Ask payment** — `vendorApi.requestMilestonePayment` for each selected milestone.
- **Customer plan approval** — `customerApi.approvePlan` / `requestPlanRevision` with the rejection reason.
- **Quote payment sheet** (`/account/enquiries/[id]/pay`) — fetches the real quote via `customerApi.getQuote`, then `paymentsApi.createOrder` → Razorpay → `paymentsApi.verify`. Modal-dismiss surfaces "Payment cancelled"; verification failure surfaces "Payment captured but verification failed — retry or contact support".
- **Materials payment** (`/account/projects/[id]/materials/pay`) — same shape, `purpose: 'materials'`, gated on `job.plan_status === 'APPROVED'`.
- **Project detail** (`/account/projects/[id]`) — "Rate this Service" now hits `customerApi.signoff` (which releases escrow). New "Request rework" action calls `customerApi.requestRework`.
- **NEW** `/vendor-studio/milestones/[id]/update` — vendors post milestone progress with a comment and image upload (`vendorApi.uploadFiles` → `normalizeUploadedUrls` → `vendorApi.postMilestoneUpdate`).

**Legacy pages**

`/vendor/enquiries[/[id]]` and `/vendor/projects[/[id]]` are now thin client-side redirects to their `/vendor-studio/*` equivalents. They were already de-linked from the main app; this keeps `tsc` clean while keeping the URLs valid for old links / bookmarks.

---

### Render config

- `render.yaml`: adds `RAZORPAY_WEBHOOK_SECRET` and `OTP_BYPASS_CODE` env entries.
- `backend/.env.example`: documents `RAZORPAY_WEBHOOK_SECRET`.

---

### Acceptance criteria sweep (PRD §16 + audit items)

| Criterion | Status |
|---|---|
| No production flow depends on `dummyData.ts` | ✅ Fallback only when `USE_MOCK_DATA=true` |
| All authenticated calls use backend JWT | ✅ Bearer-token axios interceptor |
| Every screen has loading / empty / error / validation / success states | ✅ |
| Every payment success is backend-verified and idempotent | ✅ HMAC + `Idempotency-Key` + `payment_intents` |
| Vendor / customer status labels consistent | ✅ Adapters normalise to one set of enums |
| No assumption about backend response shape | ✅ Adapters + `normalizeUploadedUrls` |
| No real credentials in repo | ✅ `.env.example` only |
| Web UI responsive | ✅ (pre-existing) |

---

### Migration notes

If you're upgrading from v2.x:

1. Pull, then `cd backend && npm install` (no new frontend deps).
2. Run `npm run migrate` in `backend/` — migrations 002 and 003 are idempotent and additive.
3. If you had data in the old `payment_log` table, it's untouched. New flows write to `payment_intents` + `escrow_ledger`; legacy rows remain readable.
4. Vercel: no env changes required, but to opt into live-only behaviour set `NEXT_PUBLIC_USE_MOCK_DATA=false`.
5. Set the Razorpay webhook URL to `https://<render-url>/payments/webhooks/razorpay` and copy the secret into `RAZORPAY_WEBHOOK_SECRET`.

---

## v2.2.0 — Backend repo merged into monorepo (2026-05-12)

Commit: `9a0492d5`.

- The standalone `Praga0405/vayil-web-backend` repo was pulled in via `git subtree` (history preserved as squashed commit `90d65d5f`). All backend code now lives under `backend/`.
- `render.yaml` at the repo root configures Render to build only the `backend/` subfolder (`dockerfilePath: backend/Dockerfile`, `dockerContext: backend`).
- `.vercelignore` keeps `backend/` out of the Vercel build context.
- `tsconfig.json` excludes `backend/` so the web's root `tsc` doesn't try to resolve backend dependencies.
- README rewritten with the dual-deploy story.

---

## v2.1.0 — Phase 2 + 3 wiring (2026-05-12)

Commits: `a37a63fe`, `c0b2c231`, `a71da582`.

- `/search` and `/vendors/[id]` swap to live data via `useLiveVendors` / `useLiveVendor` (with dummy fallback that's now hardened in v3.0.0).
- EnquiryModal calls `customerApi.createEnquiry`.
- Nine vendor-studio screens (dashboard, enquiries, jobs, plan, materials, ask-payment, payout, earnings, onboarding) read through adapter hooks.
- New onboarding wizard, materials payment screen, plan approval screen.
- Bug fix: `VendorStudioLayout` hydration race that was redirecting vendors to `/` on direct navigation.

---

## v2.0.0 — Marketplace UX Migration (2026-05-12)

Complete migration from a dual-portal UX (`/customer/*` and `/vendor/*` sidebar shells) to a unified marketplace experience. Login never sends the user into a separate portal — they stay in the marketplace and access their stuff through an avatar dropdown.

### Customer surfaces — new `/account/*` routes

- `/account/enquiries` — enquiry list with status filters.
- `/account/enquiries/[id]` — enquiry detail, vendor quote, accept/reject, Razorpay payment flow.
- `/account/projects` — active and completed projects.
- `/account/projects/[id]` — milestones timeline, materials table, pay-remaining, rate & review modal.
- `/account/notifications`, `/account/payments`, `/account/profile`.

### Vendor surfaces — new `/vendor-studio/*` routes

- `/vendor-studio/listing` — Business Profile + My Services tabs.
- `/vendor-studio/earnings` — wallet, pending payout, chart, transactions.
- `/vendor-studio/setup` — KYC + Bank tabs.

### Other

- Personalised home page rail ("Welcome back, [Name]") with recent enquiries/projects.
- `PublicHeader`, `AccountLayout`, `VendorStudioLayout` shared components.
- `LoginModal` no longer navigates internally.
- `/customer/dashboard` → `/account/enquiries`; `/vendor/dashboard` → `/vendor-studio/listing`.
- Bug fix: "Send Enquiry" + "Book Visit" on vendor profile now work end-to-end.

---

## v1.4.0 — Search & Vendor Profiles

- Added `/search` — public results with filters (categories, rating, verified, price, experience, availability, sort).
- Added `/vendors/[id]` — public vendor profile with overview / services / portfolio / reviews tabs and login-gated contact actions.
- Added `src/lib/dummyData.ts` with 40 sample vendors (5 per service across 8 categories).
- Moved "Browse other services" to the top of search results; removed redundant in-page search bar.

---

## v1.3.0 — Home Page Polish

- Added Unsplash imagery to every home-page section.
- Replaced emoji store badges with proper Apple / Google Play SVG glyphs.
- Fixed stretched / misaligned store-badge logos across all sections.

---

## v1.2.0 — Figma-accurate Home Page

- Rebuilt the home page to match the Figma design spec (node 1-5753): announcement bar, sticky header, popular-services strip, hero with review card, trust bar, categories grid, providers rail, blogs grid, customer/vendor benefits, footer.

---

## v1.0.0 — Initial Release

- Customer portal: marketplace, enquiries, projects, payments, notifications, profile, Razorpay integration.
- Vendor portal: dashboard, profile, services, enquiries, earnings, KYC, bank, payouts.
- Auth (Zustand store), OTP-bypass dev login.
- Shared UI kit (`src/components/ui`): Button, Input, Modal, StatusBadge, Avatar, PageLoader, EmptyState, Amount, etc.
