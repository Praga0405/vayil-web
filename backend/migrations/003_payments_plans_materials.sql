-- Phase: complete P0 backend coverage for plans, materials, milestones,
-- payments (escrow + idempotency), sign-offs and rework.
--
-- Idempotent: migrate.ts tolerates duplicate-column/key/index errors.

-- ── Materials (separate from order_plan; vendor-managed line items) ──
CREATE TABLE IF NOT EXISTS materials (
  material_id INT AUTO_INCREMENT PRIMARY KEY,
  order_id    INT NOT NULL,
  name        VARCHAR(200) NOT NULL,
  quantity    DECIMAL(12,2) DEFAULT 1,
  unit        VARCHAR(40)   DEFAULT 'pc',
  rate        DECIMAL(12,2) DEFAULT 0,
  total       DECIMAL(12,2) DEFAULT 0,
  status      VARCHAR(40)   DEFAULT 'UNPAID',
  seed_source VARCHAR(60)   NULL,
  created_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_materials_order (order_id),
  INDEX idx_materials_status (status)
);

-- ── Plan versioning (so customer can request revisions) ──
ALTER TABLE order_plan ADD COLUMN days INT DEFAULT 0;
ALTER TABLE order_plan ADD COLUMN percentage DECIMAL(5,2) DEFAULT 0;
ALTER TABLE order_plan ADD COLUMN mandatory BOOLEAN DEFAULT true;
ALTER TABLE order_plan ADD COLUMN revision_reason TEXT NULL;

CREATE TABLE IF NOT EXISTS plan_submissions (
  submission_id INT AUTO_INCREMENT PRIMARY KEY,
  order_id      INT NOT NULL,
  version       INT NOT NULL DEFAULT 1,
  submitted_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status        VARCHAR(40) DEFAULT 'submitted',  -- submitted | approved | revision_requested
  reviewed_at   TIMESTAMP NULL,
  reviewer_note TEXT NULL,
  INDEX idx_plan_submissions_order (order_id, version)
);

-- ── Milestone updates (vendor posts progress with images + comments) ──
CREATE TABLE IF NOT EXISTS milestone_updates (
  update_id   INT AUTO_INCREMENT PRIMARY KEY,
  plan_id     INT NOT NULL,
  vendor_id   INT NOT NULL,
  comment     TEXT NULL,
  image_urls  JSON NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_milestone_updates_plan (plan_id)
);

-- ── Payment intent / state machine + idempotency ──
CREATE TABLE IF NOT EXISTS payment_intents (
  intent_id        INT AUTO_INCREMENT PRIMARY KEY,
  idempotency_key  VARCHAR(100) NOT NULL UNIQUE,
  customer_id      INT NOT NULL,
  order_id         INT NULL,
  enquiry_id       INT NULL,
  amount           DECIMAL(12,2) NOT NULL,
  purpose          VARCHAR(40)  NOT NULL DEFAULT 'quote',  -- quote | milestone | materials
  material_ids     JSON NULL,
  milestone_id     INT NULL,
  status           VARCHAR(40)  NOT NULL DEFAULT 'initiated',
                   -- initiated | success | failed | cancelled | escrow_held | released
  razorpay_order_id   VARCHAR(120) NULL,
  razorpay_payment_id VARCHAR(120) NULL,
  razorpay_signature  VARCHAR(255) NULL,
  failure_reason   TEXT NULL,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pi_status (status),
  INDEX idx_pi_order  (order_id),
  INDEX idx_pi_customer (customer_id)
);

CREATE TABLE IF NOT EXISTS escrow_ledger (
  entry_id     INT AUTO_INCREMENT PRIMARY KEY,
  intent_id    INT NOT NULL,
  order_id     INT NULL,
  vendor_id    INT NULL,
  amount       DECIMAL(12,2) NOT NULL,
  direction    VARCHAR(10) NOT NULL,  -- hold | release | refund
  reason       VARCHAR(120) NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_escrow_intent (intent_id),
  INDEX idx_escrow_order  (order_id)
);

-- Idempotency lookup table for non-payment POSTs that need replay safety.
CREATE TABLE IF NOT EXISTS idempotency_keys (
  id_key       VARCHAR(120) PRIMARY KEY,
  user_id      INT NOT NULL,
  user_type    VARCHAR(20) NOT NULL,
  endpoint     VARCHAR(150) NOT NULL,
  response_status SMALLINT NOT NULL,
  response_body MEDIUMTEXT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_idem_user_endpoint (user_id, endpoint)
);

-- ── Sign-offs + rework requests ──
CREATE TABLE IF NOT EXISTS signoffs (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  order_id    INT NOT NULL UNIQUE,
  customer_id INT NOT NULL,
  rating      TINYINT NULL,
  comment     TEXT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rework_requests (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  order_id    INT NOT NULL,
  customer_id INT NOT NULL,
  reason      TEXT NOT NULL,
  status      VARCHAR(40) DEFAULT 'open',
  resolved_at TIMESTAMP NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_rework_order (order_id)
);

-- ── Enquiries: surface accept/reject timestamps ──
ALTER TABLE enquiries ADD COLUMN accepted_at  TIMESTAMP NULL;
ALTER TABLE enquiries ADD COLUMN rejected_at  TIMESTAMP NULL;
ALTER TABLE enquiries ADD COLUMN reject_reason TEXT NULL;

-- ── Webhook deliveries (for Razorpay replay + audit) ──
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  provider      VARCHAR(40) NOT NULL,
  event_id      VARCHAR(120) NULL,
  event_type    VARCHAR(80) NULL,
  payload       MEDIUMTEXT NULL,
  signature     VARCHAR(255) NULL,
  status        VARCHAR(40) DEFAULT 'received', -- received | processed | invalid
  processed_at  TIMESTAMP NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_webhook_event (provider, event_id)
);
