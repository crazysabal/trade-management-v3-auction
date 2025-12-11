-- 매입/매출 거래명세서 + 재고관리 데이터베이스 스키마 (과일 경매용)

-- 데이터베이스 생성
CREATE DATABASE IF NOT EXISTS trade_management CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE trade_management;

-- 1. 거래처 테이블
CREATE TABLE IF NOT EXISTS companies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_code VARCHAR(20) UNIQUE NOT NULL COMMENT '거래처코드',
    company_name VARCHAR(100) NOT NULL COMMENT '거래처명',
    business_number VARCHAR(12) COMMENT '사업자번호',
    ceo_name VARCHAR(50) COMMENT '대표자명',
    company_type VARCHAR(50) COMMENT '업태',
    company_category VARCHAR(50) COMMENT '업종',
    address VARCHAR(200) COMMENT '주소',
    phone VARCHAR(20) COMMENT '전화번호',
    fax VARCHAR(20) COMMENT '팩스번호',
    email VARCHAR(100) COMMENT '이메일',
    contact_person VARCHAR(50) COMMENT '담당자',
    contact_phone VARCHAR(20) COMMENT '담당자연락처',
    company_type_flag ENUM('CUSTOMER', 'SUPPLIER', 'BOTH') DEFAULT 'BOTH' COMMENT '거래처구분',
    notes TEXT COMMENT '비고',
    is_active BOOLEAN DEFAULT TRUE COMMENT '사용여부',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_company_code (company_code),
    INDEX idx_company_name (company_name)
) COMMENT='거래처 정보';

-- 2. 품목 테이블 (과일 경매용으로 수정)
CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_code VARCHAR(30) UNIQUE NOT NULL COMMENT '품목코드',
    product_name VARCHAR(100) NOT NULL COMMENT '품목명(과일명)',
    fruit_type VARCHAR(50) COMMENT '과일종류',
    grade VARCHAR(20) COMMENT '등급(특/상/중 등)',
    origin VARCHAR(50) COMMENT '산지(국산/수입/지역)',
    specification VARCHAR(100) COMMENT '규격',
    unit VARCHAR(20) DEFAULT 'Box' COMMENT '단위',
    box_weight DECIMAL(10,2) COMMENT 'Box당 중량(kg)',
    standard_price DECIMAL(15,2) DEFAULT 0 COMMENT '기준단가',
    purchase_price DECIMAL(15,2) DEFAULT 0 COMMENT '매입단가(참고용)',
    sale_price DECIMAL(15,2) DEFAULT 0 COMMENT '매출단가(참고용)',
    category VARCHAR(50) COMMENT '품목분류',
    notes TEXT COMMENT '비고',
    is_active BOOLEAN DEFAULT TRUE COMMENT '사용여부',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_product_code (product_code),
    INDEX idx_product_name (product_name),
    INDEX idx_fruit_type (fruit_type)
) COMMENT='품목 정보 (과일)';

-- 3. 거래 전표 마스터 테이블 (경매가 추가)
CREATE TABLE IF NOT EXISTS trade_masters (
    id INT AUTO_INCREMENT PRIMARY KEY,
    trade_number VARCHAR(30) UNIQUE NOT NULL COMMENT '전표번호',
    trade_type ENUM('PURCHASE', 'SALE') NOT NULL COMMENT '거래구분',
    trade_date DATE NOT NULL COMMENT '거래일자',
    company_id INT NOT NULL COMMENT '거래처ID',
    total_amount DECIMAL(15,2) DEFAULT 0 COMMENT '공급가액',
    tax_amount DECIMAL(15,2) DEFAULT 0 COMMENT '세액',
    total_price DECIMAL(15,2) DEFAULT 0 COMMENT '합계금액',
    payment_method VARCHAR(20) COMMENT '결제방법',
    delivery_address VARCHAR(200) COMMENT '납품장소',
    delivery_date DATE COMMENT '납품일자',
    notes TEXT COMMENT '비고',
    status ENUM('DRAFT', 'CONFIRMED', 'COMPLETED', 'CANCELLED') DEFAULT 'DRAFT' COMMENT '상태',
    created_by VARCHAR(50) COMMENT '작성자',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT,
    INDEX idx_trade_number (trade_number),
    INDEX idx_trade_date (trade_date),
    INDEX idx_company_id (company_id),
    INDEX idx_trade_type (trade_type)
) COMMENT='거래 전표 마스터';

