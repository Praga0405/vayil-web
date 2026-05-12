CREATE TABLE IF NOT EXISTS customers (
  customer_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100), phone VARCHAR(20), mobile VARCHAR(20), email VARCHAR(150), city VARCHAR(100), address TEXT,
  status VARCHAR(30) DEFAULT 'active', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS vendors (
  vendor_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100), company_name VARCHAR(150), phone VARCHAR(20), mobile VARCHAR(20), email VARCHAR(150), city VARCHAR(100),
  status VARCHAR(30) DEFAULT 'pending', proof_type VARCHAR(80), proof_number VARCHAR(100), kyc_document_url TEXT, kyc_approved_at TIMESTAMP NULL,
  rejection_reason TEXT, rating DECIMAL(3,2) DEFAULT 0, is_gst_registered BOOLEAN DEFAULT false, gst_number VARCHAR(30),
  onboarded_date DATE NULL, rebate_active BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS otp_codes (
  id INT AUTO_INCREMENT PRIMARY KEY, phone VARCHAR(20) NOT NULL, purpose VARCHAR(50) NOT NULL, otp_hash CHAR(64) NOT NULL,
  expires_at TIMESTAMP NOT NULL, consumed BOOLEAN DEFAULT false, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_otp (phone, purpose, consumed, expires_at)
);
CREATE TABLE IF NOT EXISTS service_categories (category_id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100), icon VARCHAR(255), status BOOLEAN DEFAULT true);
CREATE TABLE IF NOT EXISTS service_subcategories (subcategory_id INT AUTO_INCREMENT PRIMARY KEY, category_id INT, name VARCHAR(100), status BOOLEAN DEFAULT true);
CREATE TABLE IF NOT EXISTS service_tags (tag_id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100), status BOOLEAN DEFAULT true);
CREATE TABLE IF NOT EXISTS vendor_services (
  vendor_service_id INT AUTO_INCREMENT PRIMARY KEY, vendor_id INT NOT NULL, category_id INT NULL, title VARCHAR(150), description TEXT,
  price DECIMAL(12,2), unit VARCHAR(40) DEFAULT 'project', status BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX(vendor_id)
);
CREATE TABLE IF NOT EXISTS enquiries (
  enquiry_id INT AUTO_INCREMENT PRIMARY KEY, customer_id INT NOT NULL, vendor_id INT NULL, service_id INT NULL, category VARCHAR(100), description TEXT,
  location TEXT, email VARCHAR(150), status VARCHAR(40) DEFAULT 'new', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX(customer_id), INDEX(vendor_id)
);
CREATE TABLE IF NOT EXISTS quotation (
  quotation_id INT AUTO_INCREMENT PRIMARY KEY, enquiry_id INT NOT NULL, vendor_id INT NOT NULL, amount DECIMAL(12,2), message TEXT,
  estimated_days INT, valid_until DATE NULL, status VARCHAR(40) DEFAULT 'sent', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX(enquiry_id), INDEX(vendor_id)
);
CREATE TABLE IF NOT EXISTS orders (
  order_id INT AUTO_INCREMENT PRIMARY KEY, customer_id INT NOT NULL, vendor_id INT NOT NULL, enquiry_id INT NULL, quotation_id INT NULL,
  amount DECIMAL(12,2), status VARCHAR(40) DEFAULT 'active', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX(customer_id), INDEX(vendor_id)
);
CREATE TABLE IF NOT EXISTS order_plan (
  plan_id INT AUTO_INCREMENT PRIMARY KEY, order_id INT NOT NULL, title VARCHAR(150), description TEXT, amount DECIMAL(12,2),
  vendor_status VARCHAR(40), customer_status VARCHAR(40), updated_at TIMESTAMP NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX(order_id)
);
CREATE TABLE IF NOT EXISTS payment_log (
  id INT AUTO_INCREMENT PRIMARY KEY, order_id INT NULL, customer_id INT NULL, vendor_id INT NULL, amount DECIMAL(12,2), status VARCHAR(40),
  provider VARCHAR(40), provider_payment_id VARCHAR(120), released_at TIMESTAMP NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX(order_id), INDEX(customer_id), INDEX(vendor_id)
);
CREATE TABLE IF NOT EXISTS vendor_wallet (
  vendor_id INT PRIMARY KEY, balance DECIMAL(12,2) DEFAULT 0, total_earning DECIMAL(12,2) DEFAULT 0, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS vendor_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY, vendor_id INT NOT NULL, order_id INT NULL, amount DECIMAL(12,2), type VARCHAR(40), status VARCHAR(40), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS vendor_tds_ledger (
  id INT AUTO_INCREMENT PRIMARY KEY, vendor_id INT NOT NULL, transaction_id INT NULL, base_amount DECIMAL(12,2), tds_amount DECIMAL(12,2), financial_year VARCHAR(10), deposited BOOLEAN DEFAULT false, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS disputes (
  id INT AUTO_INCREMENT PRIMARY KEY, order_id INT NULL, customer_id INT NULL, vendor_id INT NULL, amount DECIMAL(12,2), status VARCHAR(40) DEFAULT 'open',
  reason TEXT, resolution VARCHAR(40), customer_amount DECIMAL(12,2), vendor_amount DECIMAL(12,2), resolution_note TEXT, resolved_at TIMESTAMP NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS support_tickets (
  id INT AUTO_INCREMENT PRIMARY KEY, customer_id INT NULL, vendor_id INT NULL, subject VARCHAR(200), status VARCHAR(40) DEFAULT 'open', priority VARCHAR(30) DEFAULT 'normal', assigned_staff_id INT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS support_messages (
  id INT AUTO_INCREMENT PRIMARY KEY, ticket_id INT NOT NULL, sender_type VARCHAR(30), sender_id INT NULL, message TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS crm_notes (
  id INT AUTO_INCREMENT PRIMARY KEY, customer_id INT NOT NULL, staff_id INT NULL, note TEXT, type VARCHAR(30) DEFAULT 'INTERNAL', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS staff (
  id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL, mobile VARCHAR(15), email VARCHAR(100) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL, is_active BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, last_login_at TIMESTAMP NULL
);
CREATE TABLE IF NOT EXISTS roles (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(50) NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS staff_roles (staff_id INT NOT NULL, role_id INT NOT NULL, PRIMARY KEY (staff_id, role_id));
CREATE TABLE IF NOT EXISTS settings (
  id INT AUTO_INCREMENT PRIMARY KEY, platform_fee_percentage DECIMAL(5,2) DEFAULT 5, premium_fee_percentage DECIMAL(5,2) DEFAULT 15, tds_percentage DECIMAL(5,2) DEFAULT 1, gst_percentage DECIMAL(5,2) DEFAULT 18, vendor_rebate_period_days INT DEFAULT 90
);
INSERT IGNORE INTO roles (name) VALUES ('super_admin'),('ops_manager'),('kyc_officer'),('customer_support'),('vendor_support'),('finance_officer'),('field_inspector'),('marketing'),('read_only');
INSERT INTO settings (id) VALUES (1) ON DUPLICATE KEY UPDATE id = id;
