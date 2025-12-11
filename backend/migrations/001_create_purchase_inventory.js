/**
 * 매입 건별 재고 관리 시스템 마이그레이션
 * 
 * 변경사항:
 * 1. purchase_inventory 테이블 생성 - 매입 건별 재고 관리
 * 2. sale_purchase_matching 테이블 생성 - 매출-매입 매칭
 * 3. 기존 트리거 수정
 */

const db = require('../config/database');

async function migrate() {
  console.log('===========================================');
  console.log('매입 건별 재고 관리 시스템 마이그레이션 시작');
  console.log('===========================================\n');

  try {
    // 1. purchase_inventory 테이블 생성
    console.log('1. purchase_inventory 테이블 생성...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS purchase_inventory (
        id INT AUTO_INCREMENT PRIMARY KEY,
        trade_detail_id INT NOT NULL COMMENT '매입 상세 ID',
        product_id INT NOT NULL COMMENT '품목 ID',
        company_id INT NOT NULL COMMENT '매입처 ID',
        purchase_date DATE NOT NULL COMMENT '매입일자',
        original_quantity DECIMAL(15,2) NOT NULL COMMENT '원래 수량',
        remaining_quantity DECIMAL(15,2) NOT NULL COMMENT '남은 수량',
        unit_price DECIMAL(15,2) NOT NULL COMMENT '매입 단가',
        total_weight DECIMAL(15,2) DEFAULT 0 COMMENT '총 중량',
        shipper_location VARCHAR(255) DEFAULT '' COMMENT '출하지',
        sender VARCHAR(255) DEFAULT '' COMMENT '출하주',
        status ENUM('AVAILABLE', 'DEPLETED', 'CANCELLED') DEFAULT 'AVAILABLE' COMMENT '상태',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_trade_detail (trade_detail_id),
        INDEX idx_product (product_id),
        INDEX idx_company (company_id),
        INDEX idx_status (status),
        INDEX idx_purchase_date (purchase_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      COMMENT='매입 건별 재고'
    `);
    console.log('   ✓ purchase_inventory 테이블 생성 완료\n');

    // 2. sale_purchase_matching 테이블 생성
    console.log('2. sale_purchase_matching 테이블 생성...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS sale_purchase_matching (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sale_detail_id INT NOT NULL COMMENT '매출 상세 ID',
        purchase_inventory_id INT NOT NULL COMMENT '매입 재고 ID',
        matched_quantity DECIMAL(15,2) NOT NULL COMMENT '매칭 수량',
        matched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '매칭 일시',
        matched_by VARCHAR(50) DEFAULT 'system' COMMENT '매칭 처리자',
        INDEX idx_sale_detail (sale_detail_id),
        INDEX idx_purchase_inventory (purchase_inventory_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      COMMENT='매출-매입 매칭'
    `);
    console.log('   ✓ sale_purchase_matching 테이블 생성 완료\n');

    // 3. trade_details에 매칭 상태 컬럼 추가
    console.log('3. trade_details에 매칭 상태 컬럼 추가...');
    try {
      await db.query(`
        ALTER TABLE trade_details 
        ADD COLUMN matching_status ENUM('PENDING', 'PARTIAL', 'MATCHED') DEFAULT 'PENDING' 
        COMMENT '매칭 상태' AFTER notes
      `);
      console.log('   ✓ matching_status 컬럼 추가 완료\n');
    } catch (error) {
      if (error.code === 'ER_DUP_FIELDNAME') {
        console.log('   - matching_status 컬럼이 이미 존재합니다\n');
      } else {
        throw error;
      }
    }

    // 4. 기존 트리거 삭제
    console.log('4. 기존 트리거 삭제...');
    await db.query('DROP TRIGGER IF EXISTS after_trade_detail_insert');
    await db.query('DROP TRIGGER IF EXISTS before_trade_detail_delete');
    console.log('   ✓ 기존 트리거 삭제 완료\n');

    // 5. 새로운 매입 INSERT 트리거 생성
    console.log('5. 새로운 매입 INSERT 트리거 생성...');
    await db.query(`
      CREATE TRIGGER after_trade_detail_insert
      AFTER INSERT ON trade_details
      FOR EACH ROW
      BEGIN
          DECLARE v_trade_type VARCHAR(20);
          DECLARE v_trade_date DATE;
          DECLARE v_company_id INT;
          
          SELECT trade_type, trade_date, company_id 
          INTO v_trade_type, v_trade_date, v_company_id
          FROM trade_masters WHERE id = NEW.trade_master_id;
          
          -- 매입인 경우: purchase_inventory에 재고 추가
          IF v_trade_type = 'PURCHASE' THEN
              INSERT INTO purchase_inventory (
                  trade_detail_id, product_id, company_id, purchase_date,
                  original_quantity, remaining_quantity, unit_price, total_weight,
                  shipper_location, sender, status
              ) VALUES (
                  NEW.id, NEW.product_id, v_company_id, v_trade_date,
                  NEW.quantity, NEW.quantity, NEW.unit_price, IFNULL(NEW.total_weight, 0),
                  IFNULL(NEW.shipper_location, ''), IFNULL(NEW.sender, ''), 'AVAILABLE'
              );
          END IF;
          
          -- 매출인 경우: 아무 동작 안함 (마감에서 매칭 처리)
      END
    `);
    console.log('   ✓ after_trade_detail_insert 트리거 생성 완료\n');

    // 6. 새로운 매입 DELETE 트리거 생성
    console.log('6. 새로운 매입 DELETE 트리거 생성...');
    await db.query(`
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
              
              -- purchase_inventory에서 삭제
              DELETE FROM purchase_inventory WHERE trade_detail_id = OLD.id;
          END IF;
          
          IF v_trade_type = 'SALE' THEN
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
      END
    `);
    console.log('   ✓ before_trade_detail_delete 트리거 생성 완료\n');

    console.log('===========================================');
    console.log('마이그레이션 완료!');
    console.log('===========================================');
    
    // 테이블 확인
    const [tables] = await db.query(`
      SELECT TABLE_NAME, TABLE_COMMENT 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME IN ('purchase_inventory', 'sale_purchase_matching')
    `);
    console.log('\n생성된 테이블:');
    tables.forEach(t => console.log(`  - ${t.TABLE_NAME}: ${t.TABLE_COMMENT}`));

    process.exit(0);
  } catch (error) {
    console.error('\n❌ 마이그레이션 오류:', error.message);
    console.error(error);
    process.exit(1);
  }
}

migrate();


















