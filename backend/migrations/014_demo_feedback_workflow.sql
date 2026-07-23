-- Demo-feedback workflow parity:
-- 1) preserve rejected quote history and explicit re-quote lineage;
-- 2) persist customer-vs-vendor material settlement amounts;
-- 3) separate customer project close from staff fund release.

ALTER TABLE quotation
  ADD COLUMN rejection_reason TEXT NULL,
  ADD COLUMN rejected_at TIMESTAMP NULL,
  ADD COLUMN quote_version INT NOT NULL DEFAULT 1;

UPDATE quotation
   SET rejected_at = COALESCE(rejected_at, updated_at, created_at)
 WHERE (LOWER(COALESCE(status, '')) = 'rejected' OR status_int = 3)
   AND rejected_at IS NULL;

UPDATE quotation q
JOIN (
  SELECT quotation_id,
         ROW_NUMBER() OVER (
           PARTITION BY enquiry_id, COALESCE(vendor_id, 0)
           ORDER BY quotation_id ASC
         ) AS version_number
    FROM quotation
) versions ON versions.quotation_id = q.quotation_id
   SET q.quote_version = versions.version_number;

ALTER TABLE payment_intents
  ADD COLUMN platform_fee_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN vendor_payout_amount DECIMAL(12,2) NULL;

UPDATE payment_intents
   SET platform_fee_amount = ROUND(COALESCE(base_amount, amount) * 0.05, 2),
       vendor_payout_amount = GREATEST(
         0,
         COALESCE(base_amount, amount)
           - ROUND(COALESCE(base_amount, amount) * 0.05, 2)
       )
 WHERE purpose = 'materials'
   AND (vendor_payout_amount IS NULL OR vendor_payout_amount = 0);

ALTER TABLE signoffs
  ADD COLUMN release_status VARCHAR(30) NOT NULL DEFAULT 'released',
  ADD COLUMN released_at TIMESTAMP NULL,
  ADD COLUMN released_by INT NULL,
  ADD COLUMN release_note TEXT NULL;

UPDATE signoffs
   SET release_status = 'released',
       released_at = COALESCE(released_at, created_at)
 WHERE release_status IS NULL OR release_status = '';