-- 4. 거래 전표 상세 테이블 (낙찰가 추가)
CREATE TABLE IF NOT EXISTS trade_details (
    id INT AUTO_INCREMENT PRIMARY KEY,
    trade_master_id INT NOT NULL COMMENT '전표마스터ID',
    seq_no INT NOT NULL COMMENT '순번',
    product_id INT NOT NULL COMMENT '품목ID',
    quantity DECIMAL(15,2) NOT NULL COMMENT '수량(Box)',
    total_weight DECIMAL(15,2) COMMENT '총 중량(kg)',
    unit_price DECIMAL(15,2) NOT NULL COMMENT '단가(낙찰가)',
    supply_amount DECIMAL(15,2) NOT NULL COMMENT '공급가액',
    tax_amount DECIMAL(15,2) DEFAULT 0 COMMENT '세액',
    total_amount DECIMAL(15,2) NOT NULL COMMENT '합계',
    auction_price DECIMAL(15,2) COMMENT '낙찰가(경매가)',
    notes VARCHAR(200) COMMENT '비고',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (trade_master_id) REFERENCES trade_masters(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
    INDEX idx_trade_master_id (trade_master_id),
    INDEX idx_product_id (product_id)
) COMMENT='거래 전표 상세';

-- 5. 재고 현황 테이블 (NEW!)
CREATE TABLE IF NOT EXISTS inventory (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL UNIQUE COMMENT '품목ID',
    current_quantity DECIMAL(15,2) DEFAULT 0 COMMENT '현재재고수량(Box)',
    current_weight DECIMAL(15,2) DEFAULT 0 COMMENT '현재재고중량(kg)',
    last_purchase_price DECIMAL(15,2) COMMENT '최종매입단가',
    last_sale_price DECIMAL(15,2) COMMENT '최종매출단가',
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '최종수정일시',
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    INDEX idx_product_id (product_id)
) COMMENT='재고 현황';

-- 6. 재고 수불부 테이블 (NEW!)
CREATE TABLE IF NOT EXISTS inventory_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    transaction_date DATE NOT NULL COMMENT '거래일자',
    transaction_type ENUM('IN', 'OUT', 'ADJUST') NOT NULL COMMENT '거래유형(입고/출고/조정)',
    product_id INT NOT NULL COMMENT '품목ID',
    quantity DECIMAL(15,2) NOT NULL COMMENT '수량(Box)',
    weight DECIMAL(15,2) COMMENT '중량(kg)',
    unit_price DECIMAL(15,2) COMMENT '단가',
    before_quantity DECIMAL(15,2) NOT NULL COMMENT '이전재고',
    after_quantity DECIMAL(15,2) NOT NULL COMMENT '이후재고',
    trade_detail_id INT COMMENT '거래상세ID(입출고인경우)',
    reference_number VARCHAR(50) COMMENT '참조번호',
    notes TEXT COMMENT '비고',
    created_by VARCHAR(50) COMMENT '작성자',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
    FOREIGN KEY (trade_detail_id) REFERENCES trade_details(id) ON DELETE SET NULL,
    INDEX idx_transaction_date (transaction_date),
    INDEX idx_product_id (product_id),
    INDEX idx_transaction_type (transaction_type)
) COMMENT='재고 수불부';

-- 7. 사용자 테이블
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL COMMENT '사용자ID',
    password VARCHAR(255) NOT NULL COMMENT '비밀번호',
    user_name VARCHAR(50) NOT NULL COMMENT '사용자명',
    email VARCHAR(100) COMMENT '이메일',
    is_active BOOLEAN DEFAULT TRUE COMMENT '사용여부',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) COMMENT='사용자 정보';

-- 기본 관리자 계정 생성 (비밀번호: admin123)
INSERT INTO users (username, password, user_name, email) 
VALUES ('admin', '$2b$10$rYz5VqR3h9z9PqC5xJ5u7.qS5wZYJZQYvFQYqZQYvFQYqZQYvFQYq', '관리자', 'admin@example.com')
ON DUPLICATE KEY UPDATE username=username;

-- 샘플 데이터 입력

-- 거래처 샘플 (생산자/도매상)
INSERT INTO companies (company_code, company_name, business_number, ceo_name, company_type, company_category, address, phone, company_type_flag) VALUES
('P001', '김사과농장', '123-45-67890', '김사과', '농업', '과일재배', '충청북도 충주시 사과로 123', '043-1234-5678', 'SUPPLIER'),
('P002', '이배과수원', '234-56-78901', '이배', '농업', '과일재배', '전라남도 나주시 배나무길 456', '061-2345-6789', 'SUPPLIER'),
('P003', '박포도농원', '345-67-89012', '박포도', '농업', '과일재배', '경상북도 상주시 포도단지 789', '054-3456-7890', 'SUPPLIER'),
('W001', '서울청과시장', '456-78-90123', '최도매', '도매업', '과일도매', '서울시 송파구 가락로 123', '02-4567-8901', 'CUSTOMER'),
('W002', '부산과일상회', '567-89-01234', '정과일', '도매업', '과일도매', '부산시 사상구 과일로 456', '051-5678-9012', 'CUSTOMER'),
('R001', '대형마트 본점', '678-90-12345', '강마트', '소매업', '대형마트', '서울시 강남구 테헤란로 789', '02-6789-0123', 'BOTH')
ON DUPLICATE KEY UPDATE company_code=company_code;

