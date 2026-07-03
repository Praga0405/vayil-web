# Mobile API Inventory

Endpoints the existing Vayil **customer** and **vendor** Flutter apps
call against `https://app.vayil.in/`. This document drives the
`backend/src/routes/legacyCustomer.ts` and
`backend/src/routes/legacyVendor.ts` shims — when a screen calls one of
these endpoints, the response shape it parses is the contract the
backend must honour.

> Audit was generated from a direct scan of the unpacked Flutter source
> (Dart) under `_mobile_extracted/`. The apps centralise HTTP through
> `lib/Api_config/api/api_service.dart` + `api_client/api_client.dart`.

## Base URL / config

| App | File | Base URL |
|---|---|---|
| Customer | `lib/App Configuration/app_config.dart` | `https://app.vayil.in/customer/` |
| Vendor | `lib/App Configuration/app_config.dart` | `https://app.vayil.in/vendor/` (and bare-path calls like `/step1`) |

Both apps build requests with **Dio** through a shared `ApiClient`
singleton (`api_client.dart`). The HTTP service
(`api_service.dart`) provides four methods: `get`, `post`, `formData`,
`postMultipart`.

## Token handling

The token is fetched from a Hive box (`itemsDB` → key `'token'`) and
attached to every request as:

```
Authorization: Bearer <jwt>
X-Source: mobile-app
Content-Type: multipart/form-data           (POST default)
Content-Type: application/json              (GET only)
```

`ApiClient` also installs a 401-interceptor that calls
`AuthSessionService.handleInvalidToken` when the response code is 401 or
the body's `message` / `msg` / `error` matches `invalid token`,
`token expired`, or `unauthorized` (case-insensitive). The backend's
`utils/http.ts` `fail()` helper already returns `{ success: false,
message }`, so this contract is honoured automatically.

## Transport notes (CRITICAL)

* **Every mobile POST is `multipart/form-data`.** Dio's `FormData.fromMap`
  is used unconditionally. `express.json()` returns an empty body for
  these requests — the backend must run a multer middleware before the
  legacy route handlers. (`index.ts` does this with a `legacyMultipart`
  middleware applied to the `/customer` + `/vendor` + bare-vendor mount
  points.)
* All field values arrive as **strings** (Dio multipart). Numbers
  (`amount`, `quantity`) and booleans (`is_gst_registered`,
  `is_primary`) need server-side coercion. The helpers `num(v)` and the
  truthy checks in `legacyVendor.ts` do this.
* Arrays (`material_ids`, `tag_ids`) cannot ride raw multipart — Dio
  sends them as repeated keys or JSON-encoded strings depending on how
  the screen builds the form. Routes that accept arrays parse both
  `Array.isArray()` and `JSON.parse()`-able strings.

## Response shape

Screens parse one of: `success` (bool), `message` (string), `data`
(object/array), `result` (occasionally), `token` (auth flows). The
backend's `send()` helper inside the legacy routers always returns:

```json
{ "success": true, "message": "…", "data": …, "...": "extra top-level keys for back-compat" }
```

The "extra top-level keys" are things like `token`, `customer_id`,
`vendor_id`, `enquiry_id`, `razorpay_order_id` — older screens read
these from the root, not from `data`, so we mirror them at both levels.

## Payload-key inventory

Identifier keys seen in the customer + vendor apps. Legacy routes accept
**any** of these aliases for the same logical field:

| Logical field | Aliases the apps send |
|---|---|
| phone | `mobile_number`, `mobile`, `phone` |
| customer id | `customer_id` (often a string from Hive — coerce) |
| vendor id | `vendor_id`, `vendorId` |
| enquiry id | `enquiry_id`, `enquiryId` |
| quotation id | `quotation_id`, `quotationId` |
| order id | `order_id`, `orderId` |
| plan / milestone id | `plan_id`, `planId`, `milestone_id` |
| material id | `material_id`, `materialId` |
| bank id | `bank_id`, `bankId` |
| cart id | `cart_id`, `cartId` |
| service / category | `service_id`, `serviceId`, `category_id`, `categoryId` |
| OTP | `otp`, `otpcode` |
| Razorpay | `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature` (also accepts bare `order_id` + `payment_id` + `signature`) |

## Customer App — endpoint table

All endpoints below are mounted under `/customer/`. Method is **POST
multipart** unless noted otherwise.

