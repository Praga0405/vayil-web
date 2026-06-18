# Vayil Mobile Migration Guide — `app.vayil.in` → `vayil-web.vercel.app`

**Audience:** Vayil mobile (Flutter) engineering team
**Author:** Vayil backend team
**Last updated:** 2026-06-15 (v4.5.33)
**Owner contact:** Praga
**Estimated effort:** **2–3 days** for a single dev familiar with the codebase. Most of the work is one search-and-replace in the JSON decoder and a Razorpay flow tweak. Details below.

---

## TL;DR (read this first)

- **Base URL changed:** `https://app.vayil.in` → `https://vayil-web.vercel.app`. Every other URL path (`/customer/register`, `/vendor/step1`, etc.) is identical.
- **Auth, request bodies, headers, multipart uploads — all unchanged.** Nothing in how you send data needs to change.
- **Response envelope** — old format `{ success, categories: [row] }` AND new format `{ success, message, data: row }` **both work today** (dual-shape bridge in v4.5.31). You don't have to migrate decoders unless you want to.
- **Three fields removed for security:** `payment_secret`, `smtp_password`, `smtp_username`. These were a Razorpay-account-revocation-level leak in the old API. They are gone permanently. See [Section 4](#4-three-fields-permanently-removed--what-to-do-instead).
- **Several new fields added** that are safe to ignore if you don't use them: `platform_fee_percentage`, `tds_percentage`, `vendor_rebate_period_days`, `razorpay_key`, `currency`.
- **Some fields were `null` in the new DB but now have values again** (v4.5.33 auto-seed): `site_logo`, `tax_option`, `smtp_host`, `support_email`, etc.

If your app does not specifically use `payment_secret` or `smtp_password`, **migration is just a base-URL change**. Everything else is backwards-compatible.

---

## Table of contents

1. [What changed and why](#1-what-changed-and-why)
2. [Base URL update](#2-base-url-update)
3. [Response envelope — dual shape](#3-response-envelope--dual-shape)
4. [Three fields permanently removed + what to do instead](#4-three-fields-permanently-removed--what-to-do-instead)
5. [New fields added](#5-new-fields-added)
6. [Razorpay payment flow — recommended migration](#6-razorpay-payment-flow--recommended-migration)
7. [Endpoint reference — the ones most likely to need changes](#7-endpoint-reference)
8. [Multipart file uploads — profile vs. service photos](#8-multipart-file-uploads)
9. [Error response format — unchanged but worth knowing](#9-error-response-format)
10. [Testing checklist](#10-testing-checklist)
11. [Migration checklist (copy-paste this into your ticket)](#11-migration-checklist)
12. [FAQ](#12-faq)

---

## 1. What changed and why

The backend was rewritten as a fresh codebase against TiDB Cloud (replacing the old `app.vayil.in` stack on MySQL). Three things drove the changes you're seeing:

| Change | Why | Your impact |
|---|---|---|
| Base URL: `vayil-web.vercel.app` | New hosting on Vercel serverless functions | One-line change in your config file |
| Canonical envelope `{ success, message, data }` | Every endpoint in the new stack returns the same shape, so web/admin/mobile all parse consistently | None — old `categories` envelope is still emitted alongside (v4.5.31 dual-shape) |
| Secrets stripped (`payment_secret`, `smtp_password`, `smtp_username`) | Old API was exposing the Razorpay live secret to every browser, which Razorpay actively scans for and revokes accounts over | Need to refactor any code that read these fields. Most flows that look like they need them actually don't. |

---

## 2. Base URL update

The only mandatory change. Find your current base URL constant and update it.

**Before:**
```dart
const String kBaseUrl = 'https://app.vayil.in';
```

**After:**
```dart
const String kBaseUrl = 'https://vayil-web.vercel.app';
```

That's it. Every path (e.g. `/customer/register`, `/vendor/step1`, `/vendorlistReviews`) is identical and works on the new URL.

### Optional: environment-aware base URL (recommended)

```dart
class ApiConfig {
  static String get baseUrl {
    const env = String.fromEnvironment('VAYIL_ENV', defaultValue: 'production');
    return switch (env) {
      'production'  => 'https://vayil-web.vercel.app',
      'staging'     => 'https://vayil-web-staging.vercel.app',
      'localhost'   => 'http://10.0.2.2:9090',     // Android emulator
      _             => 'https://vayil-web.vercel.app',
    };
  }
}
```

---

## 3. Response envelope — dual shape

The backend returns BOTH the old and new envelopes in every response. Your existing decoder keeps working.

### Example: `GET /customer/getSettings`

```jsonc
{
  "success": true,
  "message": "Success",
  "data": {                         // ← NEW canonical envelope
    "id": 1,
    "site_name": "Vayil",
    "payment_key": "rzp_test_SGoCvCYBwqFk9G",
    "razorpay_key": "rzp_test_SGoCvCYBwqFk9G",
    "payment_name": "Razorpay",
    "currency": "INR",
    "tax_option": "{\"tax_options\":[...]}",
    "site_logo": "https://vayil.in/logo.png",
    // ... 28 fields total
  },
  "categories": [{                  // ← OLD envelope, mirrored. Same object.
    "id": 1,
    "site_name": "Vayil",
    "payment_key": "rzp_test_SGoCvCYBwqFk9G",
    // ... same 28 fields
  }]
}
```

**`data` and `categories[0]` always contain the same object.** Pick whichever path your current code uses.

### Migration path (optional, do at your own pace)

If you want to consolidate on the new envelope (so eventually we can drop the `categories` mirror), update your decoder helper:

```dart
// Before — fragile, only handles `categories[0]`
final settings = json['categories'][0];

// After — robust, handles both
final settings = json['data'] ?? (json['categories'] as List?)?.first ?? {};
```

We will **not** drop the `categories` mirror until you confirm every shipped build is updated. Coordinate with us before you assume it's gone.

---

## 4. Three fields permanently removed + what to do instead

These three fields are gone from every public response and will **not** come back. The old API was leaking them to anyone with a browser, which is a P0 security issue (Razorpay actively scans for exposed merchant secrets and revokes accounts).

| Field | What it was | What to use instead |
|---|---|---|
| `payment_secret` | Razorpay merchant **secret** key | Use `payment_key` (or `razorpay_key`, same value) — the public key — for SDK init. The backend signs orders + verifies webhooks server-side. |
| `smtp_password` | Mail server password | Mobile should not send mail directly. Use backend endpoints (`/auth/otp/send`, `/customer/sendEnquiry`, etc.) that trigger server-side mail. |
| `smtp_username` | Mail server username | Same — backend handles all mail. |

### "What does your code DO with `payment_secret`?"

If the answer is:

| If you were doing… | Fix is… | Effort |
|---|---|---|
| Reading the field into your model class, never using it | Delete the field from your model. Mark optional/nullable. | ~30 min |
| Storing it in shared preferences and never reading back | Same — drop the writes too. | ~1 hour |
| Calling Razorpay's REST API **directly from the device** | See [Section 6](#6-razorpay-payment-flow--recommended-migration). One-screen refactor. | 4–8 hours |
| Sending mail from the device using `smtp_password` | Remove the code. Route through backend. | ~1 hour |

### If your JSON decoder asserts these fields are non-null

If your Dart model uses `required` or `late` on these three fields, your build will crash on the new response. Two ways to fix:

**Option A — make them optional (recommended):**
```dart
@JsonSerializable()
class Settings {
  final String? paymentSecret;   // was: required final String paymentSecret;
  final String? smtpPassword;
  final String? smtpUsername;
  // ...
}
```

**Option B — defaults in the decoder:**
```dart
factory Settings.fromJson(Map<String, dynamic> json) => Settings(
  paymentSecret: json['payment_secret'] ?? '',
  smtpPassword:  json['smtp_password']  ?? '',
  // ...
);
```

Either way, your app no longer crashes and the unused-secret slot is just an empty string.

---

## 5. New fields added

These are extras the new stack returns. **Safe to ignore** — your existing decoder won't break on them (Dart `Map<String, dynamic>` ignores unknown keys). Add them to your model only if you actually need the value.

| Field | Source | What it is |
|---|---|---|
| `platform_fee_percentage` | settings row | Platform commission % (currently `5.00`) |
| `premium_fee_percentage` | settings row | Premium-tier commission % (currently `15.00`) |
| `tds_percentage` | settings row | TDS % deducted from vendor payouts (currently `1.00`) |
| `gst_percentage` | settings row | GST % on platform fees (currently `18.00`) |
| `vendor_rebate_period_days` | settings row | Days vendor has to dispute a payout (currently `90`) |
| `razorpay_key` | env var | Public Razorpay key. Same value as `payment_key`, canonical name. |
| `currency` | hardcoded | `"INR"` |

---

## 6. Razorpay payment flow — recommended migration

If your mobile app calls Razorpay's REST API directly using `payment_secret`, you must refactor. This is the **only** change in this migration that might be hard. Razorpay's own Flutter SDK is designed for the correct pattern (mobile uses public key only, backend signs).

### The correct flow (what to implement)

```
┌───────┐    1. POST /payments/create-order        ┌───────────┐
│       │ ───────────────────────────────────────▶│  Backend  │
│ App   │       { amount, currency, ... }          │           │
│       │                                          │           │
│       │ ◀─────────────────────────────────────── │  signs    │
│       │    { orderId, key (public), amount }     │  request  │
│       │                                          │           │
│       │    2. show Razorpay checkout              │           │
│       │       with public key + orderId          │           │
│       │                                          │           │
│       │    3. user pays → razorpay_payment_id    │           │
│       │                                          │           │
│       │    4. POST /payments/verify              │           │
│       │ ───────────────────────────────────────▶ │  verifies │
│       │     { orderId, paymentId, signature }    │  signature│
│       │                                          │  with     │
│       │ ◀─────────────────────────────────────── │  secret   │
│       │     { success: true }                    │           │
└───────┘                                          └───────────┘
```

The merchant secret never leaves the backend. Razorpay's signature verification happens server-side.

### Dart implementation (recommended)

```dart
import 'package:razorpay_flutter/razorpay_flutter.dart';

class PaymentService {
  final Razorpay _razorpay = Razorpay();
  final ApiClient _api;

  PaymentService(this._api);

  Future<void> payForOrder({
    required int orderId,
    required int amountInPaise,
  }) async {
    // 1. Ask backend to create a Razorpay order (server-side, uses secret).
    final res = await _api.post('/payments/create-order', body: {
      'order_id':  orderId,
      'amount':    amountInPaise,
      'currency':  'INR',
    });

    final body = res['data'] ?? res['categories']?[0] ?? res;
    final razorpayOrderId = body['razorpay_order_id'] as String;
    final publicKey       = body['key'] as String;   // public key only

    // 2. Open Razorpay checkout with PUBLIC key + order id.
    _razorpay.open({
      'key':       publicKey,
      'order_id':  razorpayOrderId,
      'amount':    amountInPaise,
      'currency':  'INR',
      'name':      'Vayil',
      'description': 'Order #$orderId',
    });

    _razorpay.on(Razorpay.EVENT_PAYMENT_SUCCESS, (PaymentSuccessResponse r) async {
      // 3. Send the result back to the backend for signature verification.
      await _api.post('/payments/verify', body: {
        'razorpay_order_id':   r.orderId,
        'razorpay_payment_id': r.paymentId,
        'razorpay_signature':  r.signature,
      });
      // Backend verifies signature with the secret and updates the order.
    });
  }
}
```

### What NOT to do

```dart
// ❌ WRONG — never do this on mobile
final res = await http.post(
  Uri.parse('https://api.razorpay.com/v1/orders'),
  headers: {'Authorization': 'Basic ${base64Encode(utf8.encode("$keyId:$keySecret"))}'},
  body: {...},
);
```

If your current code looks like this, that's the architectural bug — and the reason `payment_secret` was being requested in `getSettings`. The fix is to move this call into a backend endpoint and have mobile call YOUR backend instead of Razorpay directly.

---

## 7. Endpoint reference

These are the endpoints most likely to need attention. **None of them changed their URL, method, or request body** — only the response envelope (with the dual-shape bridge keeping the old shape alive).

### Authentication & OTP

| Endpoint | Method | Notes |
|---|---|---|
| `/customer/register` | POST | Unchanged. Body: `{ mobile_number }` |
| `/customer/verifyCustomerOTP` | POST | Unchanged. Body: `{ mobile_number, otp, name? }`. Returns `{ token, data: { customer_id, ... }, categories: [...] }` |
| `/customer/logincustomerWithOTP` | POST | Unchanged. Body: `{ mobile_number }` |
| `/customer/verifyLogincustomerOTP` | POST | Unchanged. Body: `{ mobile_number, otp }` |
| `/customer/resendcustomerOTP` | POST | Unchanged |
| `/vendor/register` | POST | Unchanged |
| `/vendor/verifyVendorOTP` | POST | Unchanged. Body: `{ mobile_number, otp, name? }`. Returns `{ token, data: { vendor_id, ... }, categories: [...] }` |
| `/vendor/vendor-login-otp` | POST | Unchanged |
| `/vendor/vendor-login-verify-otp` | POST | Unchanged |
| `/vendor/resendVendorOTP` | POST | Unchanged |

**Dev mode bypass:** Production has `OTP_BYPASS=true` currently. Send any OTP and `123456` is accepted. Flip to `OTP_BYPASS=false` before going live with real users.

### Settings & lookups (now PUBLIC — no auth required)

These were authenticated in earlier v4.5.x and made public in v4.5.26 per your team's request. Bearer token is no longer required.

| Endpoint | Method | Notes |
|---|---|---|
| `/customer/getSettings` | GET, POST | Dual envelope (`data` + `categories`). `payment_secret`/`smtp_password`/`smtp_username` stripped. |
| `/vendor/vendorGetSettings` | GET, POST | Same |
| `/customer/ServiceList` | POST | Category list. Body: optional |
| `/customer/ServiceInfo` | POST | Body: `{ category_id }` |
| `/customer/vendorInfo` | POST | Body: `{ vendor_id }` |
| `/customer/ServiceCategories` | GET, POST | Category lookup |
| `/customer/ServiceSubcategories` | POST | Body: `{ category_id }` |
| `/customer/get_states_by_country_id` | GET | Query: `?country_id=101` |
| `/customer/get_city` | POST | Body: `{ state_id }` |
| `/vendor/getLanguages`, `/vendor/getTools`, `/vendor/listStatus`, `/vendor/listProofTypes` | GET/POST | Master data lookups |
| `/vendor/vendorlistReviews` | POST | Body: `{ vendor_id }` — note: now reads vendor_id from body, not from token, so customers can see vendor reviews pre-login |
| Bare versions (no `/customer` or `/vendor` prefix): `/getLanguages`, `/getTools`, `/getSettings`, `/listProofTypes`, `/listStatus`, `/get_city`, `/get_states_by_country_id`, `/upload_files` | various | Bare-path aliases, same handlers |

### Customer (authenticated)

| Endpoint | Method | Notes |
|---|---|---|
| `/customer/saveCustomerInfo` | POST | Body: `{ name, email, city, address, pincode, profile_image, fcm_token }` |
| `/customer/getCustomerInfo` | GET, POST | Returns profile + customer_id |
| `/customer/sendEnquiry` | POST | Unchanged contract |
| `/customer/enquiryList` | POST | Unchanged |
| `/customer/enquiryDetails` | POST | Body: `{ enquiry_id }` |
| `/customer/getCart` | POST | **Still requires auth.** Per-user cart, can't be public. If you need guest carts, ask backend for a `device_id`-keyed endpoint. |
| `/customer/upload_files` | POST | See [Section 8](#8-multipart-file-uploads) |

### Vendor (authenticated)

| Endpoint | Method | Notes |
|---|---|---|
| `/vendor/step1` … `/vendor/step4` | POST | Onboarding. Unchanged contract |
| `/vendor/saveServiceListing` | POST | Unchanged |
| `/vendor/updateServiceListing` | POST | Unchanged |
| `/vendor/getVendorServiceList` | GET, POST | Unchanged |
| `/vendor/ServiceStatusUpdate` | POST | Body: `{ service_id, status: 0\|1 }` |
| `/vendor/ServiceDetails` | POST | Body: `{ service_id }` |
| `/vendor/upload_files` | POST | See [Section 8](#8-multipart-file-uploads) |

### Admin mutations (NOT public — these stay authenticated)

The following endpoints **will not be made public** even if you ask, because they mutate platform-wide state and would let any user disable categories or auto-approve KYC. Use the admin panel for these:

- `POST /service-category/toggle`
- `POST /service-subcategory/toggle`
- `POST /service-tag/toggle`
- `POST /ProofStatus`
- `POST /vendor/markNotificationRead` (per-user state, no identity without token)

---

## 8. Multipart file uploads

All three upload paths work identically. They accept `multipart/form-data` with the file in either the `file` or `files` field name (multer reads both).

| Endpoint | Auth | Use for |
|---|---|---|
| `POST /customer/upload_files` | soft-auth (customer JWT optional, anonymous OK) | Customer enquiry attachments, customer profile photo |
| `POST /vendor/upload_files` | vendor JWT required | Vendor profile photo, KYC, service gallery |
| `POST /upload_files` (bare) | soft-auth | Either, anonymous OK with guest IP prefix |

### Profile photo uploads — IMPORTANT

If you're uploading a **profile photo**, append `kind=profile` to the multipart body. This opts into server-side validation that matches what the web client enforces:

```
type:          image/jpeg | image/png | image/webp
max byte size: 5 MB
(no resolution constraint)
```

Without `kind=profile`, uploads are accepted up to the multer 15 MB limit with no type check (used for service galleries which take more variety).

### Dart example

```dart
import 'package:dio/dio.dart';

Future<String> uploadProfilePhoto(File image) async {
  final formData = FormData.fromMap({
    'kind': 'profile',
    'file': await MultipartFile.fromFile(image.path, filename: 'avatar.jpg'),
  });

  final res = await dio.post(
    '$kBaseUrl/customer/upload_files',
    data: formData,
    options: Options(headers: {'Authorization': 'Bearer $token'}),
  );

  // Response shape:
  // { success: true, data: [{ url, filename, size, mimetype, ... }], urls: [...] }
  final body = res.data;
  final first = (body['data'] as List).first;
  return first['url'] as String;
}
```

### Validation errors

If the file fails validation, you get a 400 with a human-readable message you can show verbatim:

```json
{ "success": false, "message": "Unsupported image type. Use JPG, PNG, or WebP. (Got \"image/gif\".)" }
{ "success": false, "message": "Image is too large — 8.3 MB. Maximum is 5 MB." }
```

### Saving the URL to the profile

After the upload, save the URL onto the user row via `saveProfile` / `saveCustomerInfo`:

```dart
final url = await uploadProfilePhoto(image);
await dio.put('$kBaseUrl/customers/me', data: { 'profile_image': url });
```

---

## 9. Error response format

Unchanged from the old API — but worth knowing for completeness.

### Success

```json
{ "success": true, "message": "OK", "data": { ... } }
```

### Client error (400/401/403/404/409)

```json
{ "success": false, "message": "Phone is required" }
```

### Server error (500)

```json
{ "success": false, "message": "Internal Server Error (ER_NO_DEFAULT_FOR_FIELD)" }
```

**Note (v4.5.27):** Non-`ApiError` 500s now include the underlying SQL state / error code in parentheses for debuggability. If you see one, please share the full message with us.

### Common status codes

| Status | Meaning |
|---|---|
| 200 | Success |
| 400 | Bad request (missing or invalid body fields) |
| 401 | Missing or invalid token |
| 403 | Token present but wrong role (e.g. customer hitting a vendor endpoint) |
| 404 | Endpoint not found (check the URL) |
| 409 | Conflict (e.g. phone already registered as different role) |
| 429 | Rate-limited (240 req/min/IP global limit) |
| 500 | Server error — share the full message |

---

## 10. Testing checklist

Smoke-test the full app against `https://vayil-web.vercel.app` before shipping:

### Customer flow

- [ ] Register a new customer with a fresh phone number → OTP "sent" → enter `123456` → token received, customer_id present
- [ ] Login existing customer → OTP → token
- [ ] Browse categories (`/customer/ServiceList`)
- [ ] Open a service detail (`/customer/ServiceInfo`)
- [ ] Open a vendor profile (`/customer/vendorInfo`)
- [ ] Send an enquiry (`/customer/sendEnquiry`)
- [ ] View enquiry list and details
- [ ] Update profile (`/customer/saveCustomerInfo`)
- [ ] Upload profile photo (`/customer/upload_files` with `kind=profile`)
- [ ] Place a test order and verify Razorpay flow (use Razorpay test mode)

### Vendor flow

- [ ] Register a new vendor with a fresh phone number → OTP → token, vendor_id present
- [ ] Run onboarding step1 → step4
- [ ] Add a service listing (`/vendor/saveServiceListing`)
- [ ] Update a listing
- [ ] Toggle listing status (`/vendor/ServiceStatusUpdate`)
- [ ] Upload service gallery image (`/vendor/upload_files` without `kind=profile`)
- [ ] Upload vendor profile photo (`/vendor/upload_files` with `kind=profile`)
- [ ] View vendor enquiry list (`/vendor/vendorEnuqiryList`)
- [ ] Submit a quote
- [ ] Read settings (`/vendor/vendorGetSettings`)

### Settings sanity check

Run this from any terminal:

```bash
curl -s https://vayil-web.vercel.app/customer/getSettings | python3 -m json.tool
```

You should see:
- `success: true`
- Both `data: {...}` and `categories: [{...}]` keys at top level
- `payment_key`, `razorpay_key`, `payment_name`, `currency` populated
- `site_logo`, `tax_option`, `smtp_host`, `support_email`, `payout_fee` populated (after v4.5.33)
- **NO** `payment_secret`, `smtp_password`, or `smtp_username` keys anywhere

---

## 11. Migration checklist

Hand this to the dev doing the migration. Each item is a single discrete change.

### Required

- [ ] Update `kBaseUrl` constant to `https://vayil-web.vercel.app`
- [ ] If your `Settings` model class marks `payment_secret`, `smtp_password`, or `smtp_username` as `required` / non-nullable → change to nullable (or remove)
- [ ] Regenerate code-generated JSON models (`build_runner`) if you use freezed / json_annotation
- [ ] If your Razorpay flow calls `api.razorpay.com` directly from the device → move order creation + signature verification to your backend (see Section 6). Use `payment_key` (public) only on the device.
- [ ] Smoke-test the full app per Section 10

### Recommended

- [ ] Consolidate JSON decoders to prefer `json['data']` over `json['categories'][0]` (Section 3)
- [ ] Add `kind=profile` to profile photo multipart uploads (Section 8)
- [ ] Surface the backend's error `message` directly to users for 4xx errors (it's human-readable and actionable)
- [ ] Update internal API docs / Postman collection with the new base URL

### Optional cleanup

- [ ] Remove any code that wrote `payment_secret` / `smtp_password` to local storage
- [ ] Remove SMTP-related code on the mobile side entirely if any exists
- [ ] Add a unit test that asserts your JSON decoder doesn't crash when the three removed fields are absent

---

## 12. FAQ

### Q: We have an existing build on the Play Store. Will it break?

**A:** No, as long as it can hit the new base URL. The dual-shape bridge keeps the old `categories` envelope alive. Push an OTA config update (Remote Config / your own config endpoint) that swaps the base URL, and the old build keeps working. We'll keep the bridge until you confirm every shipped build is updated.

### Q: When will the old `app.vayil.in` URL be turned off?

**A:** It's already not serving the current backend — it's an old deployment. Ping us if you have any traffic still going there and we'll help redirect it.

### Q: Will `payment_secret` ever come back?

**A:** No. It is a Razorpay merchant secret. Exposing it publicly violates Razorpay's terms of service and will cause account revocation. The proper Razorpay integration uses only the public key on the client; the secret stays on the backend. Razorpay's own Flutter SDK is designed exactly for this pattern.

### Q: Some fields are still null (e.g. `meta_title`, `google_analytics_id`).

**A:** These are now populated by an auto-seed script (v4.5.33) on every deploy, BUT some have empty-string defaults (e.g. `google_analytics_id: ""`). If your decoder treats `""` as null, switch to `data?['meta_title']?.toString() ?? 'Vayil'` with a sensible default. If you need a specific value, ping us and we'll seed it.

### Q: We're getting 500 errors. What's the format?

**A:** `{ "success": false, "message": "<readable message> (<SQL state if relevant>)" }`. Send us the full message — v4.5.27 made these informative on purpose so we can debug fast. "Internal Server Error" alone (no parens, no detail) usually means a stale deployment is in flight; wait 60 seconds and retry.

### Q: We're getting CORS errors when running our local dev frontend against vayil-web.vercel.app.

**A:** Production CORS reflects any origin in lenient mode (when `CORS_ORIGIN=*` or unset). If you're seeing `(blocked:csp)` in DevTools, that's a Content Security Policy issue on the page, not CORS — make sure your dev domain has `connect-src 'self' https://vayil-web.vercel.app` in its CSP. Mobile apps (no `Origin` header) are never restricted by CORS.

### Q: Where do I report issues?

**A:** Ping Praga directly with:
1. The exact endpoint URL you called
2. Request body (with secrets redacted)
3. Response body
4. The literal error text shown in your app
5. Your build version (TestFlight / Play Store internal version code)

Without those four pieces we end up guessing, which loses everyone a day.

---

## Appendix A: Quick code snippets

### Generic API client wrapper

```dart
class VayilApi {
  final Dio _dio;
  String? _token;

  VayilApi() : _dio = Dio(BaseOptions(
    baseUrl: ApiConfig.baseUrl,
    connectTimeout: const Duration(seconds: 30),
    receiveTimeout: const Duration(seconds: 30),
  )) {
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) {
        if (_token != null) options.headers['Authorization'] = 'Bearer $_token';
        handler.next(options);
      },
    ));
  }

  void setToken(String token) => _token = token;
  void clearToken() => _token = null;

  /// Returns the canonical response body. Handles both old and new envelopes.
  Future<Map<String, dynamic>> _unwrap(Response res) async {
    final body = res.data as Map<String, dynamic>;
    if (body['success'] == false) {
      throw VayilApiException(body['message'] as String? ?? 'Request failed');
    }
    // Prefer new envelope, fall back to old.
    if (body['data'] is Map) return body['data'] as Map<String, dynamic>;
    final cats = body['categories'];
    if (cats is List && cats.isNotEmpty) return cats.first as Map<String, dynamic>;
    return body;
  }

  Future<Map<String, dynamic>> post(String path, {Map<String, dynamic>? body}) async {
    final res = await _dio.post(path, data: body);
    return _unwrap(res);
  }
}

class VayilApiException implements Exception {
  final String message;
  VayilApiException(this.message);
  @override String toString() => message;
}
```

### Settings fetch

```dart
Future<Settings> getSettings() async {
  final body = await _api.post('/customer/getSettings');
  return Settings(
    siteName:     body['site_name'] as String?,
    siteLogo:     body['site_logo'] as String?,
    paymentKey:   body['payment_key'] as String?,
    paymentName:  body['payment_name'] as String? ?? 'Razorpay',
    currency:     body['currency']    as String? ?? 'INR',
    taxOption:    body['tax_option']  as String?,
    // ... NOTE: no paymentSecret, no smtpPassword, no smtpUsername
  );
}
```

### Login + token storage

```dart
Future<void> loginCustomer({required String mobile, required String otp}) async {
  await _api.post('/customer/logincustomerWithOTP', body: { 'mobile_number': mobile });
  final res = await _api.post('/customer/verifyLogincustomerOTP',
    body: { 'mobile_number': mobile, 'otp': otp });
  // verifyLogincustomerOTP returns the full envelope at top level, not nested,
  // so handle the token at that level:
  // (alternative: read from res.data response directly without _unwrap)
  final token = res['token'] as String;
  _api.setToken(token);
  await secureStorage.write(key: 'vayil_token', value: token);
}
```

---

## Appendix B: Glossary

| Term | Meaning |
|---|---|
| Dual-shape bridge | The v4.5.31 change that emits both `data` and `categories` envelopes on settings responses. Lets old and new clients coexist. |
| `publicSettingsSafe` | Backend helper that strips fields matching `secret` or `password` from settings responses. Protects against future accidental leaks. |
| `kind=profile` | Multipart form field that opts into profile-photo validation (JPG/PNG/WebP, ≤5 MB). |
| `softAuth` | Backend middleware that accepts requests with or without a token, attaching `req.user` if a valid token is sent. Used for endpoints that work better with auth but don't require it. |
| `requireAuth(['vendor'])` | Backend middleware that 403s requests without a valid vendor token. |
| OTP_BYPASS | Env var; when `true`, every phone accepts `123456` as the OTP. On for the demo, **flip off before public launch**. |

---

**Document version:** 1.0 (2026-06-15)
**Targets backend version:** v4.5.33
**Estimated reading time:** 25 minutes
**Estimated implementation time:** 2–3 days for one Flutter dev familiar with the codebase
