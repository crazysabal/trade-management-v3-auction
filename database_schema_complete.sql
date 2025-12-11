-- 매입/매출 거래명세서 + 재고관리 + 경매 크롤링 통합 스키마
-- MySQL 5.x 호환 버전

-- 데이터베이스 생성
CREATE DATABASE IF NOT EXISTS trade_management CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE trade_management;

-- 1. 거래처 테이블
CREATE TABLE IF NOT EXISTS companies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_code VARCHAR(20) UNIQUE NOT NULL,
    company_name VARCHAR(100) NOT NULL,
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
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_company_code (company_code),
    INDEX idx_company_name (company_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. 품목 테이블
CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_code VARCHAR(30) UNIQUE NOT NULL,
    product_name VARCHAR(100) NOT NULL,
    fruit_type VARCHAR(50),
    grade VARCHAR(20),
    origin VARCHAR(50),
    specification VARCHAR(100),
    unit VARCHAR(20) DEFAULT 'Box',
    box_weight DECIMAL(10,2),
    standard_price DECIMAL(15,2) DEFAULT 0,
    purchase_price DECIMAL(15,2) DEFAULT 0,
    sale_price DECIMAL(15,2) DEFAULT 0,
    category VARCHAR(50),
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_product_code (product_code),
    INDEX idx_product_name (product_name),
    INDEX idx_fruit_type (fruit_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. 거래 전표 마스터 테이블
CREATE TABLE IF NOT EXISTS trade_masters (
    id INT AUTO_INCREMENT PRIMARY KEY,
    trade_number VARCHAR(30) UNIQUE NOT NULL,
    trade_type ENUM('PURCHASE', 'SALE') NOT NULL,
    trade_date DATE NOT NULL,
    company_id INT NOT NULL,
    total_amount DECIMAL(15,2) DEFAULT 0,
    tax_amount DECIMAL(15,2) DEFAULT 0,
    total_price DECIMAL(15,2) DEFAULT 0,
    payment_method VARCHAR(20),
    delivery_address VARCHAR(200),
    delivery_date DATE,
    notes TEXT,
    status ENUM('DRAFT', 'CONFIRMED', 'COMPLETED', 'CANCELLED') DEFAULT 'DRAFT',
    created_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT,
    INDEX idx_trade_number (trade_number),
    INDEX idx_trade_date (trade_date),
    INDEX idx_company_id (company_id),
    INDEX idx_trade_type (trade_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. 거래 전표 상세 테이블
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (trade_master_id) REFERENCES trade_masters(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
    INDEX idx_trade_master_id (trade_master_id),
    INDEX idx_product_id (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. 재고 현황 테이블
CREATE TABLE IF NOT EXISTS inventory (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL UNIQUE,
    current_quantity DECIMAL(15,2) DEFAULT 0,
    current_weight DECIMAL(15,2) DEFAULT 0,
    last_purchase_price DECIMAL(15,2),
    last_sale_price DECIMAL(15,2),
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    INDEX idx_product_id (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. 재고 수불부 테이블
CREATE TABLE IF NOT EXISTS inventory_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    transaction_date DATE NOT NULL,
    transaction_type ENUM('IN', 'OUT', 'ADJUST') NOT NULL,
    product_id INT NOT NULL,
    quantity DECIMAL(15,2) NOT NULL,
    weight DECIMAL(15,2),
    unit_price DECIMAL(15,2),
    before_quantity DECIMAL(15,2) NOT NULL,
    after_quantity DECIMAL(15,2) NOT NULL,
    trade_detail_id INT,
    reference_number VARCHAR(50),
    notes TEXT,
    created_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
    FOREIGN KEY (trade_detail_id) REFERENCES trade_details(id) ON DELETE SET NULL,
    INDEX idx_transaction_date (transaction_date),
    INDEX idx_product_id (product_id),
    INDEX idx_transaction_type (transaction_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. 사용자 테이블
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    user_name VARCHAR(50) NOT NULL,
    email VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 8. 경매 사이트 계정 관리 테이블
CREATE TABLE IF NOT EXISTS auction_accounts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    account_name VARCHAR(50) NOT NULL,
    site_url VARCHAR(200) NOT NULL,
    username VARCHAR(100) NOT NULL,
    password VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    last_used TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 9. 품목 매칭 테이블
CREATE TABLE IF NOT EXISTS product_mapping (
    id INT AUTO_INCREMENT PRIMARY KEY,
    auction_product_name VARCHAR(200) NOT NULL,
    system_product_id INT,
    match_type ENUM('AUTO', 'MANUAL') DEFAULT 'MANUAL',
    confidence INT DEFAULT 100,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (system_product_id) REFERENCES products(id) ON DELETE SET NULL,
    UNIQUE KEY uk_auction_product (auction_product_name),
    INDEX idx_system_product (system_product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 10. 낙찰 원본 데이터 저장
CREATE TABLE IF NOT EXISTS auction_raw_data (
    id INT AUTO_INCREMENT PRIMARY KEY,
    auction_date DATE NOT NULL,
    arrive_no VARCHAR(50),
    sender VARCHAR(100),
    product_name VARCHAR(200),
    weight VARCHAR(50),
    unit_name VARCHAR(50),
    count INT,
    unit_price DECIMAL(15,2),
    total_price DECIMAL(15,2),
    trade_detail_id INT,
    status ENUM('PENDING', 'IMPORTED', 'IGNORED') DEFAULT 'PENDING',
    import_note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (trade_detail_id) REFERENCES trade_details(id) ON DELETE SET NULL,
    INDEX idx_auction_date (auction_date),
    INDEX idx_arrive_no (arrive_no),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 11. 크롤링 실행 이력
CREATE TABLE IF NOT EXISTS auction_crawl_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    crawl_date DATE NOT NULL,
    account_id INT,
    total_records INT DEFAULT 0,
    success_records INT DEFAULT 0,
    failed_records INT DEFAULT 0,
    status ENUM('SUCCESS', 'PARTIAL', 'FAILED') DEFAULT 'SUCCESS',
    error_message TEXT,
    execution_time INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES auction_accounts(id) ON DELETE SET NULL,
    INDEX idx_crawl_date (crawl_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 기본 관리자 계정 생성
INSERT INTO users (username, password, user_name, email) 
VALUES ('admin', '$2b$10$rYz5VqR3h9z9PqC5xJ5u7.qS5wZYJZQYvFQYqZQYvFQYqZQYvFQYq', '관리자', 'admin@example.com')
ON DUPLICATE KEY UPDATE username=username;

-- 샘플 거래처 데이터
INSERT INTO companies (company_code, company_name, business_number, ceo_name, company_type, company_category, address, phone, company_type_flag) VALUES
('P001', '김사과농장', '123-45-67890', '김사과', '농업', '과일재배', '충청북도 충주시 사과로 123', '043-1234-5678', 'SUPPLIER'),
('P002', '이배과수원', '234-56-78901', '이배', '농업', '과일재배', '전라남도 나주시 배나무길 456', '061-2345-6789', 'SUPPLIER'),
('P003', '박포도농원', '345-67-89012', '박포도', '농업', '과일재배', '경상북도 상주시 포도단지 789', '054-3456-7890', 'SUPPLIER'),
('W001', '서울청과시장', '456-78-90123', '최도매', '도매업', '과일도매', '서울시 송파구 가락로 123', '02-4567-8901', 'CUSTOMER'),
('W002', '부산과일상회', '567-89-01234', '정과일', '도매업', '과일도매', '부산시 사상구 과일로 456', '051-5678-9012', 'CUSTOMER'),
('R001', '대형마트 본점', '678-90-12345', '강마트', '소매업', '대형마트', '서울시 강남구 테헤란로 789', '02-6789-0123', 'BOTH')
ON DUPLICATE KEY UPDATE company_code=company_code;

-- 샘플 품목 데이터
INSERT INTO products (product_code, product_name, fruit_type, grade, origin, specification, unit, box_weight, standard_price, purchase_price, sale_price, category) VALUES
('F001', '사과', '사과', '특', '충주', '10kg/15입', 'Box', 10.00, 50000, 45000, 55000, '과일'),
('F002', '사과', '사과', '상', '충주', '10kg/18입', 'Box', 10.00, 40000, 35000, 45000, '과일'),
('F003', '배', '배', '특', '나주', '15kg/12입', 'Box', 15.00, 70000, 65000, 75000, '과일'),
('F004', '배', '배', '상', '나주', '15kg/15입', 'Box', 15.00, 55000, 50000, 60000, '과일'),
('F005', '포도', '포도', '특', '상주', '5kg/10송이', 'Box', 5.00, 35000, 30000, 40000, '과일'),
('F006', '포도', '포도', '상', '상주', '5kg/12송이', 'Box', 5.00, 25000, 22000, 28000, '과일'),
('F007', '샤인머스캣', '포도', '특', '김천', '2kg/4송이', 'Box', 2.00, 80000, 75000, 90000, '과일'),
('F008', '귤', '감귤', '특', '제주', '10kg', 'Box', 10.00, 30000, 28000, 35000, '과일')
ON DUPLICATE KEY UPDATE product_code=product_code;

-- 재고 현황 초기화
INSERT INTO inventory (product_id, current_quantity, current_weight)
SELECT id, 0, 0 FROM products
ON DUPLICATE KEY UPDATE product_id=product_id;

-- 재고 관리 트리거 생성
DELIMITER //

DROP TRIGGER IF EXISTS after_trade_detail_insert//
CREATE TRIGGER after_trade_detail_insert 
AFTER INSERT ON trade_details
FOR EACH ROW
BEGIN
    DECLARE v_trade_type VARCHAR(20);
    DECLARE v_before_qty DECIMAL(15,2);
    DECLARE v_after_qty DECIMAL(15,2);
    DECLARE v_trade_date DATE;
    
    SELECT trade_type, trade_date INTO v_trade_type, v_trade_date
    FROM trade_masters WHERE id = NEW.trade_master_id;
    
    SELECT IFNULL(current_quantity, 0) INTO v_before_qty
    FROM inventory WHERE product_id = NEW.product_id;
    
    IF v_trade_type = 'PURCHASE' THEN
        SET v_after_qty = v_before_qty + NEW.quantity;
        
        INSERT INTO inventory (product_id, current_quantity, current_weight, last_purchase_price)
        VALUES (NEW.product_id, NEW.quantity, NEW.total_weight, NEW.unit_price)
        ON DUPLICATE KEY UPDATE 
            current_quantity = current_quantity + NEW.quantity,
            current_weight = current_weight + IFNULL(NEW.total_weight, 0),
            last_purchase_price = NEW.unit_price;
        
        INSERT INTO inventory_transactions 
        (transaction_date, transaction_type, product_id, quantity, weight, unit_price, 
         before_quantity, after_quantity, trade_detail_id, reference_number, created_by)
        VALUES 
        (v_trade_date, 'IN', NEW.product_id, NEW.quantity, NEW.total_weight, NEW.unit_price,
         v_before_qty, v_after_qty, NEW.id, 
         (SELECT trade_number FROM trade_masters WHERE id = NEW.trade_master_id), 'system');
         
    ELSEIF v_trade_type = 'SALE' THEN
        SET v_after_qty = v_before_qty - NEW.quantity;
        
        UPDATE inventory 
        SET current_quantity = current_quantity - NEW.quantity,
            current_weight = current_weight - IFNULL(NEW.total_weight, 0),
            last_sale_price = NEW.unit_price
        WHERE product_id = NEW.product_id;
        
        INSERT INTO inventory_transactions 
        (transaction_date, transaction_type, product_id, quantity, weight, unit_price,
         before_quantity, after_quantity, trade_detail_id, reference_number, created_by)
        VALUES 
        (v_trade_date, 'OUT', NEW.product_id, NEW.quantity, NEW.total_weight, NEW.unit_price,
         v_before_qty, v_after_qty, NEW.id,
         (SELECT trade_number FROM trade_masters WHERE id = NEW.trade_master_id), 'system');
    END IF;
END//

DROP TRIGGER IF EXISTS before_trade_detail_delete//
CREATE TRIGGER before_trade_detail_delete
BEFORE DELETE ON trade_details
FOR EACH ROW
BEGIN
    DECLARE v_trade_type VARCHAR(20);
    
    SELECT trade_type INTO v_trade_type
    FROM trade_masters WHERE id = OLD.trade_master_id;
    
    IF v_trade_type = 'PURCHASE' THEN
        UPDATE inventory 
        SET current_quantity = current_quantity - OLD.quantity,
            current_weight = current_weight - IFNULL(OLD.total_weight, 0)
        WHERE product_id = OLD.product_id;
    ELSEIF v_trade_type = 'SALE' THEN
        UPDATE inventory 
        SET current_quantity = current_quantity + OLD.quantity,
            current_weight = current_weight + IFNULL(OLD.total_weight, 0)
        WHERE product_id = OLD.product_id;
    END IF;
END//

DELIMITER ;
