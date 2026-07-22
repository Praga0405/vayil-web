# Canonical API reference

The REST surface the Next.js web app + admin panel + any future internal
service should target. JSON in, JSON out, `Authorization: Bearer <jwt>`,
ownership-checked at the route level, and idempotency-honouring for the
state-mutating POSTs.

Mobile / Flutter clients should NOT call these — they go through
[`API_MOBILE_LEGACY.md`](./API_MOBILE_LEGACY.md). Both surfaces share
the same service layer underneath.

| Mount | Router file | Auth |
|---|---|---|
| `/auth/*` | `routes/auth.ts` | open + staff |
| `/customers/*` | `routes/customer.ts` | `requireAuth(['customer'])` |
| `/vendors/*` | `routes/vendor.ts` | `requireAuth(['vendor'])` |
| `/payments/*` | `routes/payments.ts` | `requireAuth(['customer'])` |
| `/payments/webhooks/razorpay` | `routes/payments.ts` (raw body) | HMAC |
| `/ops/*` | `routes/ops.ts` | `requireAuth(['staff'])` |
| `/Admin/*`, `/admin/*` | `routes/admin.ts` | `requireAuth(['staff'])` |
| common (vendors browse, settings, health) | `routes/common.ts` | open |

## Conventions

- **Token transport** — any of: `Authorization: Bearer <jwt>`,
  `x-access-token: <jwt>`, body `token` / `access_token`, query `?token=`.
  See `middleware/auth.ts::extractToken`.
- **Response envelope** — always `{ success: true, ...data }` for 2xx and
  `{ success: false, message, details? }` for 4xx/5xx. `ok()` and `fail()`
  in `utils/http.ts`.
- **Idempotency** — POSTs that move money (`/payments/create-order`,
  `/payments/verify`, `/customers/projects/:id/materials/payment-order`)
  accept an `Idempotency-Key` header. The middleware caches the
  response in `idempotency_keys` and replays it for duplicates.
- **Errors** — `ApiError(status, message, details?)` thrown anywhere in
  the request handler is caught by the global error middleware and
  serialised via `fail()`.

