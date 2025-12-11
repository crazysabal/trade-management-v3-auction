-- 거래처별 잔고 및 입금/출금 관리 스키마
-- MySQL 5.x 호환 버전

USE trade_management;

-- 1. 거래처 잔고 테이블
-- 각 거래처별 미수금(receivable)과 미지급금(payable) 추적
CREATE TABLE IF NOT EXISTS company_balances (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT NOT NULL UNIQUE,
    receivable DECIMAL(15,2) DEFAULT 0 COMMENT '미수금 (매출처에서 받아야 할 금액)',
    payable DECIMAL(15,2) DEFAULT 0 COMMENT '미지급금 (매입처에 지급해야 할 금액)',
    last_transaction_date DATE COMMENT '마지막 거래일',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    INDEX idx_company_id (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. 입금/출금 거래 테이블
CREATE TABLE IF NOT EXISTS payment_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    transaction_number VARCHAR(30) UNIQUE NOT NULL COMMENT '거래번호 (PAY-YYYYMMDD-NNN)',
    transaction_date DATE NOT NULL COMMENT '거래일자',
    company_id INT NOT NULL COMMENT '거래처',
    transaction_type ENUM('RECEIPT', 'PAYMENT') NOT NULL COMMENT 'RECEIPT: 입금(미수금 감소), PAYMENT: 출금(미지급금 감소)',
    amount DECIMAL(15,2) NOT NULL COMMENT '금액',
    payment_method VARCHAR(30) COMMENT '결제방법 (현금, 계좌이체, 어음, 카드 등)',
    bank_name VARCHAR(50) COMMENT '은행명',
    account_number VARCHAR(50) COMMENT '계좌번호',
    reference_number VARCHAR(50) COMMENT '참조번호 (어음번호, 카드승인번호 등)',
    trade_master_id INT COMMENT '연결된 전표 ID (선택)',
    before_balance DECIMAL(15,2) NOT NULL COMMENT '거래 전 잔고',
    after_balance DECIMAL(15,2) NOT NULL COMMENT '거래 후 잔고',
    notes TEXT COMMENT '비고',
    created_by VARCHAR(50) COMMENT '등록자',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT,
    FOREIGN KEY (trade_master_id) REFERENCES trade_masters(id) ON DELETE SET NULL,
    INDEX idx_transaction_date (transaction_date),
    INDEX idx_company_id (company_id),
    INDEX idx_transaction_type (transaction_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. 기존 거래처에 대한 잔고 초기화
INSERT INTO company_balances (company_id, receivable, payable)
SELECT id, 0, 0 FROM companies
ON DUPLICATE KEY UPDATE company_id = company_id;

-- 4. 기존 거래 데이터 기반 잔고 계산 (매출 → 미수금, 매입 → 미지급금)
-- 매출 합계를 미수금으로 설정
UPDATE company_balances cb
SET cb.receivable = (
    SELECT IFNULL(SUM(tm.total_price), 0)
    FROM trade_masters tm
    WHERE tm.company_id = cb.company_id
    AND tm.trade_type = 'SALE'
    AND tm.status != 'CANCELLED'
);

-- 매입 합계를 미지급금으로 설정
UPDATE company_balances cb
SET cb.payable = (
    SELECT IFNULL(SUM(tm.total_price), 0)
    FROM trade_masters tm
    WHERE tm.company_id = cb.company_id
    AND tm.trade_type = 'PURCHASE'
    AND tm.status != 'CANCELLED'
);

-- 마지막 거래일 업데이트
UPDATE company_balances cb
SET cb.last_transaction_date = (
    SELECT MAX(tm.trade_date)
    FROM trade_masters tm
    WHERE tm.company_id = cb.company_id
    AND tm.status != 'CANCELLED'
);

-- 5. 거래 발생 시 자동 잔고 업데이트 트리거
DELIMITER //

-- 매출/매입 전표 생성 시 잔고 업데이트
DROP TRIGGER IF EXISTS after_trade_master_insert_balance//
CREATE TRIGGER after_trade_master_insert_balance
AFTER INSERT ON trade_masters
FOR EACH ROW
BEGIN
    -- 잔고 레코드가 없으면 생성
    INSERT INTO company_balances (company_id, receivable, payable, last_transaction_date)
    VALUES (NEW.company_id, 0, 0, NEW.trade_date)
    ON DUPLICATE KEY UPDATE last_transaction_date = NEW.trade_date;
    
    -- 매출이면 미수금 증가
    IF NEW.trade_type = 'SALE' AND NEW.status != 'CANCELLED' THEN
        UPDATE company_balances 
        SET receivable = receivable + NEW.total_price,
            last_transaction_date = NEW.trade_date
        WHERE company_id = NEW.company_id;
    -- 매입이면 미지급금 증가
    ELSEIF NEW.trade_type = 'PURCHASE' AND NEW.status != 'CANCELLED' THEN
        UPDATE company_balances 
        SET payable = payable + NEW.total_price,
            last_transaction_date = NEW.trade_date
        WHERE company_id = NEW.company_id;
    END IF;
END//

-- 매출/매입 전표 수정 시 잔고 업데이트
DROP TRIGGER IF EXISTS after_trade_master_update_balance//
CREATE TRIGGER after_trade_master_update_balance
AFTER UPDATE ON trade_masters
FOR EACH ROW
BEGIN
    DECLARE v_old_amount DECIMAL(15,2);
    DECLARE v_new_amount DECIMAL(15,2);
    
    -- 취소 상태 변경 또는 금액 변경 시 처리
    SET v_old_amount = IF(OLD.status = 'CANCELLED', 0, OLD.total_price);
    SET v_new_amount = IF(NEW.status = 'CANCELLED', 0, NEW.total_price);
    
    IF NEW.trade_type = 'SALE' THEN
        UPDATE company_balances 
        SET receivable = receivable - v_old_amount + v_new_amount
        WHERE company_id = NEW.company_id;
    ELSEIF NEW.trade_type = 'PURCHASE' THEN
        UPDATE company_balances 
        SET payable = payable - v_old_amount + v_new_amount
        WHERE company_id = NEW.company_id;
    END IF;
END//

-- 매출/매입 전표 삭제 시 잔고 업데이트
DROP TRIGGER IF EXISTS before_trade_master_delete_balance//
CREATE TRIGGER before_trade_master_delete_balance
BEFORE DELETE ON trade_masters
FOR EACH ROW
BEGIN
    IF OLD.status != 'CANCELLED' THEN
        IF OLD.trade_type = 'SALE' THEN
            UPDATE company_balances 
            SET receivable = receivable - OLD.total_price
            WHERE company_id = OLD.company_id;
        ELSEIF OLD.trade_type = 'PURCHASE' THEN
            UPDATE company_balances 
            SET payable = payable - OLD.total_price
            WHERE company_id = OLD.company_id;
        END IF;
    END IF;
END//

DELIMITER ;












