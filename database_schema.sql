CREATE DATABASE IF NOT EXISTS trade_management;
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
    product_code VARCHAR(30) NOT NULL UNIQUE,
    product_name VARCHAR(100) NOT NULL,
    grade VARCHAR(20),
    category_id INT,
    weight DECIMAL(10,2),
    weight_unit VARCHAR(10) DEFAULT 'kg',
    category VARCHAR(50) COMMENT '레거시 카테고리명',
    notes TEXT,
    is_active TINYINT(1) DEFAULT 1,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_product_name (product_name)
);

-- 3. TRADE MASTERS (전표 마스터)
CREATE TABLE IF NOT EXISTS trade_masters (
    id INT AUTO_INCREMENT PRIMARY KEY,
    trade_number VARCHAR(30) UNIQUE NOT NULL,
    trade_type ENUM('PURCHASE', 'SALE', 'PRODUCTION') NOT NULL,
    trade_date DATE NOT NULL,
    company_id INT NOT NULL,
    warehouse_id INT,
    total_amount DECIMAL(15,2) DEFAULT 0.00,
    tax_amount DECIMAL(15,2) DEFAULT 0.00,
    total_price DECIMAL(15,2) DEFAULT 0.00,
    paid_amount DECIMAL(15,2) DEFAULT 0.00,
    payment_method VARCHAR(20),
    payment_status ENUM('UNPAID', 'PARTIAL', 'PAID') DEFAULT 'UNPAID',
    status ENUM('DRAFT', 'CONFIRMED', 'COMPLETED', 'CANCELLED') DEFAULT 'DRAFT',
    notes TEXT,
    created_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_trade_date (trade_date),
    INDEX idx_company_id (company_id)
);

-- 4. TRADE DETAILS (전표 상세)
CREATE TABLE IF NOT EXISTS trade_details (
    id INT AUTO_INCREMENT PRIMARY KEY,
    trade_master_id INT NOT NULL,
    seq_no INT NOT NULL,
    product_id INT NOT NULL,
    parent_detail_id INT NULL COMMENT '반품 추적용',
    quantity DECIMAL(15,2) NOT NULL,
    total_weight DECIMAL(15,2),
    weight_unit VARCHAR(10) DEFAULT 'kg',
    unit_price DECIMAL(15,2) NOT NULL,
    supply_amount DECIMAL(15,2) NOT NULL,
    tax_amount DECIMAL(15,2) DEFAULT 0.00,
    total_amount DECIMAL(15,2) NOT NULL,
    auction_price DECIMAL(15,2),
    notes VARCHAR(200),
    matching_status ENUM('PENDING', 'PARTIAL', 'MATCHED') DEFAULT 'PENDING',
    shipper_location VARCHAR(100),
    sender VARCHAR(100),
    purchase_price DECIMAL(12,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (trade_master_id) REFERENCES trade_masters(id) ON DELETE CASCADE
);

-- 5. PURCHASE INVENTORY (매입 재고 Lot)
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
    total_weight DECIMAL(15,2) DEFAULT 0.00,
    weight_unit VARCHAR(10) DEFAULT 'kg',
    shipper_location VARCHAR(255) DEFAULT '',
    sender VARCHAR(255) DEFAULT '',
    status ENUM('AVAILABLE', 'DEPLETED', 'CANCELLED') DEFAULT 'AVAILABLE',
    display_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_purchase_date (purchase_date),
    INDEX idx_product_id (product_id),
    INDEX idx_warehouse_id (warehouse_id),
    INDEX idx_purchase_inventory_display_order (display_order)
);

-- 6. SALE PURCHASE MATCHING (매출-매입 매칭)
CREATE TABLE IF NOT EXISTS sale_purchase_matching (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sale_detail_id INT NOT NULL,
    purchase_inventory_id INT NOT NULL,
    matched_quantity DECIMAL(15,2) NOT NULL,
    matched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sale_detail_id) REFERENCES trade_details(id) ON DELETE CASCADE,
    FOREIGN KEY (purchase_inventory_id) REFERENCES purchase_inventory(id) ON DELETE CASCADE
);

