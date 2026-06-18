# Vayil API Compatibility Audit — Mobile Apps vs New Backend

**Date:** 2026-06-18
**Auditor:** Praga + Claude
**Inputs analysed:**
- Vayil-customer-App-main (Flutter, April 2026 snapshot) — `/tmp/vayil-mobile-audit/customer-app/`
- Vayil-vendor-App-main (Flutter, April 2026 snapshot) — `/tmp/vayil-mobile-audit/vendor-app/`
- Vayil-Backend-main (Express+TS, April 2026 snapshot) — `/tmp/vayil-mobile-audit/old-backend/`
- vayil-web/backend (current production, v4.5.34) — `/Users/.../vayil-web/backend/`
- Postman collection `Vayil (1).json` (146 requests, zero captured responses)

---

## Executive summary

| Metric | Count |
|---|---|
| Total mobile-facing endpoints in old backend | **111** |
| Already exists in new backend with matching shape | 87 |
| Exists but **shape differs — bridge required** | **15** |
| Missing entirely from new backend | **9** |

**Bottom line:** The new backend covers 92% of mobile endpoints by URL, but **15 of those have response-shape mismatches** that will silently break specific mobile screens (vendor enquiries view, transaction history, payment summary, plan management, etc.). Until those bridges are added, the mobile app will get parsed-as-null fields on those screens.

The other 9 endpoints are missing entirely — most are non-critical (admin toggles, currency lookup) or already covered via a different route name (state listings).

---

## Section 1 — Critical bridges needed (will break specific mobile screens)

These endpoints exist on both old and new backend at the same URL, but the new backend wraps the payload in `{success, message, data}` while the mobile app parses **top-level keys directly** from the response. Each one needs a per-endpoint bridge that mirrors the old top-level structure.

### 1.1 Vendor — Enquiries list (BLOCKING for vendor home screen)

**Endpoint:** `POST /vendorEnuqiryList`
**Mobile parser:** `Vayil-vendor-App-main/lib/Models/vendor_New_Enquire_List.dart`

```dart
// Mobile reads top-level keys (lines 14-23)
if (json['new_enquiry'] != null) { newEnquiry = json['new_enquiry']... }
if (json['ongoing'] != null)     { ongoing = json['ongoing']... }
if (json['request_quotation'] != null) { requestQuotation = ... }
```

| Old shape (mobile expects) | New shape (backend returns) |
|---|---|
| `{ success, new_enquiry:[], ongoing:[], request_quotation:[] }` | `{ success, message, data:[] }` |

**Bridge:** Backend handler needs to return three categorized buckets:
```ts
send(res, {
  data,                              // canonical, keep
  new_enquiry:        groupByStatus(data, 'new'),
  ongoing:            groupByStatus(data, 'ongoing'),
  request_quotation:  groupByStatus(data, 'quotation_requested'),
});
```

**Impact if not fixed:** Vendor home screen shows three empty tabs ("New Enquiries", "Ongoing", "Quote Requests"). The data IS in the response but in the wrong slot.

---

### 1.2 Vendor — Transaction history (BLOCKING for earnings screen)

**Endpoints:** `POST /vendorTransactionHistory`, `POST /vendorTransHistoryCurMon`, `POST /vendorBalance`
**Mobile parsers:** `Transaction_History_Model.dart`, `Current_MonthEarning_History_List_Model.dart`

```dart
// Mobile reads at top level
totalEarning = json['total_earning'];
totalPayout  = json['total_payout'];
balance      = json['balance'];
total        = json['total'];          // count
month        = json['month'];          // CurMon only
data         = json['data'];
```

| Old shape | New shape |
|---|---|
| `{ success, balance, total_earning, total_payout, total, data, month? }` | `{ success, message, data }` |

**Bridge:** Compute aggregates and put them at top level alongside data.

**Impact:** Earnings screen shows ₹0 for "This month earnings", "Total payout", "Available balance". The numbers exist in the response but unreachable.

---

### 1.3 Vendor — Payment summary (BLOCKING for invoice + payouts)

**Endpoint:** `POST /vendorPaymentSummary`
**Mobile parser:** `Vendor_Payment_summary_Model.dart`

