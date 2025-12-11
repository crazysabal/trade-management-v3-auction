-- 경매 낙찰 크롤링 관련 테이블 추가

USE trade_management;

-- 1. 경매 사이트 계정 관리 테이블
CREATE TABLE IF NOT EXISTS auction_accounts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    account_name VARCHAR(50) NOT NULL COMMENT '계정명',
    site_url VARCHAR(200) NOT NULL COMMENT '경매 사이트 URL',
    username VARCHAR(100) NOT NULL COMMENT '아이디',
    password VARCHAR(255) NOT NULL COMMENT '비밀번호 (암호화)',
    is_active BOOLEAN DEFAULT TRUE COMMENT '사용여부',
    last_used TIMESTAMP NULL COMMENT '최근 사용일시',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) COMMENT='경매 사이트 계정 관리';

-- 2. 품목 매칭 테이블 (경매장 품목명 → 시스템 품목)
CREATE TABLE IF NOT EXISTS product_mapping (
    id INT AUTO_INCREMENT PRIMARY KEY,
    auction_product_name VARCHAR(200) NOT NULL COMMENT '경매장 품목명',
    system_product_id INT COMMENT '시스템 품목ID',
    match_type ENUM('AUTO', 'MANUAL') DEFAULT 'MANUAL' COMMENT '매칭유형',
    confidence INT DEFAULT 100 COMMENT '신뢰도(0-100)',
    is_active BOOLEAN DEFAULT TRUE COMMENT '사용여부',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (system_product_id) REFERENCES products(id) ON DELETE SET NULL,
    UNIQUE KEY uk_auction_product (auction_product_name),
    INDEX idx_system_product (system_product_id)
) COMMENT='품목 매칭 테이블';

-- 3. 낙찰 원본 데이터 저장 (크롤링 원본 보관)
CREATE TABLE IF NOT EXISTS auction_raw_data (
    id INT AUTO_INCREMENT PRIMARY KEY,
    auction_date DATE NOT NULL COMMENT '경매일자',
    arrive_no VARCHAR(50) COMMENT '입하번호',
    shipper_location VARCHAR(100) COMMENT '출하지',
    sender VARCHAR(100) COMMENT '출하주',
    product_name VARCHAR(200) COMMENT '품목명',
    grade VARCHAR(50) COMMENT '등급',
    weight VARCHAR(50) COMMENT '중량',
    unit_name VARCHAR(50) COMMENT '단위',
    count INT COMMENT '수량(개)',
    unit_price DECIMAL(15,2) COMMENT '낙찰단가',
    total_price DECIMAL(15,2) COMMENT '구입대금',
    trade_detail_id INT COMMENT '거래상세ID(매칭된경우)',
    status ENUM('PENDING', 'IMPORTED', 'IGNORED') DEFAULT 'PENDING' COMMENT '상태',
    import_note TEXT COMMENT '임포트메모',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (trade_detail_id) REFERENCES trade_details(id) ON DELETE SET NULL,
    INDEX idx_auction_date (auction_date),
    INDEX idx_arrive_no (arrive_no),
    INDEX idx_status (status)
) COMMENT='경매 낙찰 원본 데이터';

-- 4. 크롤링 실행 이력
CREATE TABLE IF NOT EXISTS auction_crawl_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    crawl_date DATE NOT NULL COMMENT '크롤링일자',
    account_id INT COMMENT '사용계정ID',
    total_records INT DEFAULT 0 COMMENT '총레코드수',
    success_records INT DEFAULT 0 COMMENT '성공레코드수',
    failed_records INT DEFAULT 0 COMMENT '실패레코드수',
    status ENUM('SUCCESS', 'PARTIAL', 'FAILED') DEFAULT 'SUCCESS' COMMENT '실행상태',
    error_message TEXT COMMENT '에러메시지',
    execution_time INT COMMENT '실행시간(초)',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES auction_accounts(id) ON DELETE SET NULL,
    INDEX idx_crawl_date (crawl_date)
) COMMENT='크롤링 실행 이력';

-- 샘플 품목 매칭 데이터 (자주 사용되는 품목)
INSERT INTO product_mapping (auction_product_name, system_product_id, match_type) 
SELECT '감귤', id, 'AUTO' FROM products WHERE product_name = '귤' LIMIT 1
ON DUPLICATE KEY UPDATE auction_product_name=auction_product_name;

INSERT INTO product_mapping (auction_product_name, system_product_id, match_type)
SELECT '산화과(청량)', id, 'AUTO' FROM products WHERE product_name = '사과' LIMIT 1
ON DUPLICATE KEY UPDATE auction_product_name=auction_product_name;

INSERT INTO product_mapping (auction_product_name, system_product_id, match_type)
SELECT '바나나(수입)', id, 'AUTO' FROM products WHERE product_name = '바나나' AND origin = '수입' LIMIT 1
ON DUPLICATE KEY UPDATE auction_product_name=auction_product_name;
