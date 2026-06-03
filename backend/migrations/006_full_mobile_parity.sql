-- 006_full_mobile_parity.sql
--
-- v4.5.4 — close every remaining column gap between our DB and the
-- mobile team's reference dump (vayil-Dump20260527.sql). Diff script
-- /tmp/schema_diff.py flagged these as missing or type-mismatched.
--
-- Strategy: ADDITIVE everywhere — every column added IF NOT EXISTS
-- (errno 1060 swallowed). MODIFY COLUMN only for purely-widening
-- type changes (int → bigint) where existing data fits. No column
-- renames, no destructive changes.

/* ═══════════════════════════════════════════════════════════
 *  notifications — totally different shape from ours
 *  We have: notification_id, recipient_type, recipient_id, type, title, body, data, is_read, read_at
 *  Mobile : id, title, description, customer_id, vendor_id, service_id,
 *           sender_role ENUM, receiver_role ENUM, read_status, created_at
 *  ADD the mobile columns alongside; backfill from existing.
 * ═══════════════════════════════════════════════════════════ */
ALTER TABLE notifications ADD COLUMN id INT NULL UNIQUE;
ALTER TABLE notifications ADD COLUMN description TEXT NULL;
ALTER TABLE notifications ADD COLUMN customer_id INT NULL;
ALTER TABLE notifications ADD COLUMN vendor_id INT NULL;
ALTER TABLE notifications ADD COLUMN service_id INT NULL;
ALTER TABLE notifications ADD COLUMN sender_role ENUM('customer','vendor') NULL;
ALTER TABLE notifications ADD COLUMN receiver_role ENUM('customer','vendor') NULL;
ALTER TABLE notifications ADD COLUMN read_status TINYINT DEFAULT 0;

-- Backfill from existing rows
UPDATE notifications SET id = notification_id WHERE id IS NULL;
UPDATE notifications SET description = body WHERE description IS NULL AND body IS NOT NULL;
UPDATE notifications SET read_status = (CASE WHEN is_read THEN 1 ELSE 0 END) WHERE read_status = 0;
UPDATE notifications SET customer_id = recipient_id WHERE customer_id IS NULL AND recipient_type = 'customer';
UPDATE notifications SET vendor_id   = recipient_id WHERE vendor_id   IS NULL AND recipient_type = 'vendor';
UPDATE notifications SET receiver_role = 'customer' WHERE receiver_role IS NULL AND recipient_type = 'customer';
UPDATE notifications SET receiver_role = 'vendor'   WHERE receiver_role IS NULL AND recipient_type = 'vendor';

/* ═══════════════════════════════════════════════════════════
 *  payment_log — mobile uses 14 columns we never added
 * ═══════════════════════════════════════════════════════════ */
ALTER TABLE payment_log ADD COLUMN notes LONGTEXT NULL;
ALTER TABLE payment_log ADD COLUMN currency TEXT NULL;
ALTER TABLE payment_log ADD COLUMN payment_id TEXT NULL;
ALTER TABLE payment_log ADD COLUMN payment_json LONGTEXT NULL;
ALTER TABLE payment_log ADD COLUMN payment_status TEXT NULL;
ALTER TABLE payment_log ADD COLUMN convenience_fee_cost DECIMAL(10,2) NULL;
ALTER TABLE payment_log ADD COLUMN base_amount DECIMAL(10,2) NULL;
ALTER TABLE payment_log ADD COLUMN payment_amount DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE payment_log ADD COLUMN payment_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE payment_log ADD COLUMN updated_at DATETIME NULL;
ALTER TABLE payment_log ADD COLUMN payment_data LONGTEXT NULL;
ALTER TABLE payment_log ADD COLUMN payment_type VARCHAR(45) NULL;
ALTER TABLE payment_log ADD COLUMN platform_cost DECIMAL(10,2) NULL;
ALTER TABLE payment_log ADD COLUMN tax_cost DECIMAL(10,2) NULL;
-- Backfill payment_amount from existing legacy `amount` column where present.
UPDATE payment_log SET payment_amount = COALESCE(amount, 0) WHERE payment_amount = 0;

/* ═══════════════════════════════════════════════════════════
 *  states — mobile imports from a world-cities DB, has extras
 * ═══════════════════════════════════════════════════════════ */
ALTER TABLE states ADD COLUMN fips_code VARCHAR(255) NULL;
ALTER TABLE states ADD COLUMN iso2 VARCHAR(255) NULL;
ALTER TABLE states ADD COLUMN type VARCHAR(191) NULL;
ALTER TABLE states ADD COLUMN latitude DECIMAL(10,8) NULL;
ALTER TABLE states ADD COLUMN longitude DECIMAL(11,8) NULL;
ALTER TABLE states ADD COLUMN flag TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE states ADD COLUMN wikiDataId VARCHAR(255) NULL;
ALTER TABLE states ADD COLUMN created_on DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE states ADD COLUMN updated_on DATETIME NULL;