## `/auth/*`

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/auth/otp/send` | `{ phone, userType }` | Sends OTP. Dev bypass via `OTP_BYPASS=true` + `OTP_BYPASS_CODE` |
| POST | `/auth/otp/verify` | `{ phone, otp, userType, name? }` | Delegates to `authService.verifyOtpAndIssueToken`. Creates row if first time. Returns `{ token, userType, user }`. Cross-role phone reuse → 409 |
| POST | `/auth/staff/login` | `{ email, password }` | Returns staff JWT signed with `STAFF_JWT_SECRET` |
| GET  | `/auth/staff/me` | — | Current staff record + role list |
| POST | `/auth/staff/logout` | — | Stateless; client just drops the token |

## `/customers/*`

| Method | Path | Returns |
|---|---|---|
| GET  | `/customers/me` | Current customer row |
| PUT  | `/customers/me` | Updated row. Body: any of `name, email, city, address, pincode, profile_image, fcm_token` |
| GET  | `/customers/vendors` | Marketplace list (also exposed publicly on `commonRouter`) |
| GET  | `/customers/vendors/:id` | Vendor profile + service listings |
| GET  | `/customers/enquiries` | Customer's enquiry list |
| GET  | `/customers/enquiries/:id` | `{ enquiry, quotes }` |
| POST | `/customers/enquiries` | New enquiry. Body: `{ vendorId?, serviceId?, category?, description, location?, email?, budget?, location_lat?, location_lng?, preferred_date? }` |
| GET  | `/customers/quotes/:enquiryId` | All quotes on this enquiry (ownership-checked) |
| POST | `/customers/quotes/:quoteId/accept` | Transactional: this quote→accepted, siblings→rejected, enquiry→accepted |
| POST | `/customers/quotes/:quoteId/reject` | `{ reason? }` → persists rejection |
| GET  | `/customers/projects` | Customer's `orders` list |
| GET  | `/customers/projects/:id` | `{ project, plan, escrow:{held,released,total} }` |
| POST | `/customers/projects/:id/plan/approve` | Transactionally flips all plan rows + plan_submission to `approved` |
| POST | `/customers/projects/:id/plan/request-revision` | `{ reason }` |
| POST | `/customers/projects/:id/milestones/:milestoneId/approve` | Customer marks individual milestone approved |
| GET  | `/customers/projects/:id/materials` | `{ materials, locked }` — `locked=true` until plan approved (PRD §10.5) |
| POST | `/customers/projects/:id/materials/payment-order` | `{ material_ids[] }` → marks AWAITING_PAYMENT, returns server-derived total |
| POST | `/customers/projects/:id/signoff` | `{ rating?, comment? }` — INSERT signoff + orders→completed + enquiries→completed + `releaseEscrow` on every held intent → vendor wallet credited |
| POST | `/customers/projects/:id/rework-request` | `{ reason }` — opens a rework ticket |
| GET  | `/customers/payments` | Customer's payment_intents list |
| POST | `/customers/tax-preview` | Recomputes tax (debug) |

## `/vendors/*`

| Method | Path | Returns |
|---|---|---|
| GET  | `/vendors/me` | Current vendor row |
| PUT  | `/vendors/me` | Update profile fields |
| GET  | `/vendors/dashboard` | `{ projects, enquiries, wallet }` |
| GET  | `/vendors/enquiries` | Vendor's enquiry inbox |
| GET  | `/vendors/enquiries/:id` | `{ enquiry, quotes }` joined with customer_name + customer_phone (phone null until accepted) |
| POST | `/vendors/enquiries/:id/accept` | enquiries.status='accepted', accepted_at=NOW() |
| POST | `/vendors/enquiries/:id/reject` | `{ reason? }` |
| POST | `/vendors/enquiries/:id/quotes` | `{ amount, message?, estimatedDays?, validUntil? }` — creates quote, enquiry→quoted |
| GET  | `/vendors/projects` | Job cards (JOINs customer + rolls up escrow + plan_status_rollup) |
| GET  | `/vendors/projects/:id` | `{ project, plan, escrow }` |
| POST | `/vendors/projects/:id/plan` | `{ milestones:[{title, description?, amount, days, percentage, mandatory}] }` — rejects if % ≠ 100 |
| PUT  | `/vendors/projects/:id/plan` | Update specific milestones by `plan_id` |
| POST | `/vendors/projects/:id/plan/submit` | Inserts `plan_submissions` row, flips all milestones to submitted/pending |
| GET  | `/vendors/projects/:id/materials` | All materials for this order |
| POST | `/vendors/projects/:id/materials` | `{ name, quantity?, unit?, rate?, status? }` |
| PUT  | `/vendors/projects/:id/materials/:materialId` | Partial update; total recomputed |
| POST | `/vendors/milestones/:id/updates` | `{ comment?, image_urls?:[] }` |
| POST | `/vendors/milestones/:id/complete` | vendor_status='completed' |
| POST | `/vendors/milestones/:id/payment-request` | customer_status='awaiting_payment' |
| POST | `/vendors/kyc` | `{ proofType, proofNumber, documentUrl }` |
| POST | `/vendors/submit-for-review` | `{ note? }` — flips vendor.status='kyc_submitted', upserts `vendor_review_queue`, fires admin notify |
| GET  | `/vendors/earnings` | `{ wallet, transactions }` — transactions sourced from `escrow_ledger` (type='CREDIT') |
| GET  | `/vendors/listings` | Vendor's vendor_services rows |
| POST | `/vendors/listings` | Create listing |

## `/payments/*`

| Method | Path | Notes |
|---|---|---|
| POST | `/payments/create-order` | `{ amount, purpose:'quote'\|'milestone'\|'materials', enquiry_id\|order_id\|milestone_id, quotation_id?, base_amount?, payment_option?:'full'\|'minimum'\|'custom', material_ids?, idempotency_key }` — re-derives the selected base and gateway total server-side, refuses mismatch by >₹1, creates a Razorpay order, and inserts a payment intent. Quote payments bind to the accepted quotation instead of the latest sibling row. |
| POST | `/payments/verify` | `{ razorpay_order_id, razorpay_payment_id, razorpay_signature, idempotency_key? }` — HMAC verify, intent→escrow_held, escrow_ledger hold row, materialise orders row (quote) or flip materials→PAID (materials), backfill intent.order_id |
| POST | `/payments/webhooks/razorpay` | Mounted with `express.raw()` BEFORE the JSON parser. Verifies `x-razorpay-signature`, handles `payment.captured` / `payment.failed`, writes `webhook_deliveries` row |

See [`PAYMENT_FLOW.md`](./PAYMENT_FLOW.md) for the end-to-end sequence.

## `/Admin/*` (staff panel)

Mounted at both casings (`/Admin/...` and `/admin/...`) since the
external admin SPA hits `/Admin/GetVendorList` etc.

| Path | Purpose |
|---|---|
| `POST /Admin/GetVendorList` | Paginated vendor list, status + search filter |
| `POST /Admin/VendorDetails` | Full vendor record + services + queue history |
| `POST /Admin/VendorKycUpdate` | Approve / reject KYC (transactional) |
| `POST /Admin/VendorStatusUpdate` | Active / inactive toggle |
| `POST /Admin/VendorDelete` | Soft-delete |
| `POST /Admin/saveVendor` | Edit mutable fields |
| `POST /Admin/GetReviewQueue` | Pending review list |

## Common / public

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | `{ success:true, status:'ok', timestamp }` |
| GET | `/vendors`, `/vendors/:id(\d+)` | Public marketplace browse — same data customers see, no auth |
| GET | `/customer/vendors`, `/customer/vendors/:id(\d+)` | Legacy alias for the same |
| GET | `/service-categories`, `/service-subcategories?categoryId=`, `/service-tags` | Reference data |
| GET | `/settings` | Platform settings row |
