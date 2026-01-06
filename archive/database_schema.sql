-- 매입/매출 거래명세서 데이터베이스 스키마

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

-- 2. 품목 테이블
CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_code VARCHAR(30) UNIQUE NOT NULL COMMENT '품목코드',
    product_name VARCHAR(100) NOT NULL COMMENT '품목명',
    fruit_type VARCHAR(50) COMMENT '과일종류',
    grade VARCHAR(50) COMMENT '등급',
    unit VARCHAR(20) DEFAULT 'Box' COMMENT '단위',
    category VARCHAR(50) COMMENT '품목분류 (과일/채소/버섯)',
    notes TEXT COMMENT '비고',
    is_active BOOLEAN DEFAULT TRUE COMMENT '사용여부',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_product_code (product_code),
    INDEX idx_product_name (product_name),
    INDEX idx_fruit_type (fruit_type),
    INDEX idx_category (category)
) COMMENT='품목 정보';

-- 3. 거래 전표 마스터 테이블 (매입/매출)
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

-- 4. 거래 전표 상세 테이블
CREATE TABLE IF NOT EXISTS trade_details (
    id INT AUTO_INCREMENT PRIMARY KEY,
    trade_master_id INT NOT NULL COMMENT '전표마스터ID',
    seq_no INT NOT NULL COMMENT '순번',
    product_id INT NOT NULL COMMENT '품목ID',
    quantity DECIMAL(15,2) NOT NULL COMMENT '수량',
    unit_price DECIMAL(15,2) NOT NULL COMMENT '단가',
    supply_amount DECIMAL(15,2) NOT NULL COMMENT '공급가액',
    tax_amount DECIMAL(15,2) DEFAULT 0 COMMENT '세액',
    total_amount DECIMAL(15,2) NOT NULL COMMENT '합계',
    notes VARCHAR(200) COMMENT '비고',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (trade_master_id) REFERENCES trade_masters(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
    INDEX idx_trade_master_id (trade_master_id),
    INDEX idx_product_id (product_id)
) COMMENT='거래 전표 상세';

-- 5. 사용자 테이블 (추후 확장용)
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
VALUES ('admin', '$2b$10$rYz5VqR3h9z9PqC5xJ5u7.qS5wZYJZQYvFQYqZQYvFQYqZQYvFQYq', '관리자', 'admin@example.com');

-- 샘플 데이터 입력

-- 거래처 샘플
INSERT INTO companies (company_code, company_name, business_number, ceo_name, company_type, company_category, address, phone, company_type_flag) VALUES
('C001', '(주)한국상사', '123-45-67890', '김철수', '제조업', '기계', '서울시 강남구 테헤란로 123', '02-1234-5678', 'CUSTOMER'),
('C002', '대한무역', '234-56-78901', '이영희', '도매업', '전자제품', '서울시 송파구 올림픽로 456', '02-2345-6789', 'BOTH'),
('S001', '글로벌공급', '345-67-89012', '박민수', '제조업', '부품', '경기도 성남시 분당구 789', '031-3456-7890', 'SUPPLIER');

-- 품목 샘플
INSERT INTO products (product_code, product_name, specification, unit, standard_price, purchase_price, sale_price, category) VALUES
('P001', '볼트', 'M8x20', '개', 100, 80, 120, '철물'),
('P002', '너트', 'M8', '개', 50, 40, 70, '철물'),
('P003', 'LED전구', '10W', '개', 5000, 4000, 6500, '전자'),
('P004', '스위치', '1구', '개', 2000, 1500, 2800, '전자'),
('P005', '케이블', '2.5SQ 100m', '롤', 30000, 25000, 38000, '전선');
