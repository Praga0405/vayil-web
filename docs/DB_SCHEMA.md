# Database schema

MySQL 8 / Aurora-MySQL compatible. Every migration is idempotent — the
runner (`backend/scripts/migrate.ts`) swallows errno **1060** (duplicate
column), **1061** (duplicate key), and **1091** (drop non-existent), so
the same file can be applied repeatedly without error.

## Migration files

| File | Adds |
|---|---|
| `001_complete_schema.sql` | Base tables: `customers`, `vendors`, `enquiries`, `quotation`, `orders`, `order_plan`, `payment_log`, `vendor_wallet`, `vendor_transactions`, `disputes`, `staff`, `roles`, `settings`, `otp_codes`, `service_categories` / `_subcategories` / `_tags`, `vendor_services` |
| `002_prd_workflow_tables.sql` | PRD §10 workflow: `payment_intents`, `escrow_ledger`, `materials`, `plan_submissions`, `signoffs`, `rework_requests`, `milestone_updates`, `webhook_deliveries`, `idempotency_keys` + ALTERs on `order_plan` and `enquiries` |
| `003_mobile_compatibility_tables.sql` | Mobile-app parity: `customer_cart`, `customer_reviews`, `notifications`, `bank_details`, `payout_requests` + metadata column additions on `customers`, `vendors`, `vendor_services`, `enquiries`, `quotation` |
| `003_seed_tagging.sql` | `seed_source VARCHAR(60)` nullable column on every table touched by the marketplace seed script (so demo rows can be purged by tag) |
| `004_vendor_review_queue.sql` | `vendor_review_queue` table + notify delivery columns |
| `005_orders_enquiry_unique.sql` | `UNIQUE KEY (enquiry_id)` on `orders` (prevents duplicate orders per accepted quote) |

The two files named `003_*` coexist intentionally — they touch
disjoint columns and the migrate runner sorts alphabetically
(`003_mobile…` runs before `003_seed…`). Either order works.

## Table reference

### Identity

```
customers
  customer_id PK, name, phone, mobile, email, city, address,
  pincode, profile_image, fcm_token, status, created_at,
  seed_source

vendors
  vendor_id PK, name, company_name, owner_name, phone, mobile, email,
  city, address, pincode, about, experience_years,
  status (pending/kyc_submitted/verified/rejected/active/inactive),
  proof_type, proof_number, kyc_document_url, kyc_approved_at,
  rejection_reason, rating, is_gst_registered, gst_number,
  onboarded_date, rebate_active, profile_image, fcm_token,
  onboarding_metadata, created_at, seed_source

staff           (staff JWT users — ops console)
roles, staff_roles  (RBAC)

otp_codes
  id PK, phone, purpose (customer_login/vendor_login/...),
  otp_hash (SHA-256), expires_at, consumed, created_at
```

### Marketplace browse

```
service_categories
service_subcategories  (FK category_id)
service_tags

vendor_services
  vendor_service_id PK, vendor_id, category_id, subcategory_id,
  title, description, price, unit, status, thumbnail,
  tag_ids (JSON), image_urls (JSON), portfolio_urls (JSON),
  metadata (JSON), created_at, seed_source
```

### Funnel + workflow

```
enquiries
  enquiry_id PK, customer_id, vendor_id, service_id, category,
  description, location, email,
  budget, location_lat, location_lng, preferred_date,
  status (new/accepted/quoted/rejected/active/completed),
  accepted_at, rejected_at, reject_reason,
  metadata (JSON), attachment_urls (JSON),
  created_at, seed_source

quotation
  quotation_id PK, enquiry_id, vendor_id, amount, message,
  estimated_days, valid_until, advance_amount,
  subtotal, platform_fee, gst, gst_amount, total,
  attachment_urls (JSON),
  status (sent/accepted/rejected), created_at, seed_source

orders
  order_id PK, customer_id, vendor_id, enquiry_id, quotation_id,
  amount, status (active/completed/cancelled),
  UNIQUE KEY(enquiry_id), created_at, seed_source

order_plan                                  ← per-milestone state machine
  plan_id PK, order_id, title, description, amount, days,
  percentage (sum across order MUST = 100 at submit time),
  mandatory,
  vendor_status   (draft/submitted/in_progress/completed),
  customer_status (pending/approved/revision_requested/
                   awaiting_payment/paid),
  revision_reason, updated_at, created_at, seed_source

plan_submissions
  submission_id PK, order_id, version (auto-incremented per order),
  status (submitted/approved/revision_requested),
  submitted_at, reviewed_at, reviewer_note

materials
  material_id PK, order_id, name, quantity, unit, rate, total,
  status (UNPAID/AWAITING_PAYMENT/PAID), created_at

milestone_updates
  update_id PK, plan_id, vendor_id, comment, image_urls (JSON),
  created_at
```

