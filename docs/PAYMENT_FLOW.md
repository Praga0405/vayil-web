# Payment flow

End-to-end money flow for a Vayil project, identical across the web
portal, the customer Flutter app, and the vendor Flutter app.

## Core principle

**Money never moves from the customer's card directly to the vendor's
bank.** Every paisa passes through Vayil's escrow first. The lifecycle
of every payment is:

```
   customer ──Razorpay──► Vayil escrow ──admin release──► vendor_wallet ──payout──► vendor bank
```

The four states a payment can be in:

| `payment_intents.status` | Meaning |
|---|---|
| `initiated`    | Razorpay order created, customer hasn't paid yet |
| `escrow_held`  | Customer paid, Razorpay signature verified, Vayil holds the funds |
| `released`     | Staff approved the customer-closed project; net settlement credited to `vendor_wallet` |
| `failed` / `cancelled` | Razorpay reported failure or customer closed the modal |

Every state transition writes an `escrow_ledger` row so the audit trail
is reconstructible from `escrow_ledger` alone.

## The two-call protocol (every payment, every client)

```
1. POST /payments/create-order            (or legacy POST /customer/placeOrder)
   ─► server re-derives expected total from DB + tax service
   ─► refuses mismatched client amount (≤ ₹1 tolerance)
   ─► INSERT payment_intents (status='initiated')
   ─► Razorpay Orders.create               (or dev fallback order_dev_…)
   ◄─ { intent_id, razorpay_order_id, amount, base_amount, quotation_id, payment_option }

2. (Razorpay Checkout opens on the client.)

3. POST /payments/verify                  (or legacy POST /customer/payment_update)
   ─► HMAC-verify razorpay_signature (timingSafeEqual)
   ─► UPDATE payment_intents SET status='escrow_held', razorpay_payment_id, razorpay_signature
   ─► INSERT escrow_ledger { intent_id, order_id, amount, direction='hold', reason=purpose }
   ─► if purpose='quote':
        UPSERT orders using the full accepted quote as orders.amount
        INSERT step 1 / CUSTOMER / "Order placed" when absent
        backfill payment_intents.order_id + escrow_ledger order/vendor IDs
   ─► if purpose='materials':
        UPDATE materials SET status='PAID' WHERE material_id IN (...)
   ◄─ { status:'escrow_held', intent_id }
```

The "backfill order_id" step is critical — without it, the staff release
cannot find the held intents and the vendor wallet never gets credited.
Added in v4.4; customer close and staff release were separated in v4.5.103.

## Three `purpose` values

| Purpose | When | Server re-derives from |
|---|---|---|
| `quote` | Customer pays full, configured minimum/25%, or a valid custom amount after accepting a quote | the explicitly supplied accepted `quotation_id`; `base_amount` is validated against `payment_option`, then fees are calculated server-side |
| `materials` | Customer pays for selected materials | sum of `materials.total` for the supplied ids (all must be UNPAID/AWAITING_PAYMENT, plan must be approved). Customer total equals this subtotal; the configured marketplace fee is persisted as a vendor-side deduction. |
| `milestone` | Customer pays for a specific completed milestone | `order_plan.amount` for the milestone (must be `customer_status='awaiting_payment'`) |

Each path is implemented in `paymentService.resolveExpectedAmount`.

### Quote payment options

Quote checkout sends these additional compatibility fields:

| Field | Meaning |
|---|---|
| `quotation_id` | Exact accepted quote being paid. Rejected/newer sibling quotes cannot replace it. |
| `payment_option` | `full`, `minimum`, or `custom`. Defaults to `full` for older clients. |
| `base_amount` | Project amount selected before platform fee and GST. Full must equal `quotation.amount`; minimum uses a valid `advance_amount` or 25%; custom must be within minimum and full. |

`payment_intents.amount` remains the Razorpay gateway total. The new
`payment_intents.base_amount` stores the project portion so partial-payment
progress and remaining-plan calculations do not include platform fee/GST.
`orders.amount` always stores the complete accepted quote amount, even when
the first payment is only an advance.

Browser verification and the `payment.captured` webhook call the same
transactional materialization function. This guarantees the order, escrow
link, accepted quote, and mobile step-1 record are created whether the browser
handler completes or Razorpay's webhook is the recovery path.

## Server-derived totals