| Endpoint | Required keys | Returns | Used in |
|---|---|---|---|
| `register` | `mobile_number` | `{success, message, data:{phone,message}}` | LoginController → SignUp |
| `verifyCustomerOTP` | `mobile_number, otp, name?` | `{success, token, customer_id, data:user}` | LoginController → verify |
| `logincustomerWithOTP` | `mobile_number` | `{success, data:{phone,message}}` | LoginController → login |
| `verifyLogincustomerOTP` | `mobile_number, otp` | `{success, token, customer_id, data:user}` | LoginController → verify-login |
| `resendcustomerOTP` | `mobile_number` | `{success, message}` | OTP screen |
| `saveCustomerInfo` | `name, email?, city?, address?, pincode?, profile_image?` | `{success, data:customer}` | Profile screen |
| `getCustomerInfo` (GET+POST) | — (token) | `{success, data:customer, customer_id}` | App boot |
| `ServiceList` | — | `{success, data:[category]}` | Home / Service catalogue |
| `ServiceInfo` | `category_id` | `{success, data:{vendors, subcategories}}` | Category browse |
| `vendorInfo` | `vendor_id` | `{success, data:{vendor, listings}}` | Vendor profile |
| `sendEnquiry` | `description, vendor_id?, category?, location?, budget?` | `{success, enquiry_id, data:enquiry}` | EnquiryController |
| `enquiryList` | — | `{success, data:[enquiry]}` | My Enquiries |
| `enquiryDetails` | `enquiry_id` | `{success, data:{enquiry, quotes}}` | Enquiry detail |
| `QuotationList` | `enquiry_id` | `{success, data:[quote]}` | Quotes screen |
| `updateQuotation` | `quotation_id, action:'accept'\|'reject', reason?` | `{success, data:{status,…}}` | Accept/reject quote |
| `placeOrder` | `amount, enquiry_id\|order_id\|milestone_id, purpose?, idempotency_key?` | `{success, razorpay_order_id, intent_id, amount}` | Razorpay open |
| `payment_update` | `razorpay_order_id, razorpay_payment_id, razorpay_signature` | `{success, data:{status,intent_id}}` | Razorpay verify |
| `orderDetails` | `order_id` | `{success, data:{project, plan}}` | Project screen |
| `getPaymentDetails` | `order_id` | `{success, data:{total,paid,remaining,intents}}` | Payment summary |
| `NeedPaymentSummary` | `order_id` | `{success, data:{needed, …}}` | "Pay remaining" CTA |
| `finalStep` | `order_id, step_status` | `{success, message}` | Update existing order step 4 for customer plan accept/reject; no insert, no escrow release |
| `addReview` | `vendor_id, order_id?, rating, comment` | `{success, data:review}` | Rating modal |
| `customerNotificationList` | — | `{success, data:[notification]}` | Notifications |
| `addToCart` | `vendor_id?, service_id?, quantity?, price?` | `{success, data:cart}` | Service detail |
| `getCart` | — | `{success, data:[cart]}` | Cart screen |
| `removeCartItem` | `cart_id` | `{success, data:{cart_id,removed:true}}` | Cart screen |
| `clearCart` | — | `{success, data:{cleared:true,count}}` | Cart screen |
| `upload_files` | (multipart files) | `{success, data:[{url,…}], urls}` | Profile / KYC upload |

## Vendor App — endpoint table

Mounted under `/vendor/` AND bare `/` (the app sometimes calls
`/step1`, `/AskPyament` with no prefix). All multipart POST unless
noted.