### Money

```
payment_intents
  intent_id PK, idempotency_key, customer_id, order_id, enquiry_id,
  milestone_id, material_ids (JSON),
  amount, currency, purpose (quote/milestone/materials),
  status (initiated/escrow_held/released/failed/cancelled),
  razorpay_order_id, razorpay_payment_id, razorpay_signature,
  failure_reason, created_at

escrow_ledger                               ← audit trail; balances
  entry_id PK, intent_id, order_id, vendor_id, amount,
  direction (hold/release/refund), reason, created_at

vendor_wallet
  vendor_id PK, balance, total_earning, updated_at

vendor_transactions   (legacy; replaced by escrow_ledger in v4+)

webhook_deliveries
  id PK, provider, event_id, event_type, payload, signature,
  status (received/invalid/processed), processed_at, created_at

idempotency_keys
  key PK, response_json, status_code, created_at

payment_log           (legacy — preserved for back-compat reads)
```

### Mobile-parity tables (migration 003_mobile_*)

```
customer_cart
  cart_id PK, customer_id, vendor_id, service_id, service_title,
  quantity, price, metadata (JSON), created_at, updated_at

customer_reviews
  review_id PK, customer_id, vendor_id, order_id, rating, title,
  comment, status (visible/hidden),
  UNIQUE KEY (customer_id, order_id),    ← one review per job
  created_at

notifications
  notification_id PK,
  recipient_type ENUM('customer','vendor','staff'),
  recipient_id, type, title, body, data (JSON),
  is_read, read_at, created_at,
  INDEX (recipient_type, recipient_id, is_read, created_at)

bank_details
  bank_id PK, vendor_id, account_holder, account_number,
  ifsc_code, bank_name, branch, upi_id, is_primary,
  status ENUM('active','pending_edit','rejected'),
  edit_requested_at, edit_payload (JSON), created_at, updated_at

payout_requests
  payout_id PK, vendor_id, bank_id, amount,
  status ENUM('requested','approved','rejected','paid','failed'),
  reference, note, requested_at, processed_at
```

### Admin queue + signoff/rework

```
vendor_review_queue   (vendors pending KYC review)
signoffs              (one row per signed-off order)
rework_requests       (customer-initiated rework after signoff)
disputes              (manual dispute ticketing)
support_tickets + support_messages
crm_notes
```

## Foreign-key conventions

The schema **does not** define hard FK constraints between most tables
(MySQL's strict-mode quirks + the seed/unseed workflow make them more
trouble than they're worth at the current scale). Ownership is
enforced at the route handler level by explicit `WHERE ... AND
customer_id = :id` / `vendor_id = :id` predicates.

Indexes are added on every column used as a foreign reference
(`customer_id`, `vendor_id`, `enquiry_id`, `order_id`, etc.) so joins
stay fast.

## Charset

All tables default to `utf8mb4` (the database connection uses
`mysql2/promise` which defaults to utf8mb4 on connect). Indian Rupee
glyph, em-dashes, emoji etc. round-trip cleanly.

## Backups / safe operations

- `npm run unseed:marketplace` — deletes every row tagged
  `seed_source='vayil-demo-v1'` from the seeded tables. Never touches
  real customer/vendor/payment data.
- Production backups: rely on Render's built-in MySQL snapshot (or
  PlanetScale / RDS automated backups). Schema is idempotent so a
  re-migrate after a restore is a no-op.
