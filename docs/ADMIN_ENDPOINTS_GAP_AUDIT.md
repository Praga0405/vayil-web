# Admin Endpoints Gap Audit — `/Admin/*` (old app.vayil.in vs new vayil-web.vercel.app)

**Date:** 2026-06-19
**Inputs:** Vayil-Backend-main 12 April.zip (old backend source) + current `backend/src/routes/adminMobile.ts`
**Scope:** The 74 admin-namespaced endpoints in `route.ts` — used by the React admin panel at `Praga0405/Vayil-Admin-Panel-main`. NOT used by the mobile (Flutter) apps.

---

## Summary

| | Count |
|---|---|
| Old `/Admin/*` endpoints | 74 |
| Found in new `adminMobile.ts` | 51 |
| **Missing from new backend** | **23** |

Coverage is **69%** — meaningfully lower than the mobile coverage (98%).

---

## The 23 missing /Admin/* endpoints

Grouped by functional area:

### 1. Dashboard & lookups (4)
| Method | Path | Handler | Priority |
|---|---|---|---|
| GET | `/Admin/Dashboardoverview` | `AdminDashboard` | **HIGH** — main admin landing page |
| GET | `/Admin/get_currency` | `AdmingetCurrencyList` | LOW — INR-only fallback works |
| GET | `/Admin/get_states_by_country_id` | `AdmingetStateListByCountryID` | MEDIUM — needed for admin location pickers |
| GET | `/Admin/listStatus` | `AdminlistStatus` | MEDIUM |

### 2. Vendor management (5)
| Method | Path | Handler | Priority |
|---|---|---|---|
| POST | `/Admin/GetVendorList` | `AdmingetVendorList` | **HIGH** — admin vendor list view |
| POST | `/Admin/VendorDetails` | `AdmingetVendorById` | **HIGH** — admin vendor detail page |
| POST | `/Admin/VendorStatusUpdate` | `AdminVendorStatusUpdate` | **HIGH** — approve/suspend vendor |
| POST | `/Admin/VendorKycUpdate` | `AdminVendorKycUpdate` | **HIGH** — KYC approval workflow |
| POST | `/Admin/VendorDelete` | `AdminVendorDelete` | MEDIUM |
| POST | `/Admin/saveVendor` | `AdminsaveVendor` | MEDIUM — admin creates vendor manually |

### 3. Service listing management (4)
| Method | Path | Handler | Priority |
|---|---|---|---|
| POST | `/Admin/SaveServiceListing` | `AdminsaveServiceListing` | **HIGH** |
| POST | `/Admin/UpdateServiceListing` | `AdminupdateServiceListing` | **HIGH** |
| POST | `/Admin/ServiceStatusUpdate` | `AdminServiceStatusUpdate` | **HIGH** — toggle listing active/inactive |
| POST | `/Admin/ServiceDelete` | `AdminServiceDelete` | MEDIUM |

### 4. Tool / status master data CRUD (5)
| Method | Path | Handler | Priority |
|---|---|---|---|
| POST | `/Admin/CreateTool` | `AdminCreateTool` | MEDIUM |
| POST | `/Admin/UpdateTool` | `AdminUpdateTool` | MEDIUM |
| POST | `/Admin/DeleteTool` | `AdminDeleteTool` | MEDIUM |
| POST | `/Admin/GetToolDetails` | `AdminGetToolDetails` | MEDIUM |
| POST | `/Admin/addStatus` | `AdminaddStatus` | LOW |
| POST | `/Admin/editStatus` | `AdmineditStatus` | LOW |
| POST | `/Admin/DeleteStatus` | `AdminDeleteStatus` | LOW |

### 5. Geographic master data (1)
| Method | Path | Handler | Priority |
|---|---|---|---|
| POST | `/Admin/get_states` | `AdmingetStateList` | LOW — covered by get_states_by_country_id |

### 6. Banking (1)
| Method | Path | Handler | Priority |
|---|---|---|---|
| POST | `/Admin/UpdateBankStatus` | `UpdateBankStatus` | MEDIUM — admin approves vendor bank changes |

---

## Decision matrix

| Bucket | Endpoints | Total estimated effort | Recommended action |
|---|---|---|---|
| HIGH priority — admin can't work without these | 10 | ~3 hours | Implement before re-engaging admin panel team |
| MEDIUM priority — admin works but missing features | 9 | ~2 hours | Implement when admin team reports |
| LOW priority — workarounds exist | 4 | ~30 min | Skip until needed |

---

## Why this gap exists

The new backend (`vayil-web/backend/src/routes/adminMobile.ts`) was built to support a specific subset of admin operations (login, CRUD on masters that the canonical admin panel uses). The old backend had 74 admin endpoints because over time, admin-only flows accumulated for KYC, vendor approval, listing moderation, tool management, etc. Many of those weren't ported in the initial rewrite.

---

## What to do next

This depends on whether the admin panel (`Praga0405/Vayil-Admin-Panel-main`) is:

1. **Still using `app.vayil.in`** — then nothing is broken right now, but the same migration that's hitting mobile will hit admin when its base URL flips. Implement the 10 HIGH-priority endpoints before that flip.

2. **Already pointed at `vayil-web.vercel.app`** — then 23 admin operations are silently broken right now. Implement HIGH-priority endpoints urgently, others as reported.

3. **Being deprecated entirely in favour of something new** — skip implementation, but document the gap so nobody is surprised.

I recommend asking the admin-panel developer the question above. The implementation work itself is straightforward (~5 hours total for all 23) but the priority depends on the answer.

---

## Out of scope for this audit

This audit only covers URL/method/handler-name parity. It does NOT verify response shapes for the 51 endpoints that DO exist — those could have the same kind of `{success, message, data}` vs old-flat-shape mismatch we found on the mobile side. A response-shape audit on /Admin/* would be a separate ~2-hour task if anyone reports admin-side rendering issues.
