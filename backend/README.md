# Vayil Backend Complete Package

This is a clean backend package for Vayil customer, vendor, and ops web/mobile flows. It is designed to be handed to Claude or a developer as the backend foundation without leaking the old repo's `.env`, Firebase private key, logs, or compiled build artifacts. Yes, secrets in ZIP files are still a terrible idea, so this package avoids that circus.

## What this package covers

- Customer OTP login and profile
- Vendor OTP login, KYC, listings, enquiries, quote submission, jobs, earnings
- Staff/ops JWT login
- Ops dashboard stats and revenue analytics
- Customer CRM notes
- Vendor management and KYC approval/rejection
- Project and payment views
- Escrow release endpoint
- Dispute resolution with split validation
- Support ticket endpoints
- Staff management
- GST/TDS/platform-fee calculator
- MySQL migration script
- Seed script with one super admin account
- Legacy aliases for existing mobile route patterns where practical

## Quick start (local)

```bash
cp .env.example .env
npm install
npm run migrate              # creates schema + adds seed_source columns
npm run seed                 # super-admin staff + 6 base categories
npm run seed:marketplace     # 40 vendors, 8 customers, demo enquiries/order
npm run dev                  # http://localhost:9090
```

Default seeded staff account:

```text
admin@vayil.in / ChangeMe@123
```

Change this immediately after first login.

## Seed marketplace data (vendors / customers / activity)

`scripts/seed-marketplace.ts` populates the database with the 40 demo vendors,
8 demo customers, and sample enquiries/quotations/orders used by the web app
during staging and demos. Every row is tagged `seed_source = 'vayil-demo-v1'`
so it can be cleanly removed.

```bash
npm run seed:marketplace            # full seed (vendors + sample activity)
npm run seed:marketplace:vendors    # vendors + categories + customers only
npm run unseed:marketplace          # delete every row tagged vayil-demo-v1
```

For production launch, use `seed:marketplace:vendors` so the catalogue is
populated but no fake enquiries / orders show up in dashboards. Run the
`:purge` variant any time to wipe demo data without touching real users.

## Deploy to Render (recommended)

The repo ships with `Dockerfile` and `render.yaml` for one-click deploy.

1. Push this repo to GitHub.
2. In Render → **New +** → **Blueprint**, point at the repo. Render detects
   `render.yaml` and creates the web service.
3. Provision a **MySQL** add-on (or any external MySQL — PlanetScale, RDS).
   Copy host/port/user/password into the service's env vars.
4. Set remaining env vars per `.env.example` (`JWT_SECRET` is auto-generated,
   `RAZORPAY_*` and `TWO_FACTOR_API_KEY` you supply).
5. After first deploy, open a Render shell and run:

   ```bash
   npm run migrate
   npm run seed
   npm run seed:marketplace          # or :vendors for prod
   ```

6. Point the web app's `NEXT_PUBLIC_API_URL` (on Vercel) at the Render URL.
7. Confirm `GET https://<your-render-url>/health` returns `{status:"ok"}`.

`CORS_ORIGIN` must list the web app's origins (Vercel preview + production)
or requests are blocked.

## Main API groups

```text
GET  /health
POST /auth/otp/send
POST /auth/otp/verify
POST /auth/staff/login
GET  /auth/staff/me

GET  /customers/me
PUT  /customers/me
GET  /customers/vendors
GET  /customers/vendors/:id
GET  /customers/enquiries
POST /customers/enquiries
GET  /customers/enquiries/:id
GET  /customers/projects
GET  /customers/projects/:id
GET  /customers/payments

GET  /vendors/me
PUT  /vendors/me
GET  /vendors/dashboard
GET  /vendors/enquiries
GET  /vendors/enquiries/:id
POST /vendors/enquiries/:id/quotes
GET  /vendors/projects
GET  /vendors/projects/:id
POST /vendors/kyc
GET  /vendors/earnings
GET  /vendors/listings
POST /vendors/listings

GET  /ops/dashboard/stats
GET  /ops/analytics/revenue?period=30d
GET  /ops/customers
GET  /ops/customers/:id
POST /ops/customers/:id/notes
GET  /ops/vendors
GET  /ops/vendors/:id
PATCH /ops/vendors/:id/status
GET  /ops/kyc/pending
POST /ops/kyc/:vendorId/approve
POST /ops/kyc/:vendorId/reject
GET  /ops/projects
GET  /ops/projects/:id
GET  /ops/payments
POST /ops/payments/release
GET  /ops/disputes
POST /ops/disputes/:id/resolve
GET  /ops/support
GET  /ops/support/:id
POST /ops/support/:id/reply
PATCH /ops/support/:id/status
GET  /ops/staff
POST /ops/staff
```

## Important notes for Claude/developer

1. This package intentionally uses one consistent JWT auth model.
2. OTP is never returned in API responses.
3. Email is optional for customers.
4. Vendors start as `pending`, move to `kyc_submitted`, and become `verified` only after ops approval.
5. Dispute split validation ensures customer + vendor payout equals disputed amount.
6. Escrow release credits vendor wallet and writes a transaction record.
7. The schema includes new operational tables missing from the old backend: staff, roles, support tickets, CRM notes, disputes, OTP ledger, and vendor TDS ledger.
8. The API is written to support the V0 web app and can also be adapted to legacy Flutter mobile routes.

## Production checklist

- Replace all secrets in `.env`
- Disable `OTP_BYPASS`
- Add `TWO_FACTOR_API_KEY`
- Add Razorpay keys
- Add S3 upload implementation if direct backend uploads are needed
- Add request logging and monitoring
- Run end-to-end tests against the actual mobile and web apps
- Confirm all column names against the live RDS schema before replacing production backend

