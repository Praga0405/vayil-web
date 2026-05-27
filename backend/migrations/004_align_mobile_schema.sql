-- 004_align_mobile_schema.sql
--
-- v4.5 schema alignment with the mobile team's reference DB
-- (vayil-Dump20260527.sql). Every statement is idempotent — the
-- migrate.ts runner swallows errno 1060 (duplicate column) + 1061
-- (duplicate key); CREATE TABLE uses IF NOT EXISTS.
--
-- Strategy: COEXIST. We keep our existing column/table names AND add
-- the mobile team's names. Services dual-write the rows that matter
-- for cross-client reads (cart, reviews, materials). Mobile clients
-- can read/write directly against their column names; web clients
-- continue to work without any frontend changes (adapters absorb the
-- rename — see Phase 5).
--
-- Filename sorts after 003_* so this runs last and is safe to apply
-- on top of any earlier migration state.

/* ═══════════════════════════════════════════════════════════
 *  PHASE 1 — column aliases on existing tables
 * ═══════════════════════════════════════════════════════════ */

/* ─── customers ─────────────────────────────────────────────
 * Mobile uses `id` (we have `customer_id`), `profile_photo`,
 * `ph_code`, OTP columns on the row (we use the otp_codes table). */
ALTER TABLE customers ADD COLUMN id INT NULL UNIQUE;
ALTER TABLE customers ADD COLUMN ph_code VARCHAR(10) DEFAULT '+91';
ALTER TABLE customers ADD COLUMN state VARCHAR(45) NULL;
ALTER TABLE customers ADD COLUMN profile_photo VARCHAR(500) NULL;
ALTER TABLE customers ADD COLUMN device_id LONGTEXT NULL;
ALTER TABLE customers ADD COLUMN otp VARCHAR(6) NULL;
ALTER TABLE customers ADD COLUMN otp_expires_at DATETIME NULL;
ALTER TABLE customers ADD COLUMN otp_attempts INT DEFAULT 0;
ALTER TABLE customers ADD COLUMN last_otp_sent_at DATETIME NULL;
ALTER TABLE customers ADD COLUMN terms_accept TINYINT(1) DEFAULT 1;
ALTER TABLE customers ADD COLUMN is_deleted TINYINT(1) DEFAULT 0;
-- Backfill: mirror customer_id → id for existing rows.
UPDATE customers SET id = customer_id WHERE id IS NULL;
UPDATE customers SET profile_photo = profile_image WHERE profile_photo IS NULL AND profile_image IS NOT NULL;