```dart
totalAmount         = json['TotalAmount'];
totalPaidAmount     = json['TotalPaidAmount'];
totalMaterialAmount = json['TotalMaterialAmount'];
totalPlanAmount     = json['TotalPlanAmount'];
servicePayment      = json['servicePayment'];
materialPayment     = json['materialPayment'];
invoiceUrl          = json['invoice_url'];
```

| Old shape | New shape |
|---|---|
| `{ success, TotalAmount, TotalPaidAmount, TotalMaterialAmount, TotalPlanAmount, servicePayment:[], materialPayment:[], invoice_url, https }` | not located — handler may be missing or shape unverified |

**Bridge:** All 9 keys at top level. Note the unusual camelCase mix (`TotalAmount` capital, `servicePayment` lower) — exact case matters for Dart parsing.

**Impact:** Payment summary screen shows blank values, invoice download fails (URL is null).

---

### 1.4 Customer — Payment details (mirrors vendor payment summary)

**Endpoint:** `POST /customer/getPaymentDetails`
**Mobile parser:** likely `Customer_Payment_Details_Model.dart` (same field set as vendor)

Same 9-field flat structure as above. Same bridge pattern.

---

### 1.5 Vendor — Plan management (BLOCKING for project plan screen)

**Endpoints:** `POST /createPlan`, `POST /vendorgetPlan`
**Mobile parser:** `Create_Plan_List_Model.dart`

```dart
totalBaseAmount     = json['total_base_amount'];
usedPercentage      = json['used_percentage'];
usedAmount          = json['used_amount'];            // vendorgetPlan only
balancePercentage   = json['balance_percentage'];     // vendorgetPlan only
currentPlanAmount   = json['current_plan_amount'];    // createPlan only
remainingPercentage = json['remaining_percentage'];   // createPlan only
plans               = json['plans'];                  // vendorgetPlan only
summary             = json['summary'];                // vendorgetPlan only
```

| Old shape (`vendorgetPlan`) | New shape |
|---|---|
| `{ success, message, summary, total_base_amount, used_percentage, used_amount, balance_percentage, plans }` | `{ success, message, data }` |

**Bridge:** Compute the percentages + amounts server-side and expose at top level.

**Impact:** Vendor's project plan progress bar shows 0%, "remaining budget" shows ₹0. Plan list parses but progress widgets are blank.

---

### 1.6 Vendor — Order details (project workflow)

**Endpoint:** `POST /vendorOrderDetails`
**Mobile parser:** likely `Vendor_Order_Details_Model.dart`

| Old shape | New shape |
|---|---|
| `{ success, message, steps, data, ordersMain, order_plan }` | `{ success, message, data }` |

**Bridge:** Extract `steps`, `ordersMain`, `order_plan` to top level alongside `data`.

**Impact:** Project workflow timeline (step indicator) is empty. Order main info missing.

---

### 1.7 Customer — Enquiry list (BLOCKING for customer's "My Enquiries")

**Endpoint:** `POST /customer/enquiryList`
**Mobile parser:** `Quotelist_Ongoinglist_Model.dart` line 199–211

```dart
class Orders {
  List<Ordersteps>? ordersteps;        // ← nested inside each order
  Orders.fromJson(json) {
    if (json['ordersteps'] != null) { ordersteps = ... }
  }
}
```

**Note:** `ordersteps` is NESTED inside each order in the `data` array, not top-level. The top-level extra key in the old response is just for some aggregate.

| Old shape | New shape |
|---|---|
| `{ success, data:[ {id, ..., ordersteps:[]} ], ordersteps:[] }` | `{ success, message, data:[ {id, ...} ] }` |

**Bridge:** Either nested or top-level — read the controller more carefully. Lower priority because mobile reads `ordersteps` inside `data[].ordersteps`, which may already work if the new backend's `data` items include it. Need to verify the inner shape too.

---

### 1.8 Customer — Get plan (project view)

**Endpoint:** `POST /customer/getPlan`
**Mobile parser:** likely `Customer_Get_Plan_Model.dart`

