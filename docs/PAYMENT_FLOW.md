# Payment flow

End-to-end money flow for a Vayil project, identical across the web
portal, the customer Flutter app, and the vendor Flutter app.

## Core principle

**Money never moves from the customer's card directly to the vendor's
bank.** Every paisa passes through Vayil's escrow first. The lifecycle
of every payment is:

```
   customer ──Razorpay──► Vayil escrow ──signoff──► vendor_wallet ──payout──► vendor bank
```

The four states a payment can be in:

| `payment_intents.status` | Meaning |
|---|---|
| `initiated`    | Razorpay order created, customer hasn't paid yet |
| `escrow_held`  | Customer paid, Razorpay signature verified, Vayil holds the funds |
| `released`     | Customer signed off / milestone completed; credited to `vendor_wallet` |
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
   ◄─ { intent_id, razorpay_order_id, amount }

2. (Razorpay Checkout opens on the client.)

3. POST /payments/verify                  (or legacy POST /customer/payment_update)
   ─► HMAC-verify razorpay_signature (timingSafeEqual)
   ─► UPDATE payment_intents SET status='escrow_held', razorpay_payment_id, razorpay_signature
   ─► INSERT escrow_ledger { intent_id, order_id, amount, direction='hold', reason=purpose }
   ─► if purpose='quote' AND no orders row yet:
        INSERT orders (customer_id, vendor_id, enquiry_id, amount, status='active')
        backfill payment_intents.order_id + escrow_ledger.order_id
   ─► if purpose='materials':
        UPDATE materials SET status='PAID' WHERE material_id IN (...)
   ◄─ { status:'escrow_held', intent_id }
```

The "backfill order_id" step is critical — without it, `releaseEscrow`
on signoff has no way to find the held intents and the vendor wallet
never gets credited. Added in v4.4.

## Three `purpose` values

| Purpose | When | Server re-derives from |
|---|---|---|
| `quote` | Customer pays the advance after accepting a quote | latest quotation on the enquiry (must be `status='accepted'`) × `calculateTax({baseAmount})` |
| `materials` | Customer pays for selected materials | sum of `materials.total` for the supplied ids (all must be UNPAID/AWAITING_PAYMENT, plan must be approved) |
| `milestone` | Customer pays for a specific completed milestone | `order_plan.amount` for the milestone (must be `customer_status='awaiting_payment'`) |

Each path is implemented in `paymentService.resolveExpectedAmount`.

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

## Release escrow → vendor wallet

```
POST /customers/projects/:id/signoff     (or POST /customer/finalStep)
  ─► INSERT signoffs(rating, comment)
  ─► UPDATE orders SET status='completed'
  ─► UPDATE enquiries SET status='completed' (joined via orders)
  ─► for every payment_intent on this order WHERE status='escrow_held':
       releaseEscrow(intent_id)
         ─► UPDATE payment_intents SET status='released'
         ─► INSERT escrow_ledger { direction='release', reason='milestone_complete' }
         ─► INSERT vendor_wallet ON DUPLICATE KEY UPDATE (ensures row exists)
         ─► UPDATE vendor_wallet
              SET balance       = balance       + intent.amount,
                  total_earning = total_earning + intent.amount
            WHERE vendor_id = ?
```

Both code paths (canonical `routes/customer.ts` and shared
`projectService.signoffOrder`) call `releaseEscrow`. Verified by
`smoke-mobile.ts` step "finalStep" → "vendorPayout 201".

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
A full pass means the payment pipeline + escrow holds + signoff
release + wallet credit + payout request all work end-to-end.