/* ─── vendors ─────────────────────────────────────────────── */
ALTER TABLE vendors ADD COLUMN id INT NULL UNIQUE;
ALTER TABLE vendors ADD COLUMN ph_code VARCHAR(10) DEFAULT '+91';
ALTER TABLE vendors ADD COLUMN full_name VARCHAR(255) NULL;
ALTER TABLE vendors ADD COLUMN state VARCHAR(100) NULL;
ALTER TABLE vendors ADD COLUMN profile_photo VARCHAR(500) NULL;
ALTER TABLE vendors ADD COLUMN service_tag MEDIUMTEXT NULL;
ALTER TABLE vendors ADD COLUMN service_category VARCHAR(100) NULL;
ALTER TABLE vendors ADD COLUMN sub_service VARCHAR(255) NULL;
ALTER TABLE vendors ADD COLUMN years_of_experience INT NULL;
ALTER TABLE vendors ADD COLUMN short_bio TEXT NULL;
ALTER TABLE vendors ADD COLUMN languages LONGTEXT NULL;
ALTER TABLE vendors ADD COLUMN area_of_service LONGTEXT NULL;
ALTER TABLE vendors ADD COLUMN working_hours_from TEXT NULL;
ALTER TABLE vendors ADD COLUMN working_hours_to TEXT NULL;
ALTER TABLE vendors ADD COLUMN willing_to_travel TINYINT(1) DEFAULT 0;
ALTER TABLE vendors ADD COLUMN tools_available TEXT NULL;
ALTER TABLE vendors ADD COLUMN certifications LONGTEXT NULL;
ALTER TABLE vendors ADD COLUMN kyc_id_type VARCHAR(50) NULL;
ALTER TABLE vendors ADD COLUMN kyc_id_number VARCHAR(50) NULL;
ALTER TABLE vendors ADD COLUMN kyc_id_image VARCHAR(500) NULL;
ALTER TABLE vendors ADD COLUMN kyc_selfie VARCHAR(500) NULL;
ALTER TABLE vendors ADD COLUMN kyc_status VARCHAR(40) DEFAULT 'not_submitted';
ALTER TABLE vendors ADD COLUMN kyc_submitted_at DATETIME NULL;
ALTER TABLE vendors ADD COLUMN kyc_verified_at DATETIME NULL;
ALTER TABLE vendors ADD COLUMN device_id LONGTEXT NULL;
ALTER TABLE vendors ADD COLUMN otp VARCHAR(6) NULL;
ALTER TABLE vendors ADD COLUMN otp_expires_at DATETIME NULL;
ALTER TABLE vendors ADD COLUMN otp_attempts INT DEFAULT 0;
ALTER TABLE vendors ADD COLUMN last_otp_sent_at DATETIME NULL;
ALTER TABLE vendors ADD COLUMN accept_enquires TINYINT DEFAULT 1;
ALTER TABLE vendors ADD COLUMN terms_accept TINYINT(1) DEFAULT 1;
ALTER TABLE vendors ADD COLUMN is_deleted TINYINT(1) DEFAULT 0;
UPDATE vendors SET id = vendor_id WHERE id IS NULL;
UPDATE vendors SET profile_photo = profile_image WHERE profile_photo IS NULL AND profile_image IS NOT NULL;
UPDATE vendors SET short_bio = about WHERE short_bio IS NULL AND about IS NOT NULL;
UPDATE vendors SET years_of_experience = experience_years WHERE years_of_experience IS NULL AND experience_years IS NOT NULL;
UPDATE vendors SET full_name = owner_name WHERE full_name IS NULL AND owner_name IS NOT NULL;
UPDATE vendors SET kyc_id_type = proof_type WHERE kyc_id_type IS NULL AND proof_type IS NOT NULL;
UPDATE vendors SET kyc_id_number = proof_number WHERE kyc_id_number IS NULL AND proof_number IS NOT NULL;
UPDATE vendors SET kyc_id_image = kyc_document_url WHERE kyc_id_image IS NULL AND kyc_document_url IS NOT NULL;

/* ─── enquiries ─────────────────────────────────────────── */
ALTER TABLE enquiries ADD COLUMN id INT NULL UNIQUE;
ALTER TABLE enquiries ADD COLUMN first_name VARCHAR(255) NULL;
ALTER TABLE enquiries ADD COLUMN last_name VARCHAR(255) NULL;
ALTER TABLE enquiries ADD COLUMN phone TEXT NULL;
ALTER TABLE enquiries ADD COLUMN files LONGTEXT NULL;
ALTER TABLE enquiries ADD COLUMN service_id INT NULL;
ALTER TABLE enquiries ADD COLUMN message LONGTEXT NULL;
UPDATE enquiries SET id = enquiry_id WHERE id IS NULL;
UPDATE enquiries SET message = description WHERE message IS NULL AND description IS NOT NULL;
UPDATE enquiries SET files = attachment_urls WHERE files IS NULL AND attachment_urls IS NOT NULL;

/* ─── orders ─────────────────────────────────────────────── */
ALTER TABLE orders ADD COLUMN id INT NULL UNIQUE;
ALTER TABLE orders ADD COLUMN quote_id INT NULL;
ALTER TABLE orders ADD COLUMN service_id INT NULL;
ALTER TABLE orders ADD COLUMN message LONGTEXT NULL;
ALTER TABLE orders ADD COLUMN files LONGTEXT NULL;
ALTER TABLE orders ADD COLUMN order_amount VARCHAR(255) NULL;
ALTER TABLE orders ADD COLUMN currency VARCHAR(45) DEFAULT 'INR';
ALTER TABLE orders ADD COLUMN payment_id TEXT NULL;
ALTER TABLE orders ADD COLUMN payment_json LONGTEXT NULL;
ALTER TABLE orders ADD COLUMN payment_status VARCHAR(45) NULL;
UPDATE orders SET id = order_id WHERE id IS NULL;
UPDATE orders SET quote_id = quotation_id WHERE quote_id IS NULL AND quotation_id IS NOT NULL;
UPDATE orders SET order_amount = CAST(amount AS CHAR) WHERE order_amount IS NULL AND amount IS NOT NULL;

