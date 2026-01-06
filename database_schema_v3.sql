-- ACTIVE SCHEMA REFERENCE (v3 - Current)
-- Created at: 2026-01-06
-- Source: Actual MySQL Database Structure via MCP
-- Reflects accurate table names and columns from live DB.

USE trade_management;

-- 1. COMPANIES (거래처)
CREATE TABLE IF NOT EXISTS companies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_code VARCHAR(20) NOT NULL UNIQUE,
    business_name VARCHAR(100) NOT NULL COMMENT '사업자명(법인명)',
    company_name VARCHAR(100) NOT NULL COMMENT '상호(별칭)',
    business_number VARCHAR(12),
    ceo_name VARCHAR(50),
    company_type VARCHAR(50),
    company_category VARCHAR(50),
    address VARCHAR(200),
    phone VARCHAR(20),
    fax VARCHAR(20),
    email VARCHAR(100),
    contact_person VARCHAR(50),
    contact_phone VARCHAR(20),
    company_type_flag ENUM('CUSTOMER', 'SUPPLIER', 'BOTH') DEFAULT 'BOTH',
    notes TEXT,
    is_active TINYINT(1) DEFAULT 1,
    bank_name VARCHAR(50),
    account_number VARCHAR(50),
    account_holder VARCHAR(50),
    e_tax_invoice TINYINT(1) DEFAULT 0,
    sort_order INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 2. PRODUCTS (품목)
CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_name VARCHAR(100) NOT NULL,
    weight DECIMAL(10,2),
    grade VARCHAR(50),
    cnt INT DEFAULT 0 COMMENT '입수량',
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INT DEFAULT 0
);

-- 3. TRADE MASTERS (전표 마스터)
CREATE TABLE IF NOT EXISTS trade_masters (
    id INT AUTO_INCREMENT PRIMARY KEY,
    trade_number VARCHAR(50) UNIQUE NOT NULL,
    trade_type ENUM('SALE', 'PURCHASE', 'PRODUCTION') NOT NULL,
    trade_date DATE NOT NULL,
    company_id INT,
    total_amount DECIMAL(15,2) DEFAULT 0, -- 공급가액
    tax_amount DECIMAL(15,2) DEFAULT 0,   -- 부가세
    total_price DECIMAL(15,2) DEFAULT 0,  -- 합계금액 (공급가+부가세)
    paid_amount DECIMAL(15,2) DEFAULT 0,  -- 결제된 금액 (수금/지급)
    payment_status ENUM('UNPAID', 'PARTIAL', 'PAID') DEFAULT 'UNPAID',
    status ENUM('CONFIRMED', 'CANCELLED') DEFAULT 'CONFIRMED',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id)
);

