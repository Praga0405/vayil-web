# Release Notes

## v2.0.0 — Marketplace UX Migration (2026-05-12)

Complete migration from a dual-portal UX (`/customer/*` and `/vendor/*` sidebar shells) to a unified marketplace experience. Login never sends the user into a separate portal — they stay in the marketplace and access their stuff through an avatar dropdown.

### Customer surfaces — new `/account/*` routes

- **`/account/enquiries`** — enquiry list with status filters (All / Pending / Quoted / Ongoing / Completed / Cancelled).
- **`/account/enquiries/[id]`** — enquiry detail, vendor quote, accept/reject, Razorpay payment flow.
- **`/account/projects`** — active and completed projects.
- **`/account/projects/[id]`** — milestones timeline, materials table, pay-remaining, post-completion rate & review modal.
- **`/account/notifications`** — notification feed with unread highlighting.
- **`/account/payments`** — full payment history with total-paid summary card.
- **`/account/profile`** — edit name, email, state/city; sign out.

### Vendor surfaces — new `/vendor-studio/*` routes

- **`/vendor-studio/listing`** — two-tab page combining Business Profile editing and My Services management (toggle active/inactive, link to add new service).
- **`/vendor-studio/earnings`** — wallet balance, pending payout, total earnings card, monthly revenue chart, transaction list.
- **`/vendor-studio/setup`** — tabbed KYC submission (with verified / pending / unverified states) and Bank Details (add/edit account).

### Personalised home page (logged-in users)

- New "Welcome back, [Name]" rail on `/` showing the user's three most recent enquiries / projects, each linking through to its detail page.
- Vendor users see an additional "Vendor Studio" CTA card.
- Guest users see the same public hero as before — fully untouched.

### Shared layout components

- **`PublicHeader`** — role-aware header with avatar dropdown (different menus for customer vs vendor), location selector, search bar, vendor-mode badge.
- **`AccountLayout`** — `PublicHeader` + desktop left-nav (220px) + fixed mobile bottom tab bar.
- **`VendorStudioLayout`** — same shape as `AccountLayout` but with vendor-specific nav items.

### Auth flow changes

- `LoginModal` no longer navigates internally — closes in place and lets the caller decide what to do.
- `/customer/login` and `/vendor/login` standalone pages now redirect to `/` after successful login (not `/customer/dashboard` or `/vendor/dashboard`).
- `/customer/dashboard` → redirects to `/account/enquiries`.
- `/vendor/dashboard` → redirects to `/vendor-studio/listing`.

### Bug fixes

- Fixed "Send Enquiry" and "Book Visit" buttons on vendor profiles doing nothing after login — full `EnquiryModal` and `BookVisitModal` now wired up with `pendingAction` resume logic.

---

## v1.4.0 — Search & Vendor Profiles (pre-2026-05-12)

- Added `/search` — HomeDepot-style public results with filters (categories, rating, verified, price, experience, availability, sort).
- Added `/vendors/[id]` — public vendor profile with overview / services / portfolio / reviews tabs and login-gated contact actions.
- Added `src/lib/dummyData.ts` with 40 sample vendors (5 per service across 8 categories) for local development.
- Moved "Browse other services" to the top of search results; removed redundant in-page search bar.

---

## v1.3.0 — Home Page Polish

- Added Unsplash imagery to every home-page section (hero, quick links, providers, blogs).
- Replaced emoji store badges with proper Apple / Google Play SVG glyphs.
- Fixed stretched / misaligned store-badge logos across all sections.

---

## v1.2.0 — Figma-accurate Home Page

- Rebuilt the home page to match the Figma design spec (node 1-5753) exactly: announcement bar, sticky header, popular-services strip, hero with review card, trust bar, categories grid, providers rail, blogs grid, customer/vendor benefits, footer.

---

## v1.0.0 — Initial Release

- Customer portal: marketplace, enquiries, projects, payments, notifications, profile, Razorpay integration.
- Vendor portal: dashboard, profile, services, enquiries, earnings, KYC, bank, payouts.
- Auth (Zustand store), OTP-bypass dev login for both roles.
- Shared UI kit (`src/components/ui`): Button, Input, Modal, StatusBadge, Avatar, PageLoader, EmptyState, Amount, etc.