/* ─── quotation ─────────────────────────────────────────── */
ALTER TABLE quotation ADD COLUMN id INT NULL UNIQUE;
ALTER TABLE quotation ADD COLUMN parent_id INT NULL;
ALTER TABLE quotation ADD COLUMN sender_role ENUM('CUSTOMER','VENDOR') NULL;
ALTER TABLE quotation ADD COLUMN customer_id INT NULL;
ALTER TABLE quotation ADD COLUMN sender_id INT NULL;
ALTER TABLE quotation ADD COLUMN receiver_id INT NULL;
ALTER TABLE quotation ADD COLUMN service_id INT NULL;
ALTER TABLE quotation ADD COLUMN first_name VARCHAR(255) NULL;
ALTER TABLE quotation ADD COLUMN last_name VARCHAR(255) NULL;
ALTER TABLE quotation ADD COLUMN email VARCHAR(100) NULL;
ALTER TABLE quotation ADD COLUMN phone TEXT NULL;
ALTER TABLE quotation ADD COLUMN files LONGTEXT NULL;
ALTER TABLE quotation ADD COLUMN q_tax TEXT NULL;
ALTER TABLE quotation ADD COLUMN q_tax_cost DECIMAL(10,2) NULL;
ALTER TABLE quotation ADD COLUMN q_convenience_cost DECIMAL(10,2) NULL;
ALTER TABLE quotation ADD COLUMN q_platform_cost DECIMAL(10,2) NULL;
ALTER TABLE quotation ADD COLUMN final_amount DECIMAL(10,2) NULL;
ALTER TABLE quotation ADD COLUMN service_time VARCHAR(45) NULL;
UPDATE quotation SET id = quotation_id WHERE id IS NULL;
UPDATE quotation SET q_tax_cost = gst_amount WHERE q_tax_cost IS NULL AND gst_amount IS NOT NULL;
UPDATE quotation SET q_platform_cost = platform_fee WHERE q_platform_cost IS NULL AND platform_fee IS NOT NULL;
UPDATE quotation SET final_amount = total WHERE final_amount IS NULL AND total IS NOT NULL;
-- Derive customer_id by joining enquiries
UPDATE quotation q JOIN enquiries e ON e.enquiry_id = q.enquiry_id SET q.customer_id = e.customer_id WHERE q.customer_id IS NULL;

/* ─── order_plan ─────────────────────────────────────────── */
ALTER TABLE order_plan ADD COLUMN id INT NULL UNIQUE;
ALTER TABLE order_plan ADD COLUMN completion_days VARCHAR(45) NULL;
ALTER TABLE order_plan ADD COLUMN amount_percentage INT NULL;
ALTER TABLE order_plan ADD COLUMN balance_cost DECIMAL(10,2) NULL;
ALTER TABLE order_plan ADD COLUMN update_photo LONGTEXT NULL;
ALTER TABLE order_plan ADD COLUMN update_comments LONGTEXT NULL;
UPDATE order_plan SET id = plan_id WHERE id IS NULL;
UPDATE order_plan SET amount_percentage = percentage WHERE amount_percentage IS NULL AND percentage IS NOT NULL;
UPDATE order_plan SET completion_days = CAST(days AS CHAR) WHERE completion_days IS NULL AND days IS NOT NULL;

/* ─── vendor_services ───────────────────────────────────── */
ALTER TABLE vendor_services ADD COLUMN id INT NULL UNIQUE;
ALTER TABLE vendor_services ADD COLUMN service_title VARCHAR(255) NULL;
ALTER TABLE vendor_services ADD COLUMN service_category VARCHAR(100) NULL;
ALTER TABLE vendor_services ADD COLUMN service_subcategory VARCHAR(100) NULL;
ALTER TABLE vendor_services ADD COLUMN pricing_type ENUM('fixed','per_unit','quote') NULL;
ALTER TABLE vendor_services ADD COLUMN unit_name VARCHAR(100) NULL;
ALTER TABLE vendor_services ADD COLUMN service_image LONGTEXT NULL;
ALTER TABLE vendor_services ADD COLUMN certificate_url LONGTEXT NULL;
ALTER TABLE vendor_services ADD COLUMN is_active TINYINT(1) DEFAULT 0;
ALTER TABLE vendor_services ADD COLUMN show_review TINYINT(1) DEFAULT 1;
ALTER TABLE vendor_services ADD COLUMN minimum_fee DECIMAL(10,2) NULL;
ALTER TABLE vendor_services ADD COLUMN is_deleted TINYINT(1) DEFAULT 0;
UPDATE vendor_services SET id = vendor_service_id WHERE id IS NULL;
UPDATE vendor_services SET service_title = title WHERE service_title IS NULL AND title IS NOT NULL;