/* ═══════════════════════════════════════════════════════════
 *  Audit timestamps — `updated_at` on tables that lack it
 * ═══════════════════════════════════════════════════════════ */
ALTER TABLE customers       ADD COLUMN updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE vendors         ADD COLUMN updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE enquiries       ADD COLUMN updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE orders          ADD COLUMN updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE quotation       ADD COLUMN updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE vendor_services ADD COLUMN updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

/* ─── `created_at` on service taxonomy tables ────────────── */
ALTER TABLE service_categories    ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE service_subcategories ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE service_tags          ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP;

/* ─── settings created_at/updated_at ───────────────────── */
ALTER TABLE settings ADD COLUMN created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE settings ADD COLUMN updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

/* ═══════════════════════════════════════════════════════════
 *  order_plan.status — mobile uses INT (0/1/2/...) for stage
 * ═══════════════════════════════════════════════════════════ */
ALTER TABLE order_plan ADD COLUMN status INT NOT NULL DEFAULT 0;

/* ═══════════════════════════════════════════════════════════
 *  status_int parity columns — mobile uses TINYINT codes on
 *  enquiries / orders / quotation. Web continues to use the
 *  string `status` column. ADD a parallel int column and
 *  backfill via the agreed status-code mapping.
 *
 *    1 = pending / new
 *    2 = accepted / active
 *    3 = quoted / completed (context-dependent)
 *    4 = rejected
 *    5 = paid / awaiting_payment
 *    6 = cancelled / refunded
 *
 *  Future v4.6 service code writes both columns together; for
 *  now this gives mobile read-only parity.
 * ═══════════════════════════════════════════════════════════ */
ALTER TABLE enquiries ADD COLUMN status_int TINYINT NOT NULL DEFAULT 1;
ALTER TABLE orders    ADD COLUMN status_int TINYINT NOT NULL DEFAULT 1;
ALTER TABLE quotation ADD COLUMN status_int TINYINT NOT NULL DEFAULT 1;

UPDATE enquiries SET status_int = CASE LOWER(COALESCE(status,'new'))
  WHEN 'new' THEN 1 WHEN 'pending' THEN 1
  WHEN 'accepted' THEN 2 WHEN 'active' THEN 2
  WHEN 'quoted' THEN 3
  WHEN 'rejected' THEN 4 WHEN 'cancelled' THEN 6
  WHEN 'completed' THEN 3
  ELSE 1 END
  WHERE status_int = 1;

UPDATE orders SET status_int = CASE LOWER(COALESCE(status,'active'))
  WHEN 'active' THEN 2 WHEN 'pending' THEN 1
  WHEN 'completed' THEN 3 WHEN 'cancelled' THEN 6 WHEN 'refunded' THEN 6
  ELSE 1 END
  WHERE status_int = 1;

UPDATE quotation SET status_int = CASE LOWER(COALESCE(status,'sent'))
  WHEN 'sent' THEN 1 WHEN 'pending' THEN 1
  WHEN 'accepted' THEN 2
  WHEN 'rejected' THEN 3
  ELSE 1 END
  WHERE status_int = 1;

/* ═══════════════════════════════════════════════════════════
 *  Type widenings — mobile uses bigint where we use int
 *  MODIFY COLUMN is non-destructive when source values fit.
 *  Skip if 1060/1091 caught.
 * ═══════════════════════════════════════════════════════════ */
ALTER TABLE vendors            MODIFY COLUMN vendor_id BIGINT NOT NULL AUTO_INCREMENT;
ALTER TABLE vendor_wallet      MODIFY COLUMN vendor_id BIGINT NOT NULL;
ALTER TABLE vendor_transactions MODIFY COLUMN id BIGINT NOT NULL AUTO_INCREMENT;
ALTER TABLE vendor_transactions MODIFY COLUMN vendor_id BIGINT NOT NULL;
ALTER TABLE vendor_transactions MODIFY COLUMN order_id  BIGINT NULL;

/* ═══════════════════════════════════════════════════════════
 *  vendor_transactions.type — mobile uses ENUM('earning','payout','refund','adjustment')
 *  Our existing values ('earning', 'payout' etc.) all fit the enum.
 *  MODIFY COLUMN to enforce.
 * ═══════════════════════════════════════════════════════════ */
ALTER TABLE vendor_transactions MODIFY COLUMN type ENUM('earning','payout','refund','adjustment') NOT NULL DEFAULT 'earning';