| Endpoint | Required keys | Returns | Used in |
|---|---|---|---|
| `register` | `mobile_number` | `{success, data:{message}}` | Vendor sign-up |
| `verifyVendorOTP` | `mobile_number, otp, company_name?` | `{success, token, vendor_id}` | OTP screen |
| `vendor-login-otp` | `mobile_number` | `{success, data:{message}}` | Login |
| `vendor-login-verify-otp` | `mobile_number, otp` | `{success, token, vendor_id}` | Login verify |
| `resendVendorOTP` | `mobile_number` | `{success, message}` | OTP screen |
| `step1` … `step4` | Various profile fields | `{success, data:vendor}` | Onboarding wizard |
| `serviceTagStep` / `VendorAddServiceTag` | `name` | `{success, data:tag}` | Tag manager |
| `saveServiceListing` | `title, description, price, category_id, …` | `{success, vendor_service_id, data}` | Add service |
| `updateServiceListing` | `vendor_service_id, …fields` | `{success, data:listing}` | Edit service |
| `getVendorServiceList` (GET+POST) | — | `{success, data:[listing]}` | My services |
| `ServiceStatusUpdate` | `service_id, status` | `{success, data:listing}` | Toggle on/off |
| `ServiceDetails` | `service_id` | `{success, data:listing}` | Service detail |
| `vendorEnuqiryList` *(typo preserved)* | — | `{success, data:[enquiry]}` | Enquiries inbox |
| `AcceptEnquiredStatusUpdate` | `enquiry_id` | `{success, data:{status:'accepted'}}` | Accept |
| `vendorRejectEnquiry` | `enquiry_id, reason?` | `{success, data:{status:'rejected'}}` | Reject |
| `sendQuotationToCustomer` | `enquiry_id, amount, message?, estimated_days?, valid_until?` | `{success, quotation_id, data:quote}` | Send quote |
| `createPlan` / `updatePlan` / `createAcceptPlan` | `order_id, milestones:[…]` | `{success, data:[plan]}` | Plan builder |
| `updatePlanStatus` | `order_id` | `{success, data:{status:'submitted'}}` | Plan submit |
| `vendorgetPlan` / `vendorPlanDetails` | `order_id` | `{success, data:{project,plan}}` | Plan view |
| `addPlanMaterial` | `order_id, name, quantity, rate, unit?` | `{success, material_id, data}` | Materials screen |
| `editPlanMaterial` | `order_id, material_id, …` | `{success, data:material}` | Edit material |
| `vendorgetMaterial` | `order_id` | `{success, data:[material]}` | Materials list |
| `vendorMaterialDetails` | `material_id` | `{success, data:material}` | Material detail |
| `vendorOrderDetails` | `order_id` | `{success, data:{project,plan}}` | Order view |
| `AskPyament` *(typo preserved)* | `plan_id` | `{success, data:{status:'awaiting_payment',amount}}` | Request payment |
| `vendorPaymentSummary` | `order_id` | `{success, data:{intents,held,released}}` | Project earnings |
| `vendorBalance` | — | `{success, data:wallet, balance}` | Earnings header |
| `getVendorRevenueChart` (GET) | `?months=6` | `{success, data:[{month,revenue}]}` | Chart widget |
| `vendorTransactionHistory` | — | `{success, data:[txn]}` | Transactions |
| `vendorTransHistoryCurMon` | — | `{success, data:[txn]}` | This-month filter |
| `vendorPayout` | `amount, bank_id?, note?` | `{success, data:payout}` | Payout request |
| `AddBankDetails` | `account_holder, account_number, ifsc_code, …` | `{success, data:bank}` | Bank screen |
| `EditBankDetails` | `bank_id, …` | `{success, data:bank}` | Edit bank |
| `GetBankDetails` | — | `{success, data:[bank]}` | Bank list |
| `EditBankDetailsReq` | `bank_id, …` | `{success, data:bank (pending_edit)}` | Request edit |
| `vendorNotificationList` | — | `{success, data:[notification]}` | Notifications |
| `vendorlistReviews` | — | `{success, data:[review]}` | Reviews |
| `upload_files` | (multipart) | `{success, data:[{url,…}], urls}` | Upload |

## Payment flow trace

`placeOrder` → `payment_update` is the only money-moving pair in the
customer mobile app. The shim routes them onto the canonical pipeline:

```
placeOrder   ─► paymentService.createPaymentIntent
                   ↳ resolveExpectedAmount  (re-derives total — refuses
                                              client-supplied lies)
                   ↳ INSERT payment_intents (status='initiated')
                   ↳ Razorpay Orders.create
                   → returns { razorpay_order_id, intent_id, amount }

(Razorpay UI in app)

payment_update ─► paymentService.verifyAndHold
                   ↳ HMAC verify razorpay_signature
                   ↳ UPDATE payment_intents status='escrow_held'
                   ↳ INSERT escrow_ledger direction='hold'
                   ↳ if purpose='quote' → materialise orders row
                   ↳ if purpose='materials' → mark materials PAID

finalStep    ─► update order_step_logs step=4
                   ↳ customer accepts/rejects vendor plan

canonical signoff
             ─► projectService.signoffOrder / signoff route
                   ↳ INSERT signoffs
                   ↳ orders.status='completed'
                   ↳ for each held intent → releaseEscrow()
                         ↳ INSERT escrow_ledger direction='release'
                         ↳ credit vendor_wallet
```

**The old "credit vendor_wallet from placeOrder directly" behaviour is
gone.** Funds only land in the wallet via `releaseEscrow`, which is
triggered by milestone completion or final sign-off.

## Notable inconsistencies

* `vendorEnuqiryList` and `AskPyament` carry typos in the mobile app —
  the legacy routes preserve them verbatim.
* `getVendorServiceList` is called as both GET and POST from different
  screens — both are mounted.
* `getCustomerInfo` ditto.
* Some screens send `customer_id` from the Hive box as a string `"0"`
  before login — those calls are rejected by `requireAuth` before they
  hit the handler.
* `material_ids` for materials payment is sent as a JSON-stringified
  array, not a repeated field. `legacyCustomer.ts` parses both forms.
* The customer mobile app builds the Razorpay payload from
  `placeOrder`'s response; the legacy route mirrors `razorpay_order_id`,
  `intent_id`, and `amount` at the **root** of the JSON (not under
  `data`) for back-compat.

## Endpoints listed in the spec but **NOT FOUND** in mobile source

The user's spec for `/customer/*` and `/vendor/*` matches what's in the
apps. No phantom endpoints were detected. The bare `/register` for
vendor (vs. `/vendor/register`) is supported by mounting the vendor
router at both `/` and `/vendor`.