/* ─── bank_details ──────────────────────────────────────── */
ALTER TABLE bank_details ADD COLUMN pan_number VARCHAR(20) NULL;
ALTER TABLE bank_details ADD COLUMN swift_code VARCHAR(20) NULL;

/* ─── vendor_wallet ─────────────────────────────────────── */
ALTER TABLE vendor_wallet ADD COLUMN total_payout DECIMAL(10,2) DEFAULT 0;

/* ─── vendor_transactions ───────────────────────────────── */
ALTER TABLE vendor_transactions ADD COLUMN balance_after DECIMAL(10,2) DEFAULT 0;
ALTER TABLE vendor_transactions ADD COLUMN payout_fee DECIMAL(10,2) NULL;
ALTER TABLE vendor_transactions ADD COLUMN reference_id VARCHAR(255) NULL;
ALTER TABLE vendor_transactions ADD COLUMN description LONGTEXT NULL;

/* ─── service taxonomy tables (mobile uses id / slug / is_active / is_deleted)
 *  Our existing tables use category_id / icon / status — keep both. */
ALTER TABLE service_categories ADD COLUMN id INT NULL UNIQUE;
ALTER TABLE service_categories ADD COLUMN slug VARCHAR(100) NULL;
ALTER TABLE service_categories ADD COLUMN icon_url VARCHAR(255) NULL;
ALTER TABLE service_categories ADD COLUMN is_active TINYINT(1) DEFAULT 1;
ALTER TABLE service_categories ADD COLUMN is_deleted TINYINT(1) DEFAULT 0;
UPDATE service_categories SET id = category_id WHERE id IS NULL;
UPDATE service_categories SET slug = LOWER(REPLACE(name, ' ', '-')) WHERE slug IS NULL;
UPDATE service_categories SET icon_url = icon WHERE icon_url IS NULL AND icon IS NOT NULL;
UPDATE service_categories SET is_active = status WHERE is_active IS NULL OR is_active = 1;

ALTER TABLE service_subcategories ADD COLUMN id INT NULL UNIQUE;
ALTER TABLE service_subcategories ADD COLUMN slug VARCHAR(150) NULL;
ALTER TABLE service_subcategories ADD COLUMN is_active TINYINT(1) DEFAULT 1;
ALTER TABLE service_subcategories ADD COLUMN is_deleted TINYINT(1) DEFAULT 0;
UPDATE service_subcategories SET id = subcategory_id WHERE id IS NULL;
UPDATE service_subcategories SET slug = LOWER(REPLACE(name, ' ', '-')) WHERE slug IS NULL;

ALTER TABLE service_tags ADD COLUMN id INT NULL UNIQUE;
ALTER TABLE service_tags ADD COLUMN is_active TINYINT(1) DEFAULT 1;
ALTER TABLE service_tags ADD COLUMN is_deleted TINYINT(1) DEFAULT 0;
UPDATE service_tags SET id = tag_id WHERE id IS NULL;

/* ─── settings (mobile reference is different shape) ───── */
ALTER TABLE settings ADD COLUMN site_name VARCHAR(150) NULL;
ALTER TABLE settings ADD COLUMN site_logo VARCHAR(255) NULL;
ALTER TABLE settings ADD COLUMN convenience_fee_percentage DECIMAL(10,2) DEFAULT 0;
ALTER TABLE settings ADD COLUMN platform_fee DECIMAL(10,2) DEFAULT 0;
ALTER TABLE settings ADD COLUMN payout_fee DECIMAL(10,2) NULL;
ALTER TABLE settings ADD COLUMN payment_name VARCHAR(255) NULL;
ALTER TABLE settings ADD COLUMN payment_key LONGTEXT NULL;
ALTER TABLE settings ADD COLUMN payment_secret LONGTEXT NULL;
ALTER TABLE settings ADD COLUMN tax_option LONGTEXT NULL;
ALTER TABLE settings ADD COLUMN smtp_host VARCHAR(150) NULL;
ALTER TABLE settings ADD COLUMN smtp_port INT NULL;
ALTER TABLE settings ADD COLUMN smtp_username VARCHAR(150) NULL;
ALTER TABLE settings ADD COLUMN smtp_password VARCHAR(255) NULL;
ALTER TABLE settings ADD COLUMN smtp_encryption ENUM('tls','ssl') DEFAULT 'tls';
ALTER TABLE settings ADD COLUMN smtp_from_email VARCHAR(150) NULL;
ALTER TABLE settings ADD COLUMN smtp_from_name VARCHAR(150) NULL;
ALTER TABLE settings ADD COLUMN site_url TEXT NULL;
ALTER TABLE settings ADD COLUMN support_email TEXT NULL;
ALTER TABLE settings ADD COLUMN meta_title TEXT NULL;
ALTER TABLE settings ADD COLUMN meta_description MEDIUMTEXT NULL;
ALTER TABLE settings ADD COLUMN google_analytics_id TEXT NULL;
-- Seed the mobile-shape fee columns from our existing percentage cols
UPDATE settings SET platform_fee = platform_fee_percentage WHERE platform_fee = 0 AND platform_fee_percentage IS NOT NULL;
UPDATE settings SET site_name = 'Vayil' WHERE site_name IS NULL;

/* ═══════════════════════════════════════════════════════════
 *  PHASE 2 — new tables (CREATE IF NOT EXISTS)
 * ═══════════════════════════════════════════════════════════ */

CREATE TABLE IF NOT EXISTS cart (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL DEFAULT 0,
  vendor_id INT NOT NULL,
  service_id INT NOT NULL,
  status TINYINT NOT NULL DEFAULT 1 COMMENT '1 in cart, 2 ordered, 3 deleted',
  device_id LONGTEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL
);

CREATE TABLE IF NOT EXISTS customer_review (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id INT NULL,
  customer_id INT NOT NULL,
  vendor_id INT NOT NULL,
  service_id INT NOT NULL DEFAULT 0,
  rating INT NOT NULL,
  review_description LONGTEXT NULL,
  status TINYINT NOT NULL DEFAULT 1 COMMENT '1 active, 0 inactive',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  INDEX (vendor_id), INDEX (customer_id), INDEX (order_id)
);

CREATE TABLE IF NOT EXISTS order_plan_materials (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  plan_id INT NULL,
  title VARCHAR(255) NULL,
  unit_type VARCHAR(50) NULL,
  qty VARCHAR(50) NULL,
  unit_cost DECIMAL(10,2) NULL,
  total_cost DECIMAL(10,2) NULL,
  balance_cost DECIMAL(10,2) NULL,
  m_tax TEXT NULL,
  m_tax_cost DECIMAL(10,2) NULL,
  m_platform_cost DECIMAL(10,2) NULL,
  m_convenience_cost DECIMAL(10,2) NULL,
  m_final_amount DECIMAL(10,2) NULL,
  payment_status TEXT NULL,
  status TEXT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX (order_id), INDEX (plan_id)
);

CREATE TABLE IF NOT EXISTS order_step_logs (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  step INT NOT NULL,
  step_status VARCHAR(255) NULL,
  performed_by ENUM('CUSTOMER','VENDOR','SYSTEM') NOT NULL,
  performed_by_id INT NULL,
  remarks VARCHAR(255) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  INDEX (order_id), INDEX (step)
);

CREATE TABLE IF NOT EXISTS platform_transactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(10,2) NOT NULL COMMENT 'Total platform earning (platform fee + convenience fee + GST)',
  description VARCHAR(255) NULL,
  transaction_type ENUM('credit','debit') DEFAULT 'credit',
  reference_id VARCHAR(100) NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX (order_id)
);

CREATE TABLE IF NOT EXISTS master_proof_types (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  proof_name VARCHAR(255) NOT NULL,
  status TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_deleted TINYINT(1) DEFAULT 0,
  UNIQUE KEY uniq_proof (proof_name)
);
INSERT IGNORE INTO master_proof_types (proof_name) VALUES
  ('Aadhaar Card'), ('PAN Card'), ('Driving License'), ('Passport'),
  ('Voter ID'), ('Trade License'), ('GST Registration');

CREATE TABLE IF NOT EXISTS status_master (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  status_name VARCHAR(100) NOT NULL,
  is_active TINYINT DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  is_deleted TINYINT DEFAULT 0
);
INSERT IGNORE INTO status_master (status_name) VALUES
  ('pending'), ('accepted'), ('quoted'), ('rejected'), ('paid'),
  ('active'), ('in_progress'), ('completed'), ('cancelled'),
  ('refunded'), ('disputed'), ('awaiting_payment');

CREATE TABLE IF NOT EXISTS tools_master (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tool_name VARCHAR(150) NOT NULL,
  tool_slug VARCHAR(180) NOT NULL,
  description TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  status TINYINT(1) DEFAULT 1,
  is_deleted TINYINT(1) DEFAULT 0,
  UNIQUE KEY (tool_slug)
);

CREATE TABLE IF NOT EXISTS languages (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  language_name VARCHAR(100) NOT NULL,
  status TINYINT DEFAULT 1,
  is_deleted TINYINT DEFAULT 0
);
INSERT IGNORE INTO languages (language_name) VALUES
  ('English'), ('Hindi'), ('Tamil'), ('Telugu'), ('Kannada'),
  ('Malayalam'), ('Marathi'), ('Bengali'), ('Gujarati'), ('Punjabi'),
  ('Urdu'), ('Odia'), ('Assamese');

CREATE TABLE IF NOT EXISTS states (
  id MEDIUMINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  country_id MEDIUMINT UNSIGNED DEFAULT NULL,
  country_code CHAR(2) DEFAULT 'IN',
  state_code VARCHAR(45) NULL,
  status TINYINT NOT NULL DEFAULT 1,
  is_deleted TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP NULL DEFAULT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
INSERT IGNORE INTO states (id, name, country_id, country_code, state_code) VALUES
  (1, 'Tamil Nadu', 101, 'IN', 'TN'),
  (2, 'Karnataka',  101, 'IN', 'KA'),
  (3, 'Maharashtra',101, 'IN', 'MH'),
  (4, 'Kerala',     101, 'IN', 'KL'),
  (5, 'Telangana',  101, 'IN', 'TG'),
  (6, 'Delhi',      101, 'IN', 'DL'),
  (7, 'Gujarat',    101, 'IN', 'GJ'),
  (8, 'West Bengal',101, 'IN', 'WB'),
  (9, 'Rajasthan',  101, 'IN', 'RJ'),
  (10,'Uttar Pradesh', 101, 'IN', 'UP');

CREATE TABLE IF NOT EXISTS city (
  city_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  city_name VARCHAR(125) NOT NULL,
  city_state VARCHAR(200) NOT NULL,
  city_state_id INT DEFAULT 0,
  status TINYINT(1) DEFAULT 1,
  is_deleted TINYINT(1) DEFAULT 0
);
INSERT IGNORE INTO city (city_name, city_state, city_state_id) VALUES
  ('Coimbatore', 'Tamil Nadu', 1), ('Chennai', 'Tamil Nadu', 1),
  ('Madurai', 'Tamil Nadu', 1), ('Salem', 'Tamil Nadu', 1),
  ('Bengaluru', 'Karnataka', 2), ('Mysore', 'Karnataka', 2),
  ('Mumbai', 'Maharashtra', 3), ('Pune', 'Maharashtra', 3),
  ('Kochi', 'Kerala', 4), ('Thiruvananthapuram', 'Kerala', 4),
  ('Hyderabad', 'Telangana', 5), ('New Delhi', 'Delhi', 6);

CREATE TABLE IF NOT EXISTS admins (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NULL,
  email VARCHAR(100) NULL,
  password VARCHAR(255) NULL,
  role VARCHAR(50) DEFAULT 'admin',
  status ENUM('active','inactive') DEFAULT 'active',
  last_login DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY (email)
);
-- Bootstrap default admin if none exists. Password is bcrypt of "Admin@123".
INSERT IGNORE INTO admins (id, name, email, password, role) VALUES
  (1, 'Vayil Admin', 'admin@vayil.in',
   '$2a$10$X8qC1H3T4r6P9k7M9pZ1q.5R5o3jQ8wEf3J1B4cV4Z9Sg9pL.U1Vu',
   'super_admin');
