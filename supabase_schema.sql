-- Schema for Supabase (PostgreSQL)
-- Created from MySQL schema with UUID support

CREATE TABLE IF NOT EXISTS branches (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(64) NULL,
  address TEXT NULL,
  created_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS units (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(64) NOT NULL UNIQUE,
  created_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  default_unit VARCHAR(32) NULL,
  branch_id VARCHAR(36) DEFAULT '1',
  created_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customers (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  address TEXT,
  total_debt DECIMAL(12,2) DEFAULT 0,
  branch_id VARCHAR(36) DEFAULT '1',
  created_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS suppliers (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  address TEXT,
  total_debt DECIMAL(12,2) DEFAULT 0,
  branch_id VARCHAR(36) DEFAULT '1',
  created_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id VARCHAR(36) PRIMARY KEY,
  custom_id VARCHAR(64) NULL,
  barcode VARCHAR(255),
  name VARCHAR(255) NOT NULL,
  category VARCHAR(255),
  brand VARCHAR(255),
  image_url TEXT,
  default_unit VARCHAR(10) DEFAULT 'PCS',
  pcs_per_dus INT DEFAULT 1,
  buy_price_pcs DECIMAL(12,2) DEFAULT 0,
  buy_price_dus DECIMAL(12,2) DEFAULT 0,
  sell_price_pcs DECIMAL(12,2) DEFAULT 0,
  sell_price_dus DECIMAL(12,2) DEFAULT 0,
  stock_pcs INT DEFAULT 0,
  min_stock_pcs INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  branch_id VARCHAR(36) DEFAULT '1',
  source_product_id VARCHAR(64) NULL,
  created_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (custom_id, branch_id)
);

CREATE INDEX idx_source_product_id ON products(source_product_id);

CREATE TABLE IF NOT EXISTS product_batches (
  id VARCHAR(36) PRIMARY KEY,
  product_id VARCHAR(64) NOT NULL,
  purchase_price DECIMAL(12,2) DEFAULT 0,
  initial_qty INT DEFAULT 0,
  remaining_qty INT DEFAULT 0,
  branch_id VARCHAR(36) DEFAULT '1',
  purchase_id VARCHAR(36) NULL,
  transfer_batch_id VARCHAR(36) NULL,
  notes VARCHAR(255) NULL,
  created_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_product_branch ON product_batches(product_id, branch_id);
CREATE INDEX idx_created ON product_batches(created_date);

CREATE TABLE IF NOT EXISTS stock_mutations (
  id VARCHAR(36) PRIMARY KEY,
  product_id VARCHAR(64),
  product_name VARCHAR(255),
  type VARCHAR(20),
  qty_pcs INT DEFAULT 0,
  stock_before INT DEFAULT 0,
  stock_after INT DEFAULT 0,
  reference_type VARCHAR(50),
  reference_id VARCHAR(64) NULL,
  notes TEXT,
  branch_id VARCHAR(36) DEFAULT '1',
  created_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stock_transfers (
  id VARCHAR(36) PRIMARY KEY,
  doc_number VARCHAR(32) UNIQUE,
  from_branch_id VARCHAR(36) NOT NULL,
  to_branch_id VARCHAR(36) NOT NULL,
  items TEXT,
  notes TEXT,
  status VARCHAR(20) DEFAULT 'sent',
  received_by VARCHAR(255) NULL,
  receive_notes TEXT NULL,
  received_date TIMESTAMP WITH TIME ZONE NULL,
  transfer_date TIMESTAMP WITH TIME ZONE,
  created_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS purchases (
  id VARCHAR(36) PRIMARY KEY,
  invoice_number VARCHAR(100),
  supplier_id VARCHAR(36),
  supplier_name VARCHAR(255),
  items TEXT,
  subtotal DECIMAL(12,2) DEFAULT 0,
  total DECIMAL(12,2) DEFAULT 0,
  payment_method VARCHAR(50),
  paid_amount DECIMAL(12,2) DEFAULT 0,
  debt_amount DECIMAL(12,2) DEFAULT 0,
  purchase_date TIMESTAMP WITH TIME ZONE,
  status VARCHAR(50),
  branch_id VARCHAR(36) DEFAULT '1',
  created_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sales (
  id VARCHAR(36) PRIMARY KEY,
  invoice_number VARCHAR(100),
  customer_id VARCHAR(36) NULL,
  customer_name VARCHAR(255) NULL,
  items TEXT,
  subtotal DECIMAL(12,2) DEFAULT 0,
  total DECIMAL(12,2) DEFAULT 0,
  total_cost DECIMAL(12,2) DEFAULT 0,
  total_profit DECIMAL(12,2) DEFAULT 0,
  discount_type VARCHAR(20) NULL,
  discount_value DECIMAL(12,2) DEFAULT 0,
  discount_amount DECIMAL(12,2) DEFAULT 0,
  tax_percent DECIMAL(12,2) DEFAULT 0,
  tax_amount DECIMAL(12,2) DEFAULT 0,
  payment_method VARCHAR(50),
  paid_amount DECIMAL(12,2) DEFAULT 0,
  change_amount DECIMAL(12,2) DEFAULT 0,
  debt_amount DECIMAL(12,2) DEFAULT 0,
  due_date DATE NULL,
  notes TEXT NULL,
  cashier_name VARCHAR(255) NULL,
  sale_date TIMESTAMP WITH TIME ZONE,
  status VARCHAR(50),
  branch_id VARCHAR(36) DEFAULT '1',
  created_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payments (
  id VARCHAR(36) PRIMARY KEY,
  type VARCHAR(50),
  party_id VARCHAR(36),
  party_name VARCHAR(255),
  amount DECIMAL(12,2) DEFAULT 0,
  payment_method VARCHAR(50),
  payment_date TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  branch_id VARCHAR(36) DEFAULT '1',
  created_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'staf',
  password_hash VARCHAR(128) NOT NULL,
  is_system BOOLEAN DEFAULT false,
  created_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_branches (
  user_id VARCHAR(36) NOT NULL,
  branch_id VARCHAR(36) NOT NULL,
  PRIMARY KEY (user_id, branch_id)
);

CREATE TABLE IF NOT EXISTS app_subscriptions (
  id VARCHAR(36) PRIMARY KEY,
  plan VARCHAR(20) NOT NULL,
  package_name VARCHAR(50) DEFAULT 'Basic',
  valid_from TIMESTAMP WITH TIME ZONE,
  valid_until TIMESTAMP WITH TIME ZONE,
  payment_date TIMESTAMP WITH TIME ZONE,
  created_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app_licenses (
  id VARCHAR(36) PRIMARY KEY,
  company_name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  address TEXT,
  price DECIMAL(12,2) NULL,
  type VARCHAR(20) NOT NULL,
  package_name VARCHAR(50) DEFAULT 'Basic',
  months INT,
  start_date TIMESTAMP WITH TIME ZONE,
  end_date TIMESTAMP WITH TIME ZONE,
  status VARCHAR(20),
  license_key VARCHAR(512) NOT NULL UNIQUE,
  payload TEXT,
  created_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
