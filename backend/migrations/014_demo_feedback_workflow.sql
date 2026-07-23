-- Demo-feedback workflow parity:
-- 1) preserve rejected quote history and explicit re-quote lineage;
-- 2) persist customer-vs-vendor material settlement amounts;
-- 3) separate customer project close from staff fund release.

-- TiDB Cloud requires one ADD COLUMN operation per ALTER TABLE. Keeping
-- these statements separate also lets the idempotent migration runner skip
-- only the column that already exists after a partially completed deploy.
ALTER TABLE quotation ADD COLUMN rejection_reason TEXT NULL;
ALTER TABLE quotation ADD COLUMN rejected_at TIMESTAMP NULL;
ALTER TABLE quotation ADD COLUMN quote_version INT NOT NULL DEFAULT 1;

UPDATE quotation
   SET rejected_at = COALESCE(rejected_at, updated_at, created_at)
 WHERE (LOWER(COALESCE(status, '')) = 'rejected' OR status_int = 3)
   AND rejected_at IS NULL;

-- Existing rows remain version 1. New revised quotes receive their version
-- from the last rejected quote in the application transaction.
UPDATE quotation
   SET quote_version = 1
 WHERE quote_version IS NULL OR quote_version < 1;

ALTER TABLE payment_intents ADD COLUMN platform_fee_amount DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE payment_intents ADD COLUMN vendor_payout_amount DECIMAL(12,2) NULL;

UPDATE payment_intents
   SET platform_fee_amount = ROUND(COALESCE(base_amount, amount) * 0.05, 2),
       vendor_payout_amount = GREATEST(
         0,
         COALESCE(base_amount, amount)
           - ROUND(COALESCE(base_amount, amount) * 0.05, 2)
       )
 WHERE purpose = 'materials'
   AND (vendor_payout_amount IS NULL OR vendor_payout_amount = 0);

ALTER TABLE signoffs ADD COLUMN release_status VARCHAR(30) NOT NULL DEFAULT 'released';
ALTER TABLE signoffs ADD COLUMN released_at TIMESTAMP NULL;
ALTER TABLE signoffs ADD COLUMN released_by INT NULL;
ALTER TABLE signoffs ADD COLUMN release_note TEXT NULL;

UPDATE signoffs
   SET release_status = 'released',
       released_at = COALESCE(released_at, created_at)
 WHERE release_status IS NULL OR release_status = '';
