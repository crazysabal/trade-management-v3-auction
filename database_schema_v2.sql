-- ACTIVE SCHEMA REFERENCE (Updated for Settlement Feature)
-- This file represents the tables currently in active use by the codebase.

USE trade_management;

-- 1. COMPANIES (거래처)
CREATE TABLE IF NOT EXISTS companies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_name VARCHAR(100) NOT NULL,
    company_code VARCHAR(50),
    company_type_flag ENUM('CUSTOMER', 'SUPPLIER', 'BOTH'),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. PRODUCTS (품목)
CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_name VARCHAR(100) NOT NULL,
    weight DECIMAL(10,2),
    grade VARCHAR(50),
    cnt INT DEFAULT 0 COMMENT '입수량',
    is_active BOOLEAN DEFAULT TRUE
);

-- 3. TRADE MASTERS (전표 마스터)
-- 입출금(RECEIPT/PAYMENT) 연결을 위해 total_amount, paid_amount 관리
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
    product_id INT,
    quantity DECIMAL(15,2) DEFAULT 0,
    unit_price DECIMAL(15,2) DEFAULT 0,
    supply_amount DECIMAL(15,2) DEFAULT 0,
    tax_amount DECIMAL(15,2) DEFAULT 0,
    total_amount DECIMAL(15,2) DEFAULT 0, -- 라인별 합계
    purchase_price DECIMAL(15,2), -- [중요] 매입단가 보존 (마진 계산용)
    FOREIGN KEY (trade_master_id) REFERENCES trade_masters(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)
);

-- 5. PURCHASE INVENTORY (매입 재고)
CREATE TABLE IF NOT EXISTS purchase_inventory (
    id INT AUTO_INCREMENT PRIMARY KEY,
    trade_detail_id INT, -- 연결된 매입 상세
    product_id INT NOT NULL,
    warehouse_id INT,
    company_id INT,      -- 매입처
    purchase_date DATE,
    original_quantity DECIMAL(15,2) DEFAULT 0,
    remaining_quantity DECIMAL(15,2) DEFAULT 0,
    unit_price DECIMAL(15,2) DEFAULT 0,
    status ENUM('AVAILABLE', 'OUT_OF_STOCK') DEFAULT 'AVAILABLE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. SALE PURCHASE MATCHING (매출-매입 매칭)
CREATE TABLE IF NOT EXISTS sale_purchase_matching (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sale_detail_id INT NOT NULL,     -- 매출 상세 ID
    purchase_inventory_id INT NOT NULL, -- 매입 재고 ID
    matched_quantity DECIMAL(15,2) NOT NULL,
    matched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. EXPENSES (지출/경비) - [NEW] Schema Fixed
CREATE TABLE IF NOT EXISTS expenses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    expense_date DATE NOT NULL, -- [Fixed] was transaction_date in older files
    category_id INT,
    amount DECIMAL(15,2) NOT NULL,
    description TEXT,
    payment_method VARCHAR(50) DEFAULT 'CASH',
    company_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 8. PAYMENT TRANSACTIONS (입출금 내역)
-- company_balances 테이블 없이 이 테이블의 집계로 잔고 파악
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

-- 10. DAILY CLOSINGS (일일 시재 마감) - [NEW]
CREATE TABLE IF NOT EXISTS daily_closings (
    closing_date DATE NOT NULL PRIMARY KEY,
    system_cash_balance DECIMAL(15,2) DEFAULT 0 NOT NULL,
    actual_cash_balance DECIMAL(15,2) DEFAULT 0 NOT NULL,
    difference DECIMAL(15,2) DEFAULT 0 NOT NULL,
    closing_note TEXT,
    closed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    closed_by VARCHAR(50)
);