-- 7. EXPENSE CATEGORIES (지출 카테고리)
CREATE TABLE IF NOT EXISTS expense_categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    is_active TINYINT(1) DEFAULT 1,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 8. EXPENSES (지출/경비)
CREATE TABLE IF NOT EXISTS expenses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    expense_date DATE NOT NULL,
    category_id INT,
    amount DECIMAL(15,2) NOT NULL,
    description TEXT,
    payment_method VARCHAR(50) DEFAULT 'CASH',
    company_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES expense_categories(id)
);

-- 9. PAYMENT METHODS (결제 수단)
CREATE TABLE IF NOT EXISTS payment_methods (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(50) NOT NULL,
    is_active TINYINT(1) DEFAULT 1,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 10. PAYMENT TRANSACTIONS (입출금 내역)
CREATE TABLE IF NOT EXISTS payment_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    transaction_number VARCHAR(50),
    transaction_date DATE NOT NULL,
    company_id INT NOT NULL,
    transaction_type ENUM('RECEIPT', 'PAYMENT') NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    payment_method VARCHAR(50),
    trade_master_id INT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 11. PAYMENT ALLOCATIONS (입출금 배분)
CREATE TABLE IF NOT EXISTS payment_allocations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    payment_id INT NOT NULL,
    trade_master_id INT NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (payment_id) REFERENCES payment_transactions(id) ON DELETE CASCADE
);

-- 12. PERIOD CLOSINGS (기간 마감/시재)
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

-- 13. WAREHOUSES (창고)
CREATE TABLE IF NOT EXISTS warehouses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type ENUM('MAIN', 'STORAGE', 'VEHICLE') DEFAULT 'STORAGE',
    is_default TINYINT(1) DEFAULT 0,
    is_active TINYINT(1) DEFAULT 1,
    address VARCHAR(200),
    description TEXT,
    display_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 14. INVENTORY TRANSACTIONS (재고 수불부)
CREATE TABLE IF NOT EXISTS inventory_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    transaction_date DATETIME NOT NULL,
    transaction_type ENUM('IN', 'OUT', 'ADJUST', 'TRANSFER', 'PRODUCTION') NOT NULL, 
    product_id INT NOT NULL,
    warehouse_id INT,
    quantity DECIMAL(15,2) NOT NULL,
    weight DECIMAL(15,2) DEFAULT 0.00,
    unit_price DECIMAL(15,2) DEFAULT 0.00,
    before_quantity DECIMAL(15,2) DEFAULT 0.00,
    after_quantity DECIMAL(15,2) DEFAULT 0.00,
    trade_detail_id INT,
    reference_number VARCHAR(50),
    created_by VARCHAR(50) DEFAULT 'system',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_date (transaction_date),
    INDEX idx_product (product_id)
);

-- 15. INVENTORY ADJUSTMENTS (재고 조정)
CREATE TABLE IF NOT EXISTS inventory_adjustments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    adjustment_date DATE NOT NULL,
    adjusted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    purchase_inventory_id INT,
    quantity_change DECIMAL(15,2) NOT NULL,
    reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 16. WAREHOUSE TRANSFERS (창고 이동)
CREATE TABLE IF NOT EXISTS warehouse_transfers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    purchase_inventory_id INT,
    new_inventory_id INT,
    transfer_date DATE NOT NULL,
    product_id INT NOT NULL,
    from_warehouse_id INT NOT NULL,
    to_warehouse_id INT NOT NULL,
    quantity DECIMAL(15,2) NOT NULL,
    weight DECIMAL(15,2) DEFAULT 0.00,
    status ENUM('COMPLETED','CANCELLED') DEFAULT 'COMPLETED',
    notes TEXT,
    created_by VARCHAR(50) DEFAULT 'system',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 17. INVENTORY PRODUCTIONS (재고 생산)
