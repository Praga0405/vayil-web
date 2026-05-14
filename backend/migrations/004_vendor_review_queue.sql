-- Vendor review queue — every new vendor signup lands here so the admin
-- panel (Vayil-Admin-Panel-main) can pick it up for manual verification.
--
-- Lifecycle:
--   PENDING  → vendor submitted, awaiting admin review
--   APPROVED → admin marked vendor verified (vendors.status flips to 'verified')
--   REJECTED → admin rejected (vendors.status flips to 'rejected'
--              with rejection_reason populated)
--
-- The web app inserts a row on signup via POST /vendor/submit-for-review.
-- The admin panel consumes /Admin/GetVendorList (which queries vendors
-- with optional status filter) and acts on each row via /Admin/VendorKycUpdate.

CREATE TABLE IF NOT EXISTS vendor_review_queue (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  vendor_id       INT NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  source          VARCHAR(40) DEFAULT 'web_signup',
  submitted_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reviewed_at     TIMESTAMP NULL,
  reviewed_by     INT NULL,
  reviewer_note   TEXT NULL,
  notify_attempts INT DEFAULT 0,
  last_notify_at  TIMESTAMP NULL,
  notify_status   VARCHAR(20) NULL,
  UNIQUE KEY uniq_vendor_open (vendor_id, status),
  INDEX idx_vrq_status (status),
  INDEX idx_vrq_submitted (submitted_at)
);

-- Make sure the vendors table has the columns the admin panel reads.
-- These ALTER statements are idempotent (migrate.ts swallows errno 1060).
ALTER TABLE vendors ADD COLUMN profile_image VARCHAR(500) NULL;
ALTER TABLE vendors ADD COLUMN address       TEXT NULL;
ALTER TABLE vendors ADD COLUMN pincode       VARCHAR(10) NULL;
