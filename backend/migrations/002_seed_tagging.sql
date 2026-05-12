-- Adds a nullable seed_source column to every table touched by the
-- marketplace seed script, so demo rows can be cleanly identified and
-- purged without risking real customer/vendor data.
--
-- Idempotent: migrate.ts swallows "Duplicate column name" (errno 1060)
-- and "Duplicate key name" (errno 1061) errors so re-running this file
-- after the column already exists is a no-op.

ALTER TABLE service_categories    ADD COLUMN seed_source VARCHAR(60) NULL;
ALTER TABLE service_categories    ADD INDEX idx_sc_seed_source (seed_source);

ALTER TABLE service_subcategories ADD COLUMN seed_source VARCHAR(60) NULL;
ALTER TABLE service_subcategories ADD INDEX idx_ssc_seed_source (seed_source);

ALTER TABLE service_tags          ADD COLUMN seed_source VARCHAR(60) NULL;
ALTER TABLE service_tags          ADD INDEX idx_st_seed_source (seed_source);

ALTER TABLE vendors               ADD COLUMN seed_source VARCHAR(60) NULL;
ALTER TABLE vendors               ADD INDEX idx_v_seed_source (seed_source);

ALTER TABLE vendor_services       ADD COLUMN seed_source VARCHAR(60) NULL;
ALTER TABLE vendor_services       ADD INDEX idx_vs_seed_source (seed_source);

ALTER TABLE customers             ADD COLUMN seed_source VARCHAR(60) NULL;
ALTER TABLE customers             ADD INDEX idx_c_seed_source (seed_source);

ALTER TABLE enquiries             ADD COLUMN seed_source VARCHAR(60) NULL;
ALTER TABLE enquiries             ADD INDEX idx_e_seed_source (seed_source);

ALTER TABLE quotation             ADD COLUMN seed_source VARCHAR(60) NULL;
ALTER TABLE quotation             ADD INDEX idx_q_seed_source (seed_source);

ALTER TABLE orders                ADD COLUMN seed_source VARCHAR(60) NULL;
ALTER TABLE orders                ADD INDEX idx_o_seed_source (seed_source);

ALTER TABLE order_plan            ADD COLUMN seed_source VARCHAR(60) NULL;
ALTER TABLE order_plan            ADD INDEX idx_op_seed_source (seed_source);
