-- 009_tidb_schema_align.sql
--
-- v4.5.20 — TiDB Cloud Serverless rejects two things that migrations
-- 004 and 006 used freely:
--
--   1. `ALTER TABLE x ADD COLUMN id INT NULL UNIQUE` — inline UNIQUE on
--      ADD COLUMN throws errno 8200 ("TiDB unsupported feature"). The
--      fix is to ADD COLUMN, then CREATE UNIQUE INDEX as separate
--      statements.
--   2. TiDB rejects defaults on TEXT/BLOB columns, so `ph_code`
--      stays VARCHAR with a literal default.
--
-- This migration applies the same column shape additions on TiDB as
-- 004 + 006 did on MySQL, split into TiDB-compatible statements. On a
-- DB where 004/006 already ran (local MySQL, mobile-team Docker), every
-- statement here either no-ops (column already exists, errno 1060) or
-- is harmless (already-existing UNIQUE index, errno 1061). Migration
-- runner swallows those.
--
-- Triggers from 006 are deliberately omitted — TiDB Serverless doesn't
-- support CREATE TRIGGER. Application code already dual-writes status
-- + status_int on the legacy mobile shim path. The status_int columns
-- here exist for read parity with the mobile dump; new rows will get
-- the value set by the legacy save handlers in
-- backend/src/routes/legacyCustomer.ts and legacyVendor.ts.

/* ─── id mirror columns: ADD then INDEX (TiDB-friendly) ─── */
ALTER TABLE customers             ADD COLUMN id INT NULL;
ALTER TABLE vendors               ADD COLUMN id INT NULL;
ALTER TABLE enquiries             ADD COLUMN id INT NULL;
ALTER TABLE orders                ADD COLUMN id INT NULL;
ALTER TABLE quotation             ADD COLUMN id INT NULL;
ALTER TABLE order_plan            ADD COLUMN id INT NULL;
ALTER TABLE vendor_services       ADD COLUMN id INT NULL;
ALTER TABLE service_categories    ADD COLUMN id INT NULL;
ALTER TABLE service_subcategories ADD COLUMN id INT NULL;
ALTER TABLE service_tags          ADD COLUMN id INT NULL;
ALTER TABLE notifications         ADD COLUMN id INT NULL;

UPDATE customers             SET id = customer_id         WHERE id IS NULL;
UPDATE vendors               SET id = vendor_id           WHERE id IS NULL;
UPDATE enquiries             SET id = enquiry_id          WHERE id IS NULL;
UPDATE orders                SET id = order_id            WHERE id IS NULL;
UPDATE quotation             SET id = quotation_id        WHERE id IS NULL;
UPDATE order_plan            SET id = plan_id             WHERE id IS NULL;
UPDATE vendor_services       SET id = vendor_service_id   WHERE id IS NULL;
UPDATE service_categories    SET id = category_id         WHERE id IS NULL;
UPDATE service_subcategories SET id = subcategory_id      WHERE id IS NULL;
UPDATE service_tags          SET id = tag_id              WHERE id IS NULL;
UPDATE notifications         SET id = notification_id     WHERE id IS NULL;

CREATE UNIQUE INDEX idx_id_mirror ON customers(id);
CREATE UNIQUE INDEX idx_id_mirror ON vendors(id);
CREATE UNIQUE INDEX idx_id_mirror ON enquiries(id);
CREATE UNIQUE INDEX idx_id_mirror ON orders(id);
CREATE UNIQUE INDEX idx_id_mirror ON quotation(id);
CREATE UNIQUE INDEX idx_id_mirror ON order_plan(id);
CREATE UNIQUE INDEX idx_id_mirror ON vendor_services(id);
CREATE UNIQUE INDEX idx_id_mirror ON service_categories(id);
CREATE UNIQUE INDEX idx_id_mirror ON service_subcategories(id);
CREATE UNIQUE INDEX idx_id_mirror ON service_tags(id);
CREATE UNIQUE INDEX idx_id_mirror ON notifications(id);

/* ─── taxonomy: slug + icon_url + is_active + is_deleted ─── */
ALTER TABLE service_categories    ADD COLUMN slug        VARCHAR(100) NULL;
ALTER TABLE service_categories    ADD COLUMN icon_url    VARCHAR(255) NULL;
ALTER TABLE service_categories    ADD COLUMN is_active   TINYINT(1) DEFAULT 1;
ALTER TABLE service_categories    ADD COLUMN is_deleted  TINYINT(1) DEFAULT 0;
ALTER TABLE service_categories    ADD COLUMN seed_source VARCHAR(60) NULL;
ALTER TABLE service_subcategories ADD COLUMN slug        VARCHAR(150) NULL;
ALTER TABLE service_subcategories ADD COLUMN is_active   TINYINT(1) DEFAULT 1;
ALTER TABLE service_subcategories ADD COLUMN is_deleted  TINYINT(1) DEFAULT 0;
ALTER TABLE service_subcategories ADD COLUMN seed_source VARCHAR(60) NULL;
ALTER TABLE service_tags          ADD COLUMN is_active   TINYINT(1) DEFAULT 1;
ALTER TABLE service_tags          ADD COLUMN is_deleted  TINYINT(1) DEFAULT 0;
ALTER TABLE service_tags          ADD COLUMN seed_source VARCHAR(60) NULL;

UPDATE service_categories    SET slug = LOWER(REPLACE(REPLACE(name, ' ', '-'), '&', 'and')) WHERE slug IS NULL OR slug = '';
UPDATE service_subcategories SET slug = LOWER(REPLACE(REPLACE(name, ' ', '-'), '/', '-'))    WHERE slug IS NULL OR slug = '';