-- 품목 샘플 (과일)
INSERT INTO products (product_code, product_name, fruit_type, grade, origin, specification, unit, box_weight, standard_price, purchase_price, sale_price, category) VALUES
('F001', '사과', '사과', '특', '충주', '10kg/15입', 'Box', 10.00, 50000, 45000, 55000, '과일'),
('F002', '사과', '사과', '상', '충주', '10kg/18입', 'Box', 10.00, 40000, 35000, 45000, '과일'),
('F003', '배', '배', '특', '나주', '15kg/12입', 'Box', 15.00, 70000, 65000, 75000, '과일'),
('F004', '배', '배', '상', '나주', '15kg/15입', 'Box', 15.00, 55000, 50000, 60000, '과일'),
('F005', '포도', '포도', '특', '상주', '5kg/10송이', 'Box', 5.00, 35000, 30000, 40000, '과일'),
('F006', '포도', '포도', '상', '상주', '5kg/12송이', 'Box', 5.00, 25000, 22000, 28000, '과일'),
('F007', '샤인머스캣', '포도', '특', '김천', '2kg/4송이', 'Box', 2.00, 80000, 75000, 90000, '과일'),
('F008', '감귤', '감귤', '특', '제주', '10kg', 'Box', 10.00, 30000, 28000, 35000, '과일')
ON DUPLICATE KEY UPDATE product_code=product_code;

-- 재고 현황 초기화 (품목별)
INSERT INTO inventory (product_id, current_quantity, current_weight)
SELECT id, 0, 0 FROM products
ON DUPLICATE KEY UPDATE product_id=product_id;

-- 재고 관리 트리거 생성

-- 트리거 1: 거래 상세 입력 시 재고 자동 업데이트
DELIMITER //

CREATE TRIGGER after_trade_detail_insert 
AFTER INSERT ON trade_details
FOR EACH ROW
BEGIN
    DECLARE v_trade_type VARCHAR(20);
    DECLARE v_before_qty DECIMAL(15,2);
    DECLARE v_after_qty DECIMAL(15,2);
    DECLARE v_trade_date DATE;
    
    -- 거래 유형 조회
    SELECT trade_type, trade_date INTO v_trade_type, v_trade_date
    FROM trade_masters WHERE id = NEW.trade_master_id;
    
    -- 현재 재고 조회
    SELECT IFNULL(current_quantity, 0) INTO v_before_qty
    FROM inventory WHERE product_id = NEW.product_id;
    
    IF v_trade_type = 'PURCHASE' THEN
        -- 매입: 재고 증가
        SET v_after_qty = v_before_qty + NEW.quantity;
        
        INSERT INTO inventory (product_id, current_quantity, current_weight, last_purchase_price)
        VALUES (NEW.product_id, NEW.quantity, NEW.total_weight, NEW.unit_price)
        ON DUPLICATE KEY UPDATE 
            current_quantity = current_quantity + NEW.quantity,
            current_weight = current_weight + IFNULL(NEW.total_weight, 0),
            last_purchase_price = NEW.unit_price;
        
        -- 수불부 기록
        INSERT INTO inventory_transactions 
        (transaction_date, transaction_type, product_id, quantity, weight, unit_price, 
         before_quantity, after_quantity, trade_detail_id, reference_number, created_by)
        VALUES 
        (v_trade_date, 'IN', NEW.product_id, NEW.quantity, NEW.total_weight, NEW.unit_price,
         v_before_qty, v_after_qty, NEW.id, 
         (SELECT trade_number FROM trade_masters WHERE id = NEW.trade_master_id), 'system');
         
    ELSEIF v_trade_type = 'SALE' THEN
        -- 매출: 재고 감소
        SET v_after_qty = v_before_qty - NEW.quantity;
        
        UPDATE inventory 
        SET current_quantity = current_quantity - NEW.quantity,
            current_weight = current_weight - IFNULL(NEW.total_weight, 0),
            last_sale_price = NEW.unit_price
        WHERE product_id = NEW.product_id;
        
        -- 수불부 기록
        INSERT INTO inventory_transactions 
        (transaction_date, transaction_type, product_id, quantity, weight, unit_price,
         before_quantity, after_quantity, trade_detail_id, reference_number, created_by)
        VALUES 
        (v_trade_date, 'OUT', NEW.product_id, NEW.quantity, NEW.total_weight, NEW.unit_price,
         v_before_qty, v_after_qty, NEW.id,
         (SELECT trade_number FROM trade_masters WHERE id = NEW.trade_master_id), 'system');
    END IF;
END//

-- 트리거 2: 거래 상세 삭제 시 재고 복구
CREATE TRIGGER before_trade_detail_delete
BEFORE DELETE ON trade_details
FOR EACH ROW
BEGIN
    DECLARE v_trade_type VARCHAR(20);
    
    SELECT trade_type INTO v_trade_type
    FROM trade_masters WHERE id = OLD.trade_master_id;
    
    IF v_trade_type = 'PURCHASE' THEN
        -- 매입 취소: 재고 감소
        UPDATE inventory 
        SET current_quantity = current_quantity - OLD.quantity,
            current_weight = current_weight - IFNULL(OLD.total_weight, 0)
        WHERE product_id = OLD.product_id;
    ELSEIF v_trade_type = 'SALE' THEN
        -- 매출 취소: 재고 증가
        UPDATE inventory 
        SET current_quantity = current_quantity + OLD.quantity,
            current_weight = current_weight + IFNULL(OLD.total_weight, 0)
        WHERE product_id = OLD.product_id;
    END IF;
END//

DELIMITER ;
