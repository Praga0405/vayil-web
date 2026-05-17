-- Prevent duplicate orders for the same enquiry.
--
-- Quote-payment verification materialises an `orders` row from a
-- payment_intent (purpose='quote', enquiry_id=X). A retried verify, a
-- duplicate webhook, or a concurrent request could in principle insert
-- two rows for the same enquiry. We already pre-check in the verify
-- handler; this UNIQUE constraint is the database-level guarantee.
--
-- Idempotent: migrate.ts swallows errno 1061 (Duplicate key name).

ALTER TABLE orders ADD UNIQUE KEY uniq_orders_enquiry (enquiry_id);