/* ─── status_int + updated_at parity on enquiries / orders / quotation / bank_details ─── */
ALTER TABLE enquiries    ADD COLUMN status_int  TINYINT NULL;
ALTER TABLE enquiries    ADD COLUMN updated_at  TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE orders       ADD COLUMN status_int  TINYINT NULL;
ALTER TABLE orders       ADD COLUMN updated_at  TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE quotation    ADD COLUMN status_int  TINYINT NULL;
ALTER TABLE quotation    ADD COLUMN updated_at  TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE bank_details ADD COLUMN status_int  TINYINT NULL;

UPDATE enquiries SET status_int = CASE LOWER(COALESCE(status,'new'))
    WHEN 'new' THEN 1 WHEN 'pending' THEN 1
    WHEN 'accepted' THEN 2 WHEN 'active' THEN 2
    WHEN 'quoted' THEN 3 WHEN 'completed' THEN 3
    WHEN 'rejected' THEN 4 WHEN 'cancelled' THEN 6
    ELSE 1 END WHERE status_int IS NULL;
UPDATE orders SET status_int = CASE LOWER(COALESCE(status,'active'))
    WHEN 'active' THEN 2 WHEN 'pending' THEN 1
    WHEN 'completed' THEN 3 WHEN 'cancelled' THEN 6 WHEN 'refunded' THEN 6
    ELSE 1 END WHERE status_int IS NULL;
UPDATE quotation SET status_int = CASE LOWER(COALESCE(status,'sent'))
    WHEN 'sent' THEN 1 WHEN 'pending' THEN 1
    WHEN 'accepted' THEN 2 WHEN 'rejected' THEN 3
    ELSE 1 END WHERE status_int IS NULL;

/* ─── customers + vendors mobile-shape columns ─── */
ALTER TABLE customers ADD COLUMN ph_code          VARCHAR(10) NULL DEFAULT '+91';
ALTER TABLE customers ADD COLUMN profile_photo    VARCHAR(500) NULL;
ALTER TABLE customers ADD COLUMN device_id        VARCHAR(120) NULL;
ALTER TABLE customers ADD COLUMN otp              VARCHAR(10) NULL;
ALTER TABLE customers ADD COLUMN otp_expires_at   TIMESTAMP NULL;
ALTER TABLE customers ADD COLUMN otp_attempts     INT DEFAULT 0;
ALTER TABLE customers ADD COLUMN last_otp_sent_at TIMESTAMP NULL;
ALTER TABLE customers ADD COLUMN terms_accept     TINYINT(1) DEFAULT 1;
ALTER TABLE customers ADD COLUMN is_deleted       TINYINT(1) DEFAULT 0;
ALTER TABLE customers ADD COLUMN state            VARCHAR(100) NULL;
ALTER TABLE customers ADD COLUMN updated_at       TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE vendors   ADD COLUMN ph_code          VARCHAR(10) NULL DEFAULT '+91';
ALTER TABLE vendors   ADD COLUMN profile_photo    VARCHAR(500) NULL;
ALTER TABLE vendors   ADD COLUMN device_id        VARCHAR(120) NULL;
ALTER TABLE vendors   ADD COLUMN otp              VARCHAR(10) NULL;
ALTER TABLE vendors   ADD COLUMN otp_expires_at   TIMESTAMP NULL;
ALTER TABLE vendors   ADD COLUMN otp_attempts     INT DEFAULT 0;
ALTER TABLE vendors   ADD COLUMN last_otp_sent_at TIMESTAMP NULL;
ALTER TABLE vendors   ADD COLUMN terms_accept     TINYINT(1) DEFAULT 1;
ALTER TABLE vendors   ADD COLUMN is_deleted       TINYINT(1) DEFAULT 0;
ALTER TABLE vendors   ADD COLUMN state            VARCHAR(100) NULL;
ALTER TABLE vendors   ADD COLUMN updated_at       TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

UPDATE customers SET ph_code = '+91' WHERE ph_code IS NULL;
UPDATE vendors   SET ph_code = '+91' WHERE ph_code IS NULL;

/* ─── vendor_services taxonomy / mobile-shape ─── */
ALTER TABLE vendor_services ADD COLUMN pricing_type        VARCHAR(40) NULL DEFAULT 'fixed';
ALTER TABLE vendor_services ADD COLUMN service_title       VARCHAR(255) NULL;
ALTER TABLE vendor_services ADD COLUMN service_category    VARCHAR(100) NULL;
ALTER TABLE vendor_services ADD COLUMN service_subcategory VARCHAR(100) NULL;
ALTER TABLE vendor_services ADD COLUMN unit_name           VARCHAR(100) NULL;
ALTER TABLE vendor_services ADD COLUMN service_image       TEXT NULL;
ALTER TABLE vendor_services ADD COLUMN certificate_url     TEXT NULL;

/* ─── quotation breakdown columns ─── */
ALTER TABLE quotation ADD COLUMN advance_amount  DECIMAL(12,2) NULL;
ALTER TABLE quotation ADD COLUMN subtotal        DECIMAL(12,2) NULL;
ALTER TABLE quotation ADD COLUMN platform_fee    DECIMAL(12,2) NULL;
ALTER TABLE quotation ADD COLUMN gst             DECIMAL(12,2) NULL;
ALTER TABLE quotation ADD COLUMN gst_amount      DECIMAL(12,2) NULL;
ALTER TABLE quotation ADD COLUMN total           DECIMAL(12,2) NULL;
ALTER TABLE quotation ADD COLUMN attachment_urls JSON NULL;