-- 4. TRADE DETAILS (전표 상세)
CREATE TABLE IF NOT EXISTS trade_details (
    id INT AUTO_INCREMENT PRIMARY KEY,
    trade_master_id INT NOT NULL,
    seq_no INT NOT NULL,
    product_id INT NOT NULL,
    quantity DECIMAL(15,2) NOT NULL,
    total_weight DECIMAL(15,2),
    unit_price DECIMAL(15,2) NOT NULL,
    supply_amount DECIMAL(15,2) NOT NULL,
    tax_amount DECIMAL(15,2) DEFAULT 0,
    total_amount DECIMAL(15,2) NOT NULL,
    auction_price DECIMAL(15,2),
    notes VARCHAR(200),
    matching_status ENUM('PENDING', 'PARTIAL', 'MATCHED') DEFAULT 'PENDING',
    shipper_location VARCHAR(100),
    sender VARCHAR(100),
    purchase_price DECIMAL(12,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (trade_master_id) REFERENCES trade_masters(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)
);

-- 5. PURCHASE INVENTORY (매입 재고)
CREATE TABLE IF NOT EXISTS purchase_inventory (
    id INT AUTO_INCREMENT PRIMARY KEY,
    trade_detail_id INT NOT NULL,
    product_id INT NOT NULL,
    company_id INT NOT NULL,
    warehouse_id INT NOT NULL,
    purchase_date DATE NOT NULL,
    original_quantity DECIMAL(15,2) NOT NULL,
    remaining_quantity DECIMAL(15,2) NOT NULL,
    unit_price DECIMAL(15,2) NOT NULL,
    total_weight DECIMAL(15,2) DEFAULT 0,
    shipper_location VARCHAR(255) DEFAULT '',
    sender VARCHAR(255) DEFAULT '',
    status ENUM('AVAILABLE', 'DEPLETED', 'CANCELLED') DEFAULT 'AVAILABLE',
    display_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 6. SALE PURCHASE MATCHING (매출-매입 매칭)
CREATE TABLE IF NOT EXISTS sale_purchase_matching (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sale_detail_id INT NOT NULL,     -- 매출 상세 ID
    purchase_inventory_id INT NOT NULL, -- 매입 재고 ID
    matched_quantity DECIMAL(15,2) NOT NULL,
    matched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. EXPENSES (지출/경비)
CREATE TABLE IF NOT EXISTS expenses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    expense_date DATE NOT NULL,
    category_id INT,
    amount DECIMAL(15,2) NOT NULL,
    description TEXT,
    payment_method VARCHAR(50) DEFAULT 'CASH',
    company_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 8. PAYMENT TRANSACTIONS (입출금 내역)
CREATE TABLE IF NOT EXISTS payment_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    transaction_number VARCHAR(50),
    transaction_date DATE NOT NULL,
    company_id INT NOT NULL,
    transaction_type ENUM('RECEIPT', 'PAYMENT') NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    payment_method VARCHAR(50), -- CASH, BANK, NOTE ...
    trade_master_id INT, -- 연결된 전표 ID
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. PAYMENT ALLOCATIONS (입출금 배분)
CREATE TABLE IF NOT EXISTS payment_allocations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    payment_id INT NOT NULL,
    trade_master_id INT NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    FOREIGN KEY (payment_id) REFERENCES payment_transactions(id) ON DELETE CASCADE
);

-- 10. PERIOD CLOSINGS (기간 마감/시재)
CREATE TABLE IF NOT EXISTS period_closings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    revenue DECIMAL(15,2) DEFAULT 0,
    cogs DECIMAL(15,2) DEFAULT 0,
    gross_profit DECIMAL(15,2) DEFAULT 0,
    expenses DECIMAL(15,2) DEFAULT 0,
    net_profit DECIMAL(15,2) DEFAULT 0,
    closed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    note TEXT,
    
    -- Financial & Inventory Snapshot
    prev_inventory DECIMAL(15,2) DEFAULT 0,
    purchase_cost DECIMAL(15,2) DEFAULT 0,
    today_inventory DECIMAL(15,2) DEFAULT 0,
    system_cash DECIMAL(15,2) DEFAULT 0,
    actual_cash DECIMAL(15,2) DEFAULT 0,
    cash_inflow DECIMAL(15,2) DEFAULT 0,
    cash_outflow DECIMAL(15,2) DEFAULT 0,
    cash_expense DECIMAL(15,2) DEFAULT 0,
    inventory_loss DECIMAL(15,2) DEFAULT 0
);

-- 11. INVENTORY TRANSACTIONS (재고 수불부)
CREATE TABLE IF NOT EXISTS inventory_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    transaction_date DATETIME NOT NULL,
    transaction_type VARCHAR(20) NOT NULL, -- IN, OUT, ADJUST...
    product_id INT NOT NULL,
    warehouse_id INT,
    quantity DECIMAL(15,2) NOT NULL,
    reference_id INT, -- trade_detail_id or adjustment_id
    running_stock DECIMAL(15,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 12. INVENTORY ADJUSTMENTS (재고 조정)
CREATE TABLE IF NOT EXISTS inventory_adjustments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    adjustment_date DATE NOT NULL,
    product_id INT NOT NULL,
    warehouse_id INT,
    quantity DECIMAL(15,2) NOT NULL, -- 조정 수량 (+/-)
    reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 13. WAREHOUSES (창고)
CREATE TABLE IF NOT EXISTS warehouses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    location VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE
);

-- 14. INVENTORY PRODUCTIONS (재고 생산/작업) - [ACTUAL TABLE NAME]
CREATE TABLE IF NOT EXISTS inventory_productions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    output_inventory_id INT NOT NULL, -- Leads to purchase_inventory.id
    additional_cost DECIMAL(15,2) DEFAULT 0,
    memo VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 15. INVENTORY PRODUCTION INGREDIENTS (생산 투입 재료)
CREATE TABLE IF NOT EXISTS inventory_production_ingredients (
    id INT AUTO_INCREMENT PRIMARY KEY,
    production_id INT NOT NULL,
    used_inventory_id INT NOT NULL,
    used_quantity DECIMAL(10,2) NOT NULL,
    FOREIGN KEY (production_id) REFERENCES inventory_productions(id)
);

-- 16. INVENTORY AUDIT ITEMS (재고 실사 상세)
CREATE TABLE IF NOT EXISTS inventory_audit_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    audit_id INT NOT NULL,
    inventory_id INT NOT NULL,
    product_id INT NOT NULL,
    system_quantity DECIMAL(15,3) NOT NULL,
    actual_quantity DECIMAL(15,3) NOT NULL,
    diff_notes TEXT,
    is_checked TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 17. USERS (사용자)
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100),
    role ENUM('admin', 'user', 'viewer') DEFAULT 'user',
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
