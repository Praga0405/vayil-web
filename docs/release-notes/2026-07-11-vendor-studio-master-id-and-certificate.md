# 2026-07-11 - Vendor Studio master ID and certificate fixes

## Why

The mobile team confirmed that the old `app.vayil.in` vendor onboarding Step 1 contract expects the website to save vendor business profile values using the legacy request field names:

```json
{
  "company_name": "Blaz",
  "full_name": "Blazingcoders",
  "state": "4035",
  "city": "1174",
  "pincode": "641301",
  "address": "test",
  "profile_photo_url": "url"
}
```

For the customer app, `state` and `city` must be the State Master and City Master IDs stored in the vendor row. If the website only keeps UI-only `state_id` / `city_id` values or fails to populate city options, customer service discovery can miss services created by that vendor.

The team also reported that Vendor Studio service category options were not reliably loading and the Add/Edit Service pages did not expose Certificate/License upload/update, even though the mobile service response includes `certificate_url`.

## Root Cause

- `/vendor-studio/listing` was reading only a narrow set of response shapes for state and city. The production-compatible APIs can return state rows under `states_list` and city rows under `city`.
- The Business Profile form stored web form fields as `state_id` and `city_id`, but the old `/step1` persistence contract writes the selected master IDs through `state` and `city`.
- The Business Profile page did not submit the full legacy Step 1 payload fields (`full_name`, `pincode`, `address`, `profile_photo_url`) used by the app.vayil.in contract.
- Service add/edit category loaders needed to tolerate existing response envelopes such as named arrays, `data`, and `result`.
- Service edit had no certificate upload/replace UI, so vendors could not update `certificate_url` from the website.
- Service image helpers were keeping only one image in some edit flows instead of preserving the legacy comma-separated `service_image` list expected by the mobile-compatible service response.

## What Changed

- Updated `/vendor-studio/listing` Business Profile hydration to read:
  - `state || state_id`
  - `city || city_id`
  - `states_list || data || result`
  - `city || data || result`
- Updated Business Profile save to call the existing legacy `/vendor/step1` API with the app.vayil.in-compatible fields:
  - `company_name`
  - `full_name`
  - `email` / `email_id`
  - `about` from the description field
  - `address`
  - `pincode`
  - `profile_photo_url`
  - `state` as the selected State Master ID
  - `city` as the selected City Master ID
- Added profile photo upload on Business Profile. The uploaded URL is normalized from the existing upload response and submitted as `profile_photo_url`.
- Confirmed Add Service category/tag/subcategory loaders normalize the existing API response shapes and Add Service saves `certificate_url`.
- Updated Edit Service to:
  - load category/subcategory values from both new and legacy fields (`category_id/service_category`, `subcategory_id/service_subcategory`)
  - preserve existing certificate state
  - upload and replace Certificate/License via `certificate_url`
  - send legacy aliases (`service_category`, `service_subcategory`, `pricing_type`, `unit_name`) along with the existing fields
  - continue using `updateServiceListing`, avoiding duplicate service creation
- Updated shared service compatibility helpers so service edit preserves all image URLs as a legacy comma-separated `service_image` payload while still sending `images`, `thumbnail`, and `service_image_url` for compatibility.

## Impact

- Vendor Business Profile State and City dropdowns should hydrate from saved vendor data and city options should load after state selection.
- Saving Business Profile stores State Master ID and City Master ID into the vendor profile through the same field names used by the old mobile `/step1` API.
- Customer app service listing/search can use the vendor's stored city/state IDs to find services added from the website.
- Vendor Studio Add/Edit Service can now include Certificate/License data via `certificate_url`, so the mobile-compatible service response has the expected certificate field.
- Service category, subcategory, and tag dropdowns are more tolerant of production response-envelope differences.
- Service edit preserves image lists better for mobile response parity.

## Verification

Local verification passed before pushing the code changes:

```bash
npm run build --workspace backend
npm run build
git diff --check -- src/app/vendor-studio/listing/page.tsx src/app/vendor-studio/services/add/page.tsx src/app/vendor-studio/services/[id]/page.tsx backend/src/routes/legacyVendor.ts RELEASE_NOTES.md
```

Notes:

- The local Git object store is damaged and cannot create a normal local commit (`fatal: unable to read tree ...`). Code changes were pushed with the GitHub connector instead.
- Normal `git ls-remote` also failed from the sandbox with DNS resolution errors for `github.com`, so this focused release note was added as a separate Git-tracked file rather than replacing the very large top-level `RELEASE_NOTES.md` blob through the connector.

## Commits

- `e8eda62` - Business Profile Step 1 master ID/profile payload fix
- `0c1755f` - Legacy service image payload preservation
- `2aab9e8` - Edit Service certificate update support