```ts
calculateTax({ baseAmount: 4500 })
// → {
//     baseAmount:       4500,
//     platformFee:       225,   //  5% of base
//     premiumFee:          0,
//     gstOnPlatformFee:   41,   // 18% of platformFee
//     gstOnProject:        0,   // unless vendor is GST-registered
//     tdsOnVendor:        45,   //  1% of base, deducted from vendor payout
//     vendorNetPayout:  4230,   // base - platformFee - tdsOnVendor
//     customerTotal:    4766    // what the customer pays Razorpay
//   }
```

The customer is charged `customerTotal`. The vendor eventually
receives `vendorNetPayout` (the gap funds Vayil's commission + TDS
to the government).

## Razorpay webhook (server-to-server safety net)

```
POST /payments/webhooks/razorpay     ← mounted BEFORE express.json()
                                       so the raw body survives HMAC verify
```

- Verifies `x-razorpay-signature` with `RAZORPAY_WEBHOOK_SECRET`.
- Persists every payload into `webhook_deliveries` (audit log).
- On `payment.captured`: if the matching intent isn't already
  `escrow_held` (browser left before `/verify` ran), transitions it
  here.
- On `payment.failed`: marks the intent `failed` with the error
  message.

## Customer close and staff escrow release

Customer closure and money movement are separate audited actions.

```
Vendor completes every milestone
  ─► order_step_logs step 4 = complete
  ─► orders.status = 'awaiting_customer_close'

POST /customer/projects/:id/signoff
  ─► require rating 1..5
  ─► require every milestone completed
  ─► UPSERT signoffs { release_status='awaiting_release' }
  ─► UPSERT customer review in web + mobile review tables
  ─► orders.status = 'awaiting_release'
  ─► no wallet or escrow mutation

POST /Admin/fund-releases/:orderId/release   (staff/admin JWT)
  ─► require signoffs.release_status='awaiting_release'
  ─► for every held intent, atomically transition to 'released'
  ─► quote/milestone: release existing intent amount
  ─► materials: release persisted vendor_payout_amount
  ─► INSERT escrow_ledger release row
  ─► credit vendor_wallet once
  ─► INSERT idempotent vendor/platform ledger mirrors
  ─► signoffs.release_status='released'
  ─► orders.status='completed'
```

For material intents, the customer pays only the material subtotal. The
platform fee is stored in `platform_fee_amount` and deducted from
`vendor_payout_amount`; it is not added to the Razorpay customer total.

The legacy mobile `/customer/finalStep` endpoint remains a mobile-compatible
progress update. It does not create an extra signoff step and does not perform
the protected admin release.

## Idempotency

Every state-mutating POST takes an `Idempotency-Key` header (or
`idempotency_key` body field on multipart).

- The first call runs the handler and stores `(key → response, status)`
  in `idempotency_keys`.
- Replays return the cached response with the original status code,
  **without re-running side effects**.

This protects against double-tap on mobile (Razorpay Checkout
closing/reopening) and against retry storms during a network blip.

## Razorpay key management

| Env var | Purpose | Required in prod |
|---|---|---|
| `RAZORPAY_KEY_ID` | Public key sent to the client | yes |
| `RAZORPAY_KEY_SECRET` | Server-side, used to create orders + verify signatures | yes |
| `RAZORPAY_WEBHOOK_SECRET` | Separate secret for webhook payload HMAC | yes |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` (frontend) | Mirrored to the public key | yes |
| `PAYMENT_VERIFY_BYPASS` | When `true`, accepts any non-empty signature. Smoke tests + local dev only. Logs a warning on first use. | NEVER true in prod |

If `RAZORPAY_KEY_SECRET` is unset, signature verify falls back to
"accept any non-empty signature" (same effect as bypass). The bypass
prints a warning to stderr exactly once per process so it cannot
silently land in production.

## Smoke test coverage

`backend/scripts/smoke-mobile.ts` exercises the full sequence:

```
placeOrder → payment_update → orderDetails → createPlan →
updatePlanStatus → addPlanMaterial → editPlanMaterial → AskPyament →
AddBankDetails → finalStep → vendorPayout → addReview → vendorlistReviews
```

It runs against the local backend with `PAYMENT_VERIFY_BYPASS=true`.
A full pass validates the mobile payment pipeline and escrow holds. The
v4.5.103 staff-only release must additionally be smoke-tested through
`/Admin/fund-releases/:orderId/release` with a staff JWT.
