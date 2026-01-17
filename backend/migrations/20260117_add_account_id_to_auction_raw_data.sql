-- auction_raw_data 테이블에 account_id 추가
ALTER TABLE auction_raw_data ADD COLUMN account_id INT AFTER auction_date;

-- 기존 데이터 정합성을 위해 현재 활성화된 첫 번째 계정 ID로 업데이트 (계정이 있다면)
SET @first_account_id = (SELECT id FROM auction_accounts LIMIT 1);
UPDATE auction_raw_data SET account_id = @first_account_id WHERE account_id IS NULL;

-- 외래 키 및 인덱스 추가 (선택 사항이나 성능을 위해 권장)
ALTER TABLE auction_raw_data ADD INDEX idx_auction_date_account (auction_date, account_id);