CREATE TABLE IF NOT EXISTS inventory_productions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    output_inventory_id INT NOT NULL, 
    additional_cost DECIMAL(15,2) DEFAULT 0,
    memo VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 18. INVENTORY PRODUCTION INGREDIENTS (생산 재료)
CREATE TABLE IF NOT EXISTS inventory_production_ingredients (
    id INT AUTO_INCREMENT PRIMARY KEY,
    production_id INT NOT NULL,
    used_inventory_id INT NOT NULL,
    used_quantity DECIMAL(10,2) NOT NULL,
    FOREIGN KEY (production_id) REFERENCES inventory_productions(id)
);

-- 19. INVENTORY AUDITS (재고 실사 마스터)
CREATE TABLE IF NOT EXISTS inventory_audits (
    id INT AUTO_INCREMENT PRIMARY KEY,
    warehouse_id INT NOT NULL,
    audit_date DATE NOT NULL,
    status ENUM('IN_PROGRESS','COMPLETED','CANCELLED') DEFAULT 'IN_PROGRESS',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 20. INVENTORY AUDIT ITEMS (재고 실사 상세)
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
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (audit_id) REFERENCES inventory_audits(id) ON DELETE CASCADE
);

-- 21. AUCTION ACCOUNTS (경매 계정)
CREATE TABLE IF NOT EXISTS auction_accounts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    account_name VARCHAR(50) NOT NULL,
    site_url VARCHAR(200) NOT NULL,
    username VARCHAR(100) NOT NULL,
    password VARCHAR(255) NOT NULL,
    is_active TINYINT(1) DEFAULT 1,
    last_used TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 22. AUCTION CRAWL HISTORY (경매 수집 이력)
CREATE TABLE IF NOT EXISTS auction_crawl_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    crawl_date DATE NOT NULL,
    account_id INT,
    total_records INT DEFAULT 0,
    success_records INT DEFAULT 0,
    failed_records INT DEFAULT 0,
    status ENUM('SUCCESS','PARTIAL','FAILED') DEFAULT 'SUCCESS',
    error_message TEXT,
    execution_time INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES auction_accounts(id)
);

-- 23. AUCTION RAW DATA (경매 수집 데이터)
CREATE TABLE IF NOT EXISTS auction_raw_data (
    id INT AUTO_INCREMENT PRIMARY KEY,
    auction_date DATE NOT NULL,
    account_id INT,
    arrive_no VARCHAR(50),
    shipper_location VARCHAR(100),
    sender VARCHAR(100),
    product_name VARCHAR(200),
    grade VARCHAR(50),
    weight VARCHAR(50),
    unit_name VARCHAR(50),
    count INT,
    unit_price DECIMAL(15,2),
    total_price DECIMAL(15,2),
    trade_detail_id INT,
    status ENUM('PENDING','IMPORTED','IGNORED') DEFAULT 'PENDING',
    import_note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES auction_accounts(id),
    INDEX idx_auction_date_account (auction_date, account_id)
);

-- 24. PRODUCT MAPPING (품목 매핑)
CREATE TABLE IF NOT EXISTS product_mapping (
    id INT AUTO_INCREMENT PRIMARY KEY,
    auction_product_name VARCHAR(200) NOT NULL,
    auction_weight VARCHAR(20) DEFAULT '',
    auction_grade VARCHAR(50) DEFAULT '',
    system_product_id INT,
    match_type ENUM('AUTO','MANUAL') DEFAULT 'MANUAL',
    confidence INT DEFAULT 100,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 25. CATEGORIES (품목 분류)
CREATE TABLE IF NOT EXISTS categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category_name VARCHAR(50) NOT NULL UNIQUE,
    parent_id INT,
    level INT DEFAULT 1,
    sort_order INT DEFAULT 0,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
);

