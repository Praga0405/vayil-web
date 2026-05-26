-- 003_mobile_compatibility_tables.sql
--
-- Mobile-app compatibility tables + the full set of metadata columns
-- the Flutter customer/vendor apps populate. Idempotent throughout —
-- every CREATE uses IF NOT EXISTS and every ALTER relies on
-- migrate.ts swallowing errno 1060 (duplicate column) + 1061 (dup key).
--
-- Filename sorts before 003_seed_tagging.sql alphabetically; the
-- ALTERs in both files target different columns and are safe to run
-- in either order.

/* ═══════════════════════════════════════════════════════════
 *  TABLES
 * ═══════════════════════════════════════════════════════════ */

CREATE TABLE IF NOT EXISTS customer_cart (
  cart_id      INT AUTO_INCREMENT PRIMARY KEY,
  customer_id  INT NOT NULL,
  vendor_id    INT NULL,
  service_id   INT NULL,
  service_title VARCHAR(255) NULL,
  quantity     INT DEFAULT 1,
  price        DECIMAL(12,2) DEFAULT 0,
  metadata     JSON NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX (customer_id), INDEX (vendor_id), INDEX (service_id)
);

CREATE TABLE IF NOT EXISTS customer_reviews (
  review_id    INT AUTO_INCREMENT PRIMARY KEY,
  customer_id  INT NOT NULL,
  vendor_id    INT NOT NULL,
  order_id     INT NULL,
  rating       TINYINT NOT NULL,
  title        VARCHAR(150) NULL,
  comment      TEXT NULL,
  status       VARCHAR(30) DEFAULT 'visible',
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (vendor_id), INDEX (customer_id), INDEX (order_id),
  UNIQUE KEY uniq_review_per_order (customer_id, order_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  notification_id INT AUTO_INCREMENT PRIMARY KEY,
  recipient_type  ENUM('customer','vendor','staff') NOT NULL,
  recipient_id    INT NOT NULL,
  type            VARCHAR(60) NOT NULL,
  title           VARCHAR(200) NOT NULL,
  body            TEXT NULL,
  data            JSON NULL,
  is_read         BOOLEAN DEFAULT false,
  read_at         TIMESTAMP NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (recipient_type, recipient_id, is_read, created_at)
);

CREATE TABLE IF NOT EXISTS bank_details (
  bank_id       INT AUTO_INCREMENT PRIMARY KEY,
  vendor_id     INT NOT NULL,
  account_holder VARCHAR(150) NOT NULL,
  account_number VARCHAR(40)  NOT NULL,
  ifsc_code      VARCHAR(20)  NOT NULL,
  bank_name      VARCHAR(150) NULL,
  branch         VARCHAR(150) NULL,
  upi_id         VARCHAR(150) NULL,
  is_primary     BOOLEAN DEFAULT true,
  status         ENUM('active','pending_edit','rejected') DEFAULT 'active',
  edit_requested_at TIMESTAMP NULL,
  edit_payload   JSON NULL,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX (vendor_id)
);

CREATE TABLE IF NOT EXISTS payout_requests (
  payout_id    INT AUTO_INCREMENT PRIMARY KEY,
  vendor_id    INT NOT NULL,
  bank_id      INT NULL,
  amount       DECIMAL(12,2) NOT NULL,
  status       ENUM('requested','approved','rejected','paid','failed') DEFAULT 'requested',
  reference    VARCHAR(120) NULL,
  note         TEXT NULL,
  requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP NULL,
  INDEX (vendor_id, status)
);

/* ═══════════════════════════════════════════════════════════
 *  COLUMN ADDITIONS — customers
 * ═══════════════════════════════════════════════════════════ */
ALTER TABLE customers ADD COLUMN pincode       VARCHAR(10) NULL;
ALTER TABLE customers ADD COLUMN profile_image VARCHAR(500) NULL;
ALTER TABLE customers ADD COLUMN fcm_token     VARCHAR(500) NULL;

/* ═══════════════════════════════════════════════════════════
 *  COLUMN ADDITIONS — vendors
 *  (Some columns may already exist from 001 or 004 — duplicate-
 *  column errors are swallowed by migrate.ts.)
 * ═══════════════════════════════════════════════════════════ */
ALTER TABLE vendors ADD COLUMN address             TEXT NULL;
ALTER TABLE vendors ADD COLUMN pincode             VARCHAR(10) NULL;
ALTER TABLE vendors ADD COLUMN profile_image       VARCHAR(500) NULL;
ALTER TABLE vendors ADD COLUMN about               TEXT NULL;
ALTER TABLE vendors ADD COLUMN experience_years    INT NULL;
ALTER TABLE vendors ADD COLUMN proof_type          VARCHAR(80) NULL;
ALTER TABLE vendors ADD COLUMN proof_number        VARCHAR(100) NULL;
ALTER TABLE vendors ADD COLUMN kyc_document_url    TEXT NULL;
ALTER TABLE vendors ADD COLUMN fcm_token           VARCHAR(500) NULL;
ALTER TABLE vendors ADD COLUMN owner_name          VARCHAR(150) NULL;
ALTER TABLE vendors ADD COLUMN onboarding_metadata JSON NULL;

/* ═══════════════════════════════════════════════════════════
 *  COLUMN ADDITIONS — vendor_services
 * ═══════════════════════════════════════════════════════════ */
ALTER TABLE vendor_services ADD COLUMN subcategory_id INT NULL;
ALTER TABLE vendor_services ADD COLUMN thumbnail      VARCHAR(500) NULL;
ALTER TABLE vendor_services ADD COLUMN tag_ids        JSON NULL;
ALTER TABLE vendor_services ADD COLUMN image_urls     JSON NULL;
ALTER TABLE vendor_services ADD COLUMN portfolio_urls JSON NULL;
ALTER TABLE vendor_services ADD COLUMN metadata       JSON NULL;

/* ═══════════════════════════════════════════════════════════
 *  COLUMN ADDITIONS — enquiries
 * ═══════════════════════════════════════════════════════════ */
ALTER TABLE enquiries ADD COLUMN budget          DECIMAL(12,2) NULL;
ALTER TABLE enquiries ADD COLUMN location_lat    DECIMAL(10,6) NULL;
ALTER TABLE enquiries ADD COLUMN location_lng    DECIMAL(10,6) NULL;
ALTER TABLE enquiries ADD COLUMN preferred_date  DATE NULL;
ALTER TABLE enquiries ADD COLUMN accepted_at     TIMESTAMP NULL;
ALTER TABLE enquiries ADD COLUMN rejected_at     TIMESTAMP NULL;
ALTER TABLE enquiries ADD COLUMN reject_reason   TEXT NULL;
ALTER TABLE enquiries ADD COLUMN metadata        JSON NULL;
ALTER TABLE enquiries ADD COLUMN attachment_urls JSON NULL;

/* ═══════════════════════════════════════════════════════════
 *  COLUMN ADDITIONS — quotation
 *  (estimated_days + valid_until already exist in 001 schema —
 *  ADD will fail with errno 1060 which the runner swallows.)
 * ═══════════════════════════════════════════════════════════ */
ALTER TABLE quotation ADD COLUMN estimated_days  INT NULL;
ALTER TABLE quotation ADD COLUMN valid_until     DATE NULL;
ALTER TABLE quotation ADD COLUMN advance_amount  DECIMAL(12,2) NULL;
ALTER TABLE quotation ADD COLUMN attachment_urls JSON NULL;
ALTER TABLE quotation ADD COLUMN subtotal        DECIMAL(12,2) NULL;
ALTER TABLE quotation ADD COLUMN platform_fee    DECIMAL(12,2) NULL;
ALTER TABLE quotation ADD COLUMN gst             DECIMAL(12,2) NULL;
ALTER TABLE quotation ADD COLUMN total           DECIMAL(12,2) NULL;
ALTER TABLE quotation ADD COLUMN gst_amount      DECIMAL(12,2) NULL;