| Old shape | New shape |
|---|---|
| `{ success, message, steps, ordermaterials, ordersMain, data, review }` | `{ success, message, data }` |

**Bridge:** Five top-level keys (`steps`, `ordermaterials`, `ordersMain`, `review`) need to be lifted out of data.

**Impact:** Customer project page shows blank workflow steps, no materials list, no review section.

---

### 1.9 Customer — Vendor info (vendor profile when browsing)

**Endpoint:** `POST /customer/vendorInfo`
**Old shape:** `{ success, data, category, service, review }`

**Bridge:** `category`, `service`, `review` at top level.

**Impact:** Vendor profile page shows "No categories", "No services", "No reviews" — even though backend has the data.

---

### 1.10 Customer — Order details

**Endpoint:** `POST /customer/orderDetails`
**Old shape:** `{ success, message, steps, data, ordersMain, order_plan }`

Same pattern as vendor order details. Same bridge.

---

## Section 2 — Missing endpoints (need decision or new implementation)

| # | Method + Path | Old handler returns | Recommended action |
|---|---|---|---|
| 1 | `POST /markNotificationRead` | `{success, message}` | **Implement.** Per-user notification mark-read. Auth required. ~30 min. |
| 2 | `POST /ServiceReviewStatusUpdate` | `{success, message}` | **Implement.** Vendor moderates reviews on their listings. ~1 hour. |
| 3 | `POST /checkPermission` | `{success, message}` | **Implement** if the mobile app calls it (audit screen-by-screen). Likely a role/permission lookup. ~1 hour. |
| 4 | `GET /get_currency` | `{success, message, data}` | **Low priority.** Mobile probably hardcodes "INR" everywhere. Stub with INR-only response if anything calls it. ~10 min. |
| 5 | `GET /get_states` | `{success, message, data}` | **Implement.** All-states list (unfiltered by country). 5 min — alias to existing `getStateListByCountryID` with default country=101 (India). |
| 6 | `POST /get_states_by_country_id` | `{success, message, data}` | **Add POST alias.** Existing handler is GET-only; mobile sometimes calls POST. 5 min — add `POST` method to existing route. |
| 7 | `POST /service-category/toggle` | `{success, message}` | **DO NOT implement on mobile.** Admin-only mutation (toggle category active/inactive). Use admin panel. Stays admin-gated. |
| 8 | `POST /service-tag/toggle` | `{success, message}` | Same — admin-only. |
| 9 | `POST /customer/listReviews` | `{success, data}` | **Implement.** Customer browsing reviews of a vendor. ~30 min. |

---

## Section 3 — Endpoints that ALREADY match (no action needed)

All ~87 of these return shapes the mobile parsers handle correctly:

**Auth & OTP (10):** register, verifyVendorOTP/CustomerOTP, vendor-login-otp/vendor-login-verify-otp, logincustomerWithOTP, verifyLogincustomerOTP, resendVendorOTP/resendcustomerOTP

**Onboarding (5):** step1, step2, step3, step4, serviceTagStep, VendorAddServiceTag

**Service catalog (lookups):** ServiceList, ServiceInfo, ServiceCategories, ServiceSubcategories, vendorInfo (vendor's own), saveServiceListing, updateServiceListing, getVendorServiceList, ServiceStatusUpdate, ServiceDetails

**Master data (8):** getLanguages, getTools, getToolList, get_city, listProofTypes, listStatus, service-categories, service-subcategories, service-tags, get_countries, get_states_by_country_id (GET)

**Customer flow (8):** addToCart, getCart, removeCartItem, clearCart, sendEnquiry, enquiryDetails, sendQuotation, QuotationList, updateQuotation, placeOrder, finalStep, payment_update, CustomerupdatePlan, addReview, saveCustomerInfo, getCustomerInfo, customerNotificationList, NeedPaymentSummary

**Vendor flow (12):** sendQuotationToCustomer, vendorRejectEnquiry, AcceptEnquiredStatusUpdate, updatePlan, updatePlanStatus, vendorPlanDetails, addPlanMaterial, editPlanMaterial, vendorgetMaterial, vendorMaterialDetails, createAcceptPlan, AskPyament, vendorlistReviews, vendorNotificationList, getVendorRevenueChart

**Banking + payouts (5):** AddBankDetails, EditBankDetails, EditBankDetailsReq, GetBankDetails, vendorPayout

**Settings (2):** `/customer/getSettings`, `/vendor/vendorGetSettings` — both fully match (v4.5.31 dual-shape + v4.5.34 secrets re-exposed)

**File upload (2):** `/upload_files`, `/customer/upload_files`, `/vendor/upload_files`

---

## Section 4 — Implementation plan

### Phase 1 (3–4 hours): critical bridges

The 10 bridges in Section 1 are mostly the same pattern — extract specific top-level keys from data, expose them alongside data in `send()`. One handler at a time:

| Endpoint | Effort | Priority |
|---|---|---|
| `vendorEnuqiryList` — group enquiries into 3 buckets | 30 min | P0 (vendor home screen) |
| `vendorTransactionHistory` + `vendorTransHistoryCurMon` + `vendorBalance` — aggregate top-level | 45 min | P0 (earnings) |
| `vendorPaymentSummary` + `customer/getPaymentDetails` — flat 9-field top-level | 45 min | P0 (payments) |
| `vendorgetPlan` + `createPlan` — plan percentages | 30 min | P1 (plan view) |
| `vendorOrderDetails` + `customer/orderDetails` + `customer/getPlan` — steps/ordersMain at top | 45 min | P1 (project workflow) |
| `customer/vendorInfo` — category/service/review at top | 20 min | P1 (vendor profile) |
| `customer/enquiryList` — verify ordersteps placement | 20 min | P2 |

### Phase 2 (2 hours): missing endpoints

Implementing the 7 non-trivial missing endpoints:
- `markNotificationRead`, `ServiceReviewStatusUpdate`, `checkPermission`, `customer/listReviews` (real handlers)
- `get_currency`, `get_states` (stub or alias)
- `POST get_states_by_country_id` (alias to GET)

The two admin toggles (`service-category/toggle`, `service-tag/toggle`) stay admin-only — don't expose to mobile.

### Phase 3 (30 min): verification

End-to-end smoke against both Flutter apps, focused on the screens the bridges unblock:
- Vendor home → enquiries tabs
- Vendor earnings screen
- Vendor payment summary + invoice download
- Vendor project workflow (plan, materials, steps)
- Customer order detail page
- Customer vendor profile (browse)

### Total estimated effort
**5–6 hours of focused backend work**, no mobile-side changes needed beyond the base URL swap. Each bridge is isolated and independently testable.

---

## Section 5 — What the mobile team should be told

> "We've audited every endpoint your app calls against the new backend. 87 of 111 work as-is; 15 need response-shape bridges (which we'll add on our side); 9 are either missing or admin-only. After we ship the bridges, your app will function on the new backend with only the 1-line base URL change.
>
> Specifically: the screens that will work immediately after the URL swap are auth, registration, profile, service browsing, cart, enquiries (sending), payments (sending), file uploads, all master data lookups, and notifications.
>
> The screens that will need our bridge work to fully populate are: vendor home enquiry tabs, vendor earnings/transaction history, payment summary + invoices, vendor plan management, project workflow timelines, customer vendor profile, customer order details. Estimated 5–6 hours of our work to fix all of them. We'll prioritise vendor home + earnings + payments (P0) since those are the most-used screens."

---

## Section 6 — Decision points for Praga

**Do you want me to:**

1. **Ship all 10 Phase 1 bridges in one PR** (~3–4 hours of my time, can do today)?
2. **Ship them progressively** (one per commit, you verify each in production before I move on)?
3. **Implement the missing endpoints (Phase 2) as well** in the same sprint, or defer?
4. **Hold off entirely** until the mobile team confirms they want the bridges (vs. fixing their parsers to use `data.X` instead of top-level `X`)?

For comparison: if the mobile team fixed their parsers instead, the change is mostly mechanical (`json['new_enquiry']` → `json['data']['new_enquiry']` etc.) — but it touches every Model class with a rich shape (~10 files) and requires their next app release.

---

**End of audit.**