-- 26. COMPANY INFO (자사 정보)
CREATE TABLE IF NOT EXISTS company_info (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_name VARCHAR(100) NOT NULL,
    business_number VARCHAR(20),
    ceo_name VARCHAR(50),
    company_type VARCHAR(100),
    company_category VARCHAR(100),
    address VARCHAR(255),
    address2 VARCHAR(200),
    phone VARCHAR(20),
    fax VARCHAR(20),
    email VARCHAR(100),
    bank_name VARCHAR(50),
    account_number VARCHAR(50),
    account_holder VARCHAR(50),
    logo_url VARCHAR(255),
    stamp_url VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 27. SYSTEM SETTINGS (시스템 설정)
CREATE TABLE IF NOT EXISTS system_settings (
    setting_key VARCHAR(100) PRIMARY KEY,
    setting_value TEXT,
    description VARCHAR(255),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 28. ROLES (권한 그룹)
CREATE TABLE IF NOT EXISTS roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    description VARCHAR(255),
    is_system BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 29. PERMISSIONS (상세 권한)
CREATE TABLE IF NOT EXISTS permissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    resource VARCHAR(50) NOT NULL,
    action VARCHAR(20) NOT NULL,
    description VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_permission (resource, action)
);

-- 30. ROLE PERMISSIONS (그룹-권한 매핑)
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id INT NOT NULL,
    permission_id INT NOT NULL,
    PRIMARY KEY (role_id, permission_id),
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

-- 31. USERS (사용자)
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100),
    role VARCHAR(20) DEFAULT 'user',
    role_id INT DEFAULT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    password VARCHAR(255),
    user_name VARCHAR(255),
    email VARCHAR(100),
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE SET NULL
);

-- [PATCH] Safe Add 'full_name' Column Procedure (v1.0.30)
DROP PROCEDURE IF EXISTS AddFullNameToUsers;
DELIMITER //
CREATE PROCEDURE AddFullNameToUsers()
BEGIN
    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'full_name'
    ) THEN
        ALTER TABLE users ADD COLUMN full_name VARCHAR(100);
    END IF;
END //
DELIMITER ;
CALL AddFullNameToUsers();
DROP PROCEDURE AddFullNameToUsers;


