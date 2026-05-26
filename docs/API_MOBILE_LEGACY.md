# Legacy mobile API reference

The compatibility surface the existing Vayil **customer** and **vendor**
Flutter apps call. Every endpoint here is a thin shim that:

1. Accepts `multipart/form-data` (what Dio's `FormData.fromMap` sends).
2. Reads any legacy alias of each identifier (`mobile_number`, `mobile`,
   `phone`, `customer_id`, `vendor_id`, `enquiry_id`, `quotation_id`,
   `order_id`, `plan_id`, `material_id`).
3. Calls a function in `backend/src/services/*` — **no SQL lives in
   these route files**.
4. Returns the legacy response shape: `{ success, message, data,
   ...top-level mirrors }` so old Flutter parsers keep working.

If you're building a new feature, ship it as a canonical endpoint and
add a thin alias here only if mobile needs it.

## Mount points

```
/customer/*        ← legacyCustomer.ts  (multipart + JSON)
/vendor/*          ← legacyVendor.ts    (multipart + JSON)
```

Both are protected by `requireAuth(['customer'])` / `requireAuth(['vendor'])`
at the router level, except for the OTP-flow handlers (mounted before
the `requireAuth.use`). The multer middleware (`legacyMultipart` in
`index.ts`) parses multipart bodies and falls through to the canonical
JSON parser otherwise.

## Customer endpoints (`/customer/*`)

### Auth (open)

| Endpoint | Body | Returns |
|---|---|---|
| `POST /register` | `{mobile_number}` | OTP send confirmation |
| `POST /verifyCustomerOTP` | `{mobile_number, otp, name?}` | `{token, customer_id, data:customer}` |
| `POST /logincustomerWithOTP` | `{mobile_number}` | Same as `/register` (alias) |
| `POST /verifyLogincustomerOTP` | `{mobile_number, otp}` | Same as verifyCustomerOTP |
| `POST /resendcustomerOTP` | `{mobile_number}` | resend |

### Profile + browsing

| Endpoint | Body | Returns |
|---|---|---|
| `POST /saveCustomerInfo` | `{name?, email?, city?, address?, pincode?, profile_image?, fcm_token?}` | updated customer |
| `GET/POST /getCustomerInfo` | — | current customer |
| `GET/POST /getSettings` | — | `settings` row + `razorpay_key` env |
| `POST /ServiceList` | — | service_categories |
| `POST /ServiceInfo` | `{category_id}` | `{vendors, subcategories}` |
| `POST /vendorInfo` | `{vendor_id}` | `{vendor, listings}` |

### Enquiries + quotes

| Endpoint | Body | Behaviour |
|---|---|---|
| `POST /sendEnquiry` | `{description, vendor_id?, category?, location?, budget?, location_lat?, location_lng?, preferred_date?, email?}` | `enquiryService.createEnquiry` → 201 |
| `POST /enquiryList` | — | All enquiries for the authenticated customer |
| `POST /enquiryDetails` | `{enquiry_id}` | enquiry + quotes (ownership-checked) |
| `POST /QuotationList` | `{enquiry_id}` | quotes for that enquiry |
| `POST /updateQuotation` | `{quotation_id, action:'accept'\|'reject', reason?}` | calls `quoteService.acceptQuote` / `rejectQuote` |

### Payments + project

| Endpoint | Body | Behaviour |
|---|---|---|
| `POST /placeOrder` | `{enquiry_id\|order_id\|milestone_id, amount, purpose?, material_ids?, idempotency_key?}` | `paymentService.createPaymentIntent` |
| `POST /payment_update` | `{razorpay_order_id, razorpay_payment_id, razorpay_signature}` | `paymentService.verifyAndHold` → intent→escrow_held + materialise order + backfill order_id |
| `POST /orderDetails` | `{order_id}` | `{project, plan}` |
| `POST /getPaymentDetails` | `{order_id}` | `{total, paid, remaining, intents}` |
| `POST /NeedPaymentSummary` | `{order_id}` | Same as `getPaymentDetails` |
| `POST /finalStep` | `{order_id, rating?, comment?}` | `projectService.signoffOrder` — orders→completed, enquiries→completed, releaseEscrow for every held intent → vendor wallet credited |

### Reviews / notifications / cart

| Endpoint | Body | Behaviour |
|---|---|---|
| `POST /addReview` | `{vendor_id, order_id?, rating, title?, comment?}` | INSERT customer_reviews + recompute vendors.rating |
| `POST /customerNotificationList` | — | notifications (recipient_type=customer) |
| `POST /addToCart` | `{vendor_id?, service_id?, quantity?, price?, service_title?}` | `customer_cart` row |
| `POST /getCart` | — | cart with vendor name join |
| `POST /removeCartItem` | `{cart_id}` | delete |
| `POST /clearCart` | — | wipe customer's cart |
| `POST /upload_files` | (multipart files) | S3 upload via `utils/uploads.ts`, returns `{urls:[{url,filename,size,mimetype}], data:same}` |

## Vendor endpoints (`/vendor/*`)

### Auth (open)

| Endpoint | Body | Returns |
|---|---|---|
| `POST /register` | `{mobile_number}` | OTP send |
| `POST /verifyVendorOTP` | `{mobile_number, otp, company_name?}` | `{token, vendor_id, data:vendor}` |
| `POST /vendor-login-otp` | `{mobile_number}` | OTP send (alias) |
| `POST /vendor-login-verify-otp` | `{mobile_number, otp}` | Same as verifyVendorOTP |
| `POST /resendVendorOTP` | `{mobile_number}` | resend |

### Onboarding + listings

| Endpoint | Body | Behaviour |
|---|---|---|
| `POST /step1`…`/step4` | profile fields | `vendorService.onboardingStep`. Step 4 also flips status=kyc_submitted |
| `POST /serviceTagStep` / `/VendorAddServiceTag` | `{name}` | upserts a `service_tags` row |
| `POST /saveServiceListing` | `{title, description?, price?, category_id?, subcategory_id?, thumbnail?, tag_ids?}` | new vendor_services row |
| `POST /updateServiceListing` | `{vendor_service_id, ...fields}` | partial update |
| `GET/POST /getVendorServiceList` | — | vendor's listings |
| `POST /ServiceStatusUpdate` | `{service_id, status:0\|1}` | toggle visibility |
| `POST /ServiceDetails` | `{service_id}` | single listing |

### Enquiries + quotes

| Endpoint | Body | Behaviour |
|---|---|---|
| `POST /vendorEnuqiryList` *(typo preserved)* | — | vendor's enquiry inbox |
| `POST /AcceptEnquiredStatusUpdate` | `{enquiry_id}` | enquiries.status='accepted', accepted_at=NOW() |
| `POST /vendorRejectEnquiry` | `{enquiry_id, reason?}` | enquiries.status='rejected' |
| `POST /sendQuotationToCustomer` | `{enquiry_id, amount, message?, estimated_days?, valid_until?, advance_amount?}` | `quoteService.sendQuote` |

### Plan + materials

| Endpoint | Body | Behaviour |
|---|---|---|
| `POST /createPlan` | `{order_id, milestones:[...]}` | `projectService.createPlan` — % must total exactly 100 |
| `POST /updatePlan` | `{order_id, milestones:[...]}` | partial update by plan_id |
| `POST /updatePlanStatus` | `{order_id}` | `projectService.submitPlan` |
| `POST /createAcceptPlan` | `{order_id, milestones:[...]}` | shortcut: createPlan + submitPlan |
| `POST /vendorgetPlan`, `/vendorPlanDetails` | `{order_id}` | `{project, plan}` |
| `POST /addPlanMaterial` | `{order_id, name, quantity?, unit?, rate?}` | `materialService.addMaterial` |
| `POST /editPlanMaterial` | `{order_id, material_id, ...}` | partial update (undefined keys skipped) |
| `POST /vendorgetMaterial` | `{order_id}` | materials list |
| `POST /vendorMaterialDetails` | `{material_id}` | one material (ownership-checked via parent order) |
| `POST /vendorOrderDetails` | `{order_id}` | `{project, plan}` |

### Payment requests + earnings

| Endpoint | Body | Behaviour |
|---|---|---|
| `POST /AskPyament` *(typo preserved)* | `{plan_id}` | `projectService.requestMilestonePayment` — flips customer_status='awaiting_payment' |
| `POST /vendorPaymentSummary` | `{order_id}` | intents rollup (held + released) |
| `POST /vendorBalance` | — | `vendor_wallet` row (auto-created if missing) |
| `GET  /getVendorRevenueChart` | `?months=6` | monthly revenue from escrow_ledger releases |
| `POST /vendorTransactionHistory` | — | escrow_ledger releases, type='CREDIT' |
| `POST /vendorTransHistoryCurMon` | — | same, current calendar month only |
| `POST /vendorPayout` | `{amount, bank_id?, note?}` | debits wallet, inserts `payout_requests` |
| `GET/POST /vendorGetSettings` | — | `settings` row + razorpay_key env |

### Bank, notifications, reviews, upload

| Endpoint | Body | Behaviour |
|---|---|---|
| `POST /AddBankDetails` | `{account_holder, account_number, ifsc_code, bank_name?, branch?, upi_id?, is_primary?}` | new `bank_details` row |
| `POST /EditBankDetails` | `{bank_id, ...fields}` | direct edit |
| `POST /GetBankDetails` | — | all bank rows for vendor |
| `POST /EditBankDetailsReq` | `{bank_id, ...fields}` | queues an edit for ops review (status='pending_edit') |
| `POST /vendorNotificationList` | — | notifications (recipient_type=vendor) |
| `POST /vendorlistReviews` | — | customer_reviews + customer name/avatar join |
| `POST /upload_files` | (multipart) | S3 upload — same response shape as customer/upload_files |

## Payload-key aliases accepted

The shims call `pickId(body, 'snake_id', 'camelId', 'id')` for every
identifier. Mobile rows can use any of the following:

| Logical field | Aliases the shim accepts |
|---|---|
| phone | `mobile_number`, `mobile`, `phone` |
| OTP | `otp`, `otpcode` |
| vendor id | `vendor_id`, `vendorId`, `id` |
| customer id | `customer_id` (read from JWT, never trusted from body) |
| enquiry id | `enquiry_id`, `enquiryId`, `id` |
| quotation id | `quotation_id`, `quotationId`, `id` |
| order id | `order_id`, `orderId`, `id` |
| plan / milestone id | `plan_id`, `planId`, `milestone_id`, `milestoneId` |
| material id | `material_id`, `materialId` |
| bank id | `bank_id`, `bankId`, `id` |
| cart id | `cart_id`, `cartId`, `id` |
| Razorpay verify | `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature` (also accepts bare `order_id`, `payment_id`, `signature`) |

## Token handling

The same `extractToken` middleware that powers the canonical surface
also covers the legacy shim — token can ride as:

- `Authorization: Bearer <jwt>`  (what current Flutter Dio uses)
- `x-access-token: <jwt>`         (older mobile builds)
- body field `token` / `access_token`  (rare)
- query `?token=...`                    (very rare)

## Response shape examples

**Success:**

```json
{
  "success": true,
  "message": "OTP verified",
  "data": { "customer_id": 11, "name": "...", "phone": "...", ... },
  "token": "eyJhbGciOiJI...",
  "customer_id": 11
}
```

**Failure (any 4xx/5xx):**

```json
{
  "success": false,
  "message": "This phone is already registered as a customer. Sign in with that role instead, or use a different phone for the new vendor account.",
  "details": null
}
```