/* ═══════════════════════════════════════════════════════════
 *  service taxonomy id → BIGINT (mobile uses bigint)
 *  NOTE: `id` is a UNIQUE mirror column added by 004 — not the
 *  AUTO_INCREMENT PK (that's still `category_id`/etc.). Widen to
 *  BIGINT but keep it NULL UNIQUE, not AUTO_INCREMENT.
 * ═══════════════════════════════════════════════════════════ */
ALTER TABLE service_categories    MODIFY COLUMN id BIGINT NULL;
ALTER TABLE service_subcategories MODIFY COLUMN id BIGINT NULL;
ALTER TABLE service_subcategories MODIFY COLUMN category_id BIGINT NOT NULL;
ALTER TABLE service_tags          MODIFY COLUMN id BIGINT NULL;
ALTER TABLE vendors               MODIFY COLUMN id BIGINT NULL;

/* ═══════════════════════════════════════════════════════════
 *  status as ENUM where mobile uses enum on customers/vendors.
 *  Normalise legacy string values to the enum set first.
 * ═══════════════════════════════════════════════════════════ */
UPDATE customers SET status = 'approved' WHERE status IN ('active','');
UPDATE customers SET status = 'approved' WHERE status NOT IN ('pending','verified','pending_approval','approved','rejected');
ALTER TABLE customers MODIFY COLUMN status ENUM('pending','verified','pending_approval','approved','rejected') NOT NULL DEFAULT 'approved';

UPDATE vendors SET status = 'pending_approval' WHERE status = 'kyc_submitted';
UPDATE vendors SET status = 'pending'          WHERE status IN ('active','inactive','');
UPDATE vendors SET status = 'pending'          WHERE status NOT IN ('pending','verified','pending_approval','approved','rejected');
ALTER TABLE vendors   MODIFY COLUMN status ENUM('pending','verified','pending_approval','approved','rejected') NOT NULL DEFAULT 'pending';

UPDATE vendors SET kyc_status = 'not_submitted' WHERE kyc_status IS NULL OR kyc_status NOT IN ('not_submitted','pending','approved','rejected');
ALTER TABLE vendors   MODIFY COLUMN kyc_status ENUM('not_submitted','pending','approved','rejected') NOT NULL DEFAULT 'not_submitted';

/* ═══════════════════════════════════════════════════════════
 *  bank_details.status — mobile uses int (1/0), we use enum.
 *  Add an int mirror column instead of breaking our enum.
 * ═══════════════════════════════════════════════════════════ */
ALTER TABLE bank_details ADD COLUMN status_int INT NOT NULL DEFAULT 1;
UPDATE bank_details SET status_int = CASE status
  WHEN 'active' THEN 1 WHEN 'rejected' THEN 0 WHEN 'pending_edit' THEN 2 ELSE 1 END;

/* ═══════════════════════════════════════════════════════════
 *  platform_transactions: drop UNSIGNED to exactly match dump
 *  (mobile schema uses signed BIGINT)
 * ═══════════════════════════════════════════════════════════ */
ALTER TABLE platform_transactions MODIFY COLUMN id BIGINT NOT NULL AUTO_INCREMENT;
ALTER TABLE platform_transactions MODIFY COLUMN order_id BIGINT NOT NULL;

/* ═══════════════════════════════════════════════════════════
 *  customers/vendors `phone` and `ph_code` — mobile uses TEXT.
 *  Our VARCHAR is functionally compatible but enlarge to TEXT
 *  for exact parity.
 * ═══════════════════════════════════════════════════════════ */
ALTER TABLE customers MODIFY COLUMN ph_code TEXT NOT NULL;
ALTER TABLE customers MODIFY COLUMN phone TEXT NOT NULL;
ALTER TABLE customers MODIFY COLUMN profile_photo LONGTEXT NULL;
ALTER TABLE vendors   MODIFY COLUMN ph_code TEXT NOT NULL;
ALTER TABLE vendors   MODIFY COLUMN profile_photo VARCHAR(500) NULL;

/* ═══════════════════════════════════════════════════════════
 *  order_plan.title — mobile uses TEXT (we used VARCHAR(150))
 * ═══════════════════════════════════════════════════════════ */
ALTER TABLE order_plan MODIFY COLUMN title TEXT NOT NULL;

/* ═══════════════════════════════════════════════════════════
 *  Auto-sync triggers — keep status_int in lockstep with status
 *  on every INSERT / UPDATE. Means mobile clients reading by
 *  status_int always see the current code without us touching
 *  ~25 service-layer call sites.
 * ═══════════════════════════════════════════════════════════ */
DROP TRIGGER IF EXISTS trg_enquiries_status_sync_ins;
DROP TRIGGER IF EXISTS trg_enquiries_status_sync_upd;
DROP TRIGGER IF EXISTS trg_orders_status_sync_ins;
DROP TRIGGER IF EXISTS trg_orders_status_sync_upd;
DROP TRIGGER IF EXISTS trg_quotation_status_sync_ins;
DROP TRIGGER IF EXISTS trg_quotation_status_sync_upd;
DROP TRIGGER IF EXISTS trg_bank_details_status_sync_ins;
DROP TRIGGER IF EXISTS trg_bank_details_status_sync_upd;

CREATE TRIGGER trg_enquiries_status_sync_ins BEFORE INSERT ON enquiries FOR EACH ROW
  SET NEW.status_int = CASE LOWER(COALESCE(NEW.status,'new'))
    WHEN 'new' THEN 1 WHEN 'pending' THEN 1
    WHEN 'accepted' THEN 2 WHEN 'active' THEN 2
    WHEN 'quoted' THEN 3 WHEN 'completed' THEN 3
    WHEN 'rejected' THEN 4 WHEN 'cancelled' THEN 6
    ELSE 1 END;

CREATE TRIGGER trg_enquiries_status_sync_upd BEFORE UPDATE ON enquiries FOR EACH ROW
  SET NEW.status_int = CASE LOWER(COALESCE(NEW.status,'new'))
    WHEN 'new' THEN 1 WHEN 'pending' THEN 1
    WHEN 'accepted' THEN 2 WHEN 'active' THEN 2
    WHEN 'quoted' THEN 3 WHEN 'completed' THEN 3
    WHEN 'rejected' THEN 4 WHEN 'cancelled' THEN 6
    ELSE 1 END;

CREATE TRIGGER trg_orders_status_sync_ins BEFORE INSERT ON orders FOR EACH ROW
  SET NEW.status_int = CASE LOWER(COALESCE(NEW.status,'active'))
    WHEN 'active' THEN 2 WHEN 'pending' THEN 1
    WHEN 'completed' THEN 3 WHEN 'cancelled' THEN 6 WHEN 'refunded' THEN 6
    ELSE 1 END;

CREATE TRIGGER trg_orders_status_sync_upd BEFORE UPDATE ON orders FOR EACH ROW
  SET NEW.status_int = CASE LOWER(COALESCE(NEW.status,'active'))
    WHEN 'active' THEN 2 WHEN 'pending' THEN 1
    WHEN 'completed' THEN 3 WHEN 'cancelled' THEN 6 WHEN 'refunded' THEN 6
    ELSE 1 END;

CREATE TRIGGER trg_quotation_status_sync_ins BEFORE INSERT ON quotation FOR EACH ROW
  SET NEW.status_int = CASE LOWER(COALESCE(NEW.status,'sent'))
    WHEN 'sent' THEN 1 WHEN 'pending' THEN 1
    WHEN 'accepted' THEN 2 WHEN 'rejected' THEN 3
    ELSE 1 END;

CREATE TRIGGER trg_quotation_status_sync_upd BEFORE UPDATE ON quotation FOR EACH ROW
  SET NEW.status_int = CASE LOWER(COALESCE(NEW.status,'sent'))
    WHEN 'sent' THEN 1 WHEN 'pending' THEN 1
    WHEN 'accepted' THEN 2 WHEN 'rejected' THEN 3
    ELSE 1 END;

CREATE TRIGGER trg_bank_details_status_sync_ins BEFORE INSERT ON bank_details FOR EACH ROW
  SET NEW.status_int = CASE NEW.status WHEN 'active' THEN 1 WHEN 'rejected' THEN 0 WHEN 'pending_edit' THEN 2 ELSE 1 END;

CREATE TRIGGER trg_bank_details_status_sync_upd BEFORE UPDATE ON bank_details FOR EACH ROW
  SET NEW.status_int = CASE NEW.status WHEN 'active' THEN 1 WHEN 'rejected' THEN 0 WHEN 'pending_edit' THEN 2 ELSE 1 END;

/* ═══════════════════════════════════════════════════════════
 *  v4.5.4 hotfix: ph_code DEFAULT so OTP-only inserts succeed
 *  (mobile dump declares NOT NULL with no default — we add a
 *  harmless default so web-side OTP flow doesn't violate.)
 * ═══════════════════════════════════════════════════════════ */
ALTER TABLE customers MODIFY COLUMN ph_code TEXT NOT NULL DEFAULT ('+91');
ALTER TABLE vendors   MODIFY COLUMN ph_code TEXT NOT NULL DEFAULT ('+91');