-- 32. USER MENU SETTINGS (사용자 메뉴 설정)
CREATE TABLE IF NOT EXISTS user_menu_settings (
    user_id INT PRIMARY KEY,
    menu_config JSON NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 33. LOGIN HISTORY (로그인 기록)
CREATE TABLE IF NOT EXISTS login_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    action_type VARCHAR(50) NOT NULL, -- LOGIN, LOGOUT
    ip_address VARCHAR(100),
    user_agent VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 33. DAILY CLOSINGS (일일 마감)
CREATE TABLE IF NOT EXISTS daily_closings (
    closing_date DATE PRIMARY KEY,
    system_cash_balance DECIMAL(15,2) DEFAULT 0.00,
    actual_cash_balance DECIMAL(15,2) DEFAULT 0.00,
    difference DECIMAL(15,2) DEFAULT 0.00,
    closing_note TEXT,
    closed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    closed_by VARCHAR(50),
    prev_inventory_value DECIMAL(15,2) DEFAULT 0.00,
    today_purchase_cost DECIMAL(15,2) DEFAULT 0.00,
    today_inventory_value DECIMAL(15,2) DEFAULT 0.00,
    calculated_cogs DECIMAL(15,2) DEFAULT 0.00,
    today_sales_revenue DECIMAL(15,2) DEFAULT 0.00,
    gross_profit DECIMAL(15,2) DEFAULT 0.00
);

-- 34. DAILY CLOSING STOCKS (재고 스냅샷)
CREATE TABLE IF NOT EXISTS daily_closing_stocks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    closing_date DATE NOT NULL,
    purchase_inventory_id INT NOT NULL,
    system_quantity DECIMAL(10,2) DEFAULT 0.00,
    actual_quantity DECIMAL(10,2) DEFAULT 0.00,
    adjustment_quantity DECIMAL(10,2) DEFAULT 0.00,
    unit_price DECIMAL(15,2) DEFAULT 0.00,
    total_value DECIMAL(15,2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (closing_date) REFERENCES daily_closings(closing_date) ON DELETE CASCADE
);

-- 35. AGGREGATE INVENTORY (재고 집계)
CREATE TABLE IF NOT EXISTS inventory (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL UNIQUE,
    quantity DECIMAL(15,2) DEFAULT 0.00,
    weight DECIMAL(15,2) DEFAULT 0.00,
    purchase_price DECIMAL(15,2) DEFAULT 0.00,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_product_id (product_id),
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- TRIGGERS (재고 자동 연동 트리거)

DELIMITER //

-- [TRIGGER 1] 전표 상세 입력 후 재고 자동 반영
CREATE TRIGGER after_trade_detail_insert
AFTER INSERT ON trade_details
FOR EACH ROW
BEGIN
    DECLARE v_trade_type VARCHAR(20);
    DECLARE v_before_qty DECIMAL(15,2) DEFAULT 0;
    DECLARE v_after_qty DECIMAL(15,2) DEFAULT 0;
    DECLARE v_trade_date DATE;
    DECLARE v_count INT DEFAULT 0;
    DECLARE v_company_id INT;
    DECLARE v_warehouse_id INT;
    DECLARE v_display_order INT DEFAULT 1;

    SELECT trade_type, trade_date, company_id, warehouse_id 
    INTO v_trade_type, v_trade_date, v_company_id, v_warehouse_id
    FROM trade_masters WHERE id = NEW.trade_master_id;

    SELECT COUNT(*) INTO v_count FROM inventory WHERE product_id = NEW.product_id;

    IF v_count > 0 THEN
        SELECT IFNULL(quantity, 0) INTO v_before_qty
        FROM inventory WHERE product_id = NEW.product_id;
    ELSE
        SET v_before_qty = 0;
    END IF;

    IF v_trade_type = 'PURCHASE' THEN
        -- [NEW] 신규 순번 계산: 현재 최대 순번 + 1
        SELECT IFNULL(MAX(display_order), 0) + 1 INTO v_display_order FROM purchase_inventory;

        SET v_after_qty = v_before_qty + NEW.quantity;

        -- 1. Updates Aggregate Inventory
        INSERT INTO inventory (product_id, quantity, weight, purchase_price)
        VALUES (NEW.product_id, NEW.quantity, IFNULL(NEW.total_weight, 0), NEW.unit_price)
        ON DUPLICATE KEY UPDATE
            quantity = quantity + NEW.quantity,
            weight = weight + IFNULL(NEW.total_weight, 0),
            purchase_price = NEW.unit_price;

        -- 2. Insert into purchase_inventory (For Lot Matching)
        INSERT INTO purchase_inventory (
            trade_detail_id, product_id, company_id, warehouse_id, purchase_date,
            original_quantity, remaining_quantity, unit_price, total_weight, weight_unit,
            shipper_location, sender, status, display_order
        ) VALUES (
            NEW.id, NEW.product_id, v_company_id, IFNULL(v_warehouse_id, 1), v_trade_date,
            NEW.quantity, NEW.quantity, NEW.unit_price, IFNULL(NEW.total_weight, 0), NEW.weight_unit,
            IFNULL(NEW.shipper_location, ''), IFNULL(NEW.sender, ''), 'AVAILABLE', v_display_order
        );

        -- 3. Insert into inventory_transactions (For History)
        INSERT INTO inventory_transactions
        (transaction_date, transaction_type, product_id, quantity, weight, unit_price,
         before_quantity, after_quantity, trade_detail_id, reference_number, created_by)
        VALUES
        (v_trade_date, 'IN', NEW.product_id, NEW.quantity, IFNULL(NEW.total_weight, 0), NEW.unit_price,
         v_before_qty, v_after_qty, NEW.id,
         (SELECT trade_number FROM trade_masters WHERE id = NEW.trade_master_id), 'system');

    ELSEIF v_trade_type = 'SALE' THEN
        SET v_after_qty = v_before_qty - NEW.quantity;

        -- Negative Inventory Guard
        IF v_after_qty < 0 THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = '재고가 부족하여 매출을 등록할 수 없습니다. (현재 재고보다 매출 수량이 많음)';
        END IF;

        UPDATE inventory
        SET quantity = quantity - NEW.quantity,
            weight = weight - IFNULL(NEW.total_weight, 0)
        WHERE product_id = NEW.product_id;

        INSERT INTO inventory_transactions
        (transaction_date, transaction_type, product_id, quantity, weight, unit_price,
         before_quantity, after_quantity, trade_detail_id, reference_number, created_by)
        VALUES
        (v_trade_date, 'OUT', NEW.product_id, NEW.quantity, IFNULL(NEW.total_weight, 0), NEW.unit_price,
         v_before_qty, v_after_qty, NEW.id,
         (SELECT trade_number FROM trade_masters WHERE id = NEW.trade_master_id), 'system');
    END IF;
END //

-- [TRIGGER 2] 전표 상세 삭제 전 재고 원상복구
CREATE TRIGGER before_trade_detail_delete
BEFORE DELETE ON trade_details
FOR EACH ROW
BEGIN
    DECLARE v_trade_type VARCHAR(20);
    DECLARE v_matched_count INT DEFAULT 0;
    
    SELECT trade_type INTO v_trade_type
    FROM trade_masters WHERE id = OLD.trade_master_id;
    
    IF v_trade_type = 'PURCHASE' THEN
        -- 매칭된 내역이 있는지 확인
        SELECT COUNT(*) INTO v_matched_count
        FROM sale_purchase_matching spm
        JOIN purchase_inventory pi ON spm.purchase_inventory_id = pi.id
        WHERE pi.trade_detail_id = OLD.id;
        
        -- 매칭된 내역이 있으면 에러 발생 (삭제 불가)
        IF v_matched_count > 0 THEN
            SIGNAL SQLSTATE '45000' 
            SET MESSAGE_TEXT = '이미 매출과 매칭된 매입은 삭제할 수 없습니다.';
        END IF;
        
        -- Aggregate Inventory 차감 (매입 취소이므로 재고 감소)
        UPDATE inventory 
        SET quantity = quantity - OLD.quantity,
            weight = weight - IFNULL(OLD.total_weight, 0)
        WHERE product_id = OLD.product_id;
        
        -- purchase_inventory에서 삭제
        DELETE FROM purchase_inventory WHERE trade_detail_id = OLD.id;
    END IF;
    
    IF v_trade_type = 'SALE' THEN
        -- Aggregate Inventory 복구 (매출 취소이므로 재고 증가)
        UPDATE inventory 
        SET quantity = quantity + OLD.quantity,
            weight = weight + IFNULL(OLD.total_weight, 0)
        WHERE product_id = OLD.product_id;

        -- 매출 삭제 시: 매칭된 재고 복원
        UPDATE purchase_inventory pi
        JOIN sale_purchase_matching spm ON pi.id = spm.purchase_inventory_id
        SET pi.remaining_quantity = pi.remaining_quantity + spm.matched_quantity,
            pi.status = 'AVAILABLE'
        WHERE spm.sale_detail_id = OLD.id;
        
        -- 매칭 기록 삭제
        DELETE FROM sale_purchase_matching WHERE sale_detail_id = OLD.id;
    END IF;
    
    -- inventory_transactions에서 관련 기록 삭제
    DELETE FROM inventory_transactions WHERE trade_detail_id = OLD.id;
END //

DELIMITER ;

-- INITIAL DATA (초기 데이터)

-- 1. Create Default Role
INSERT IGNORE INTO roles (name, description, is_system) 
VALUES ('Administrator', 'System Administrator with full access', TRUE);

-- 1.1 Permission definitions (All Menus)
INSERT IGNORE INTO permissions (resource, action, description) VALUES
-- Basic Info
('COMPANY_LIST', 'READ', '거래처 목록 조회'), ('COMPANY_LIST', 'CREATE', '거래처 등록'), ('COMPANY_LIST', 'UPDATE', '거래처 수정'), ('COMPANY_LIST', 'DELETE', '거래처 삭제'),
('PRODUCT_LIST', 'READ', '품목 목록 조회'), ('PRODUCT_LIST', 'CREATE', '품목 등록'), ('PRODUCT_LIST', 'UPDATE', '품목 수정'), ('PRODUCT_LIST', 'DELETE', '품목 삭제'),
('WAREHOUSES', 'READ', '창고 조회'), ('WAREHOUSES', 'CREATE', '창고 등록'), ('WAREHOUSES', 'UPDATE', '창고 수정'), ('WAREHOUSES', 'DELETE', '창고 삭제'),
('PAYMENT_METHODS', 'READ', '결제수단 조회'), ('PAYMENT_METHODS', 'CREATE', '결제수단 등록'), ('PAYMENT_METHODS', 'UPDATE', '결제수단 수정'), ('PAYMENT_METHODS', 'DELETE', '결제수단 삭제'),
('EXPENSE_CATEGORIES', 'READ', '지출항목 조회'), ('EXPENSE_CATEGORIES', 'CREATE', '지출항목 등록'), ('EXPENSE_CATEGORIES', 'UPDATE', '지출항목 수정'), ('EXPENSE_CATEGORIES', 'DELETE', '지출항목 삭제'),

-- Trades
('TRADE_LIST', 'READ', '전표 목록 조회'), ('TRADE_LIST', 'CREATE', '전표 등록'), ('TRADE_LIST', 'UPDATE', '전표 수정'), ('TRADE_LIST', 'DELETE', '전표 삭제'),
('PURCHASE', 'READ', '매입 전표 조회'), ('PURCHASE', 'CREATE', '매입 전표 등록'),
('SALE', 'READ', '매출 전표 조회'), ('SALE', 'CREATE', '매출 전표 등록'),

-- Auction
('AUCTION_IMPORT', 'READ', '경매 데이터 조회'), ('AUCTION_IMPORT', 'CREATE', '경매 데이터 가져오기'), ('AUCTION_IMPORT', 'UPDATE', '경매 데이터 수정'), ('AUCTION_IMPORT', 'DELETE', '경매 데이터 삭제'),
('AUCTION_ACCOUNTS', 'READ', '경매 계정 조회'), ('AUCTION_ACCOUNTS', 'CREATE', '경매 계정 등록'), ('AUCTION_ACCOUNTS', 'UPDATE', '경매 계정 수정'), ('AUCTION_ACCOUNTS', 'DELETE', '경매 계정 삭제'),

-- Inventory
('INVENTORY_LIST', 'READ', '재고 조회'),
('INVENTORY_QUICK', 'READ', '재고 수정(Quick)'), ('INVENTORY_QUICK', 'UPDATE', '재고 수정'),
('INVENTORY_TRANSFER', 'READ', '재고 이동 조회'), ('INVENTORY_TRANSFER', 'CREATE', '재고 이동 등록'),
('INVENTORY_PRODUCTION', 'READ', '재고 작업 조회'), ('INVENTORY_PRODUCTION', 'CREATE', '재고 작업 등록'),
('INVENTORY_PRODUCTION_HISTORY', 'READ', '재고 작업 이력 조회'),
('MATCHING', 'READ', '매칭 관리 조회'), ('MATCHING', 'UPDATE', '매칭 실행'),
('INVENTORY_HISTORY', 'READ', '재고 이력 조회'),
('INVENTORY_AUDIT', 'READ', '재고 실사 조회'), ('INVENTORY_AUDIT', 'CREATE', '재고 실사 등록'), ('INVENTORY_AUDIT', 'UPDATE', '재고 실사 수정'), ('INVENTORY_AUDIT', 'DELETE', '재고 실사 삭제'),

-- Payment
('COMPANY_BALANCES', 'READ', '거래처 잔고 조회'),
('EXPENSES', 'READ', '지출 내역 조회'), ('EXPENSES', 'CREATE', '지출 등록'), ('EXPENSES', 'UPDATE', '지출 수정'), ('EXPENSES', 'DELETE', '지출 삭제'),

-- Management
('SETTLEMENT', 'READ', '정산 리포트 조회'),
('SETTLEMENT_HISTORY', 'READ', '정산 이력 조회'),

-- Statistics
('STATISTICS', 'READ', '통계 조회'),

-- Settings
('SETTINGS', 'READ', '시스템 설정 조회'), ('SETTINGS', 'UPDATE', '시스템 설정 수정'),
('BACKUP_SYSTEM', 'READ', '백업 관리 조회'), ('BACKUP_SYSTEM', 'CREATE', '백업 생성'),
('COMPANY_INFO', 'READ', '본사 정보 조회'), ('COMPANY_INFO', 'UPDATE', '본사 정보 수정'),
('USER_MANAGEMENT', 'READ', '사용자 관리 조회'), ('USER_MANAGEMENT', 'CREATE', '사용자 등록'), ('USER_MANAGEMENT', 'UPDATE', '사용자 수정'), ('USER_MANAGEMENT', 'DELETE', '사용자 삭제'),
('ROLE_MANAGEMENT', 'READ', '권한 관리 조회'), ('ROLE_MANAGEMENT', 'CREATE', '권한항목 등록'), ('ROLE_MANAGEMENT', 'UPDATE', '권한항목 수정'), ('ROLE_MANAGEMENT', 'DELETE', '권한항목 삭제'),
('MESSAGE_TEST', 'READ', '테스트 페이지 조회'),

-- Dashboard
('DASHBOARD', 'READ', '대시보드 조회');

-- 1.2 Grant ALL permissions to Administrator
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'Administrator';

-- 2. Create Admin User (Password: admin1234)
INSERT IGNORE INTO users (username, password_hash, role, full_name, role_id) 
SELECT 'admin', '$2b$10$Ap2OlDUGfAw6BU0DXnEfjeB1WFISDMY7KMFQeaCCpSjuCRIfn.kOO6', 'admin', '관리자', id 
FROM roles WHERE name = 'Administrator'
ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), role_id = VALUES(role_id);

-- (Optional) Force update for admin user to ensure password is admin1234
UPDATE users SET password_hash = '$2b$10$Ap2OlDUGfAw6BU0DXnEfjeB1WFISDMY7KMFQeaCCpSjuCRIfn.kOO6'
WHERE username = 'admin';

-- 3. SAMPLE SEED DATA (배포용 샘플 데이터)

-- 3.1 COMPANIES (거래처)
INSERT IGNORE INTO companies (company_code, business_name, company_name, company_type_flag, company_type, is_active, sort_order) VALUES
('S001', '(주)홍다푸드', '(주)홍다푸드', 'SUPPLIER', '도매', 1, 1),
('C001', '마르코식품', '마르코식품', 'CUSTOMER', '식당', 1, 2),
('B001', '샘플유통', '샘플유통', 'BOTH', '유통', 1, 3);

-- 3.2 WAREHOUSES (창고)
INSERT IGNORE INTO warehouses (name, type, is_default, is_active, display_order) VALUES
('메인 냉동고', 'MAIN', 1, 1, 1),
('외부 창고', 'STORAGE', 0, 1, 2),
('보관 창고', 'STORAGE', 0, 1, 3);

-- 3.3 EXPENSE CATEGORIES (지출 항목)
INSERT IGNORE INTO expense_categories (name, is_active, sort_order) VALUES
('식비', 1, 1),
('차량유지비', 1, 2),
('소모품비', 1, 3),
('임차료', 1, 4),
('기타', 1, 5);

-- 3.4 COMPANY INFO (본사/자사 정보)
INSERT IGNORE INTO company_info 
(company_name, business_number, ceo_name, company_type, company_category, address, phone, email, notes) VALUES
('(주)홍다푸드', '123-45-67890', '홍길동', '도소매', '농수산물', '서울시 송파구 가락동', '02-1234-5678', 'admin@hongdafood.com', '기초 설정 정보입니다. 수정하여 사용하세요.');