-- 010_vendor_kyc_status_align.sql
--
-- v4.5.50 — Vendor KYC mobile compatibility.
--
-- Migration 006 converted vendors.status to an ENUM that does not include
-- the legacy submission value `kyc_submitted`. The current submission flow
-- now writes `pending_approval`, but production may still contain the strict
-- enum. Convert status back to VARCHAR so admin/vendor status aliases cannot
-- produce WARN_DATA_TRUNCATED, and widen mobile KYC image columns for S3 URLs.

UPDATE vendors SET status = 'pending_approval' WHERE status = 'kyc_submitted';
UPDATE vendors SET kyc_status = 'not_submitted'
 WHERE kyc_status IS NULL
    OR kyc_status NOT IN ('not_submitted','pending','approved','rejected');

ALTER TABLE vendors MODIFY COLUMN status VARCHAR(40) NOT NULL DEFAULT 'pending';
ALTER TABLE vendors MODIFY COLUMN kyc_status ENUM('not_submitted','pending','approved','rejected') NOT NULL DEFAULT 'not_submitted';
ALTER TABLE vendors MODIFY COLUMN kyc_id_type VARCHAR(80) NULL;
ALTER TABLE vendors MODIFY COLUMN kyc_id_number VARCHAR(100) NULL;
ALTER TABLE vendors MODIFY COLUMN kyc_id_image TEXT NULL;
ALTER TABLE vendors MODIFY COLUMN kyc_selfie TEXT NULL;
ALTER TABLE vendors MODIFY COLUMN profile_photo TEXT NULL;
