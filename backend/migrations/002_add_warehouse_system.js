/**
 * 창고 관리 시스템 도입 마이그레이션 (Refined)
 * 
 * 1. warehouses 테이블 생성
 * 2. trade_masters, purchase_inventory에 warehouse_id 컬럼 추가
 * 3. 기존 데이터에 기본 창고 할당
 * 4. FK 제약조건 추가
 * 5. warehouse_transfers 테이블 생성
 * 6. 관련 트리거 수정
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const db = require('../config/database');

async function migrate() {
    console.log('===========================================');
    console.log('창고 관리 시스템(WMS) 마이그레이션 시작');
    console.log('===========================================\n');

    try {
        // 1. warehouses 테이블 생성
        console.log('1. warehouses 테이블 생성...');
        await db.query(`
      CREATE TABLE IF NOT EXISTS warehouses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL COMMENT '창고명',
        type ENUM('MAIN', 'STORAGE', 'VEHICLE') DEFAULT 'STORAGE' COMMENT '창고유형',
        is_default BOOLEAN DEFAULT FALSE COMMENT '기본창고여부',
        is_active BOOLEAN DEFAULT TRUE COMMENT '사용여부',
        address VARCHAR(200) COMMENT '주소',
        description TEXT COMMENT '설명',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='창고 정보';
    `);

        // 기본 창고 존재 여부 확인 및 생성
        const [rows] = await db.query("SELECT COUNT(*) as count FROM warehouses");
        if (rows[0].count === 0) {
            console.log('   - 기본 창고(Main Warehouse) 생성 중...');
            await db.query(`
        INSERT INTO warehouses (name, type, is_default, description)
        VALUES ('메인 창고', 'MAIN', TRUE, '시스템 기본 창고')
      `);
        } else {
            console.log('   - 창고 데이터가 이미 존재합니다.');
        }
        console.log('   ✓ warehouses 테이블 준비 완료\n');

        // Default Warehouse ID 가져오기
        const [defaultWarehouses] = await db.query("SELECT id FROM warehouses WHERE is_default = TRUE LIMIT 1");
        // 만약 default가 없으면 첫번째꺼
        let defaultWarehouseId;
        if (defaultWarehouses.length > 0) {
            defaultWarehouseId = defaultWarehouses[0].id;
        } else {
            const [anyWarehouses] = await db.query("SELECT id FROM warehouses LIMIT 1");
            defaultWarehouseId = anyWarehouses[0].id;
        }
        console.log(`   - 기본 창고 ID: ${defaultWarehouseId}\n`);


        // 2. trade_masters
        console.log('2. trade_masters 테이블 수정...');
        try {
            // 2-1. 컬럼 추가
            console.log('   - 2.1 컬럼 추가 시도');
            await db.query(`
        ALTER TABLE trade_masters 
        ADD COLUMN warehouse_id INT COMMENT '입고 창고 ID' AFTER company_id
      `);
            console.log('   - 컬럼 추가 완료');

            // 2-2. 데이터 업데이트
            console.log('   - 2.2 기존 데이터 업데이트');
            await db.query(`UPDATE trade_masters SET warehouse_id = ? WHERE warehouse_id IS NULL`, [defaultWarehouseId]);

            // 2-3. FK 추가
            console.log('   - 2.3 FK 추가');
            await db.query(`
        ALTER TABLE trade_masters
        ADD FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE RESTRICT
      `);
            console.log('   ✓ trade_masters 처리 완료\n');

        } catch (error) {
            if (error.code === 'ER_DUP_FIELDNAME') {
                console.log('   - warehouse_id 컬럼이 이미 존재합니다 (Skip)\n');
            } else {
                throw error;
            }
        }


        // 3. purchase_inventory
        console.log('3. purchase_inventory 테이블 수정...');
        try {
            // 3-1. 컬럼 추가
            console.log('   - 3.1 컬럼 추가 시도');
            await db.query(`
        ALTER TABLE purchase_inventory 
        ADD COLUMN warehouse_id INT COMMENT '보관 창고 ID' AFTER company_id
      `);
            console.log('   - 컬럼 추가 완료');

            // 3-2. 데이터 업데이트
            console.log('   - 3.2 기존 데이터 업데이트');
            await db.query(`UPDATE purchase_inventory SET warehouse_id = ? WHERE warehouse_id IS NULL`, [defaultWarehouseId]);

            // 3-3. FK 및 Index 추가
            console.log('   - 3.3 NOT NULL 변경 및 FK 추가');
            await db.query(`
        ALTER TABLE purchase_inventory
        MODIFY COLUMN warehouse_id INT NOT NULL,
        ADD FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE RESTRICT,
        ADD INDEX idx_warehouse (warehouse_id)
      `);
            console.log('   ✓ purchase_inventory 처리 완료\n');

        } catch (error) {
            if (error.code === 'ER_DUP_FIELDNAME') {
                console.log('   - warehouse_id 컬럼이 이미 존재합니다 (Skip)\n');
            } else {
                throw error;
            }
        }


        // 4. warehouse_transfers 테이블 생성
        console.log('4. warehouse_transfers 테이블 생성...');
        await db.query(`
      CREATE TABLE IF NOT EXISTS warehouse_transfers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        transfer_date DATE NOT NULL COMMENT '이동일자',
        product_id INT NOT NULL COMMENT '품목 ID',
        from_warehouse_id INT NOT NULL COMMENT '출발 창고',
        to_warehouse_id INT NOT NULL COMMENT '도착 창고',
        quantity DECIMAL(15,2) NOT NULL COMMENT '이동 수량',
        weight DECIMAL(15,2) DEFAULT 0 COMMENT '이동 중량',
        status ENUM('COMPLETED', 'CANCELLED') DEFAULT 'COMPLETED' COMMENT '상태',
        notes TEXT COMMENT '비고',
        created_by VARCHAR(50) DEFAULT 'system',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
        FOREIGN KEY (from_warehouse_id) REFERENCES warehouses(id) ON DELETE RESTRICT,
        FOREIGN KEY (to_warehouse_id) REFERENCES warehouses(id) ON DELETE RESTRICT,
        INDEX idx_transfer_date (transfer_date),
        INDEX idx_product (product_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='재고 이동 이력';
    `);
        console.log('   ✓ warehouse_transfers 테이블 생성 완료\n');


        // 5. 트리거 수정 (after_trade_detail_insert)
        console.log('5. 트리거 수정 (after_trade_detail_insert)...');
        await db.query('DROP TRIGGER IF EXISTS after_trade_detail_insert');

        await db.query(`
      CREATE TRIGGER after_trade_detail_insert
      AFTER INSERT ON trade_details
      FOR EACH ROW
      BEGIN
          DECLARE v_trade_type VARCHAR(20);
          DECLARE v_trade_date DATE;
          DECLARE v_company_id INT;
          DECLARE v_warehouse_id INT;
          
          SELECT trade_type, trade_date, company_id, warehouse_id
          INTO v_trade_type, v_trade_date, v_company_id, v_warehouse_id
          FROM trade_masters WHERE id = NEW.trade_master_id;
          
          -- 매입인 경우: purchase_inventory에 재고 추가
          IF v_trade_type = 'PURCHASE' THEN
              INSERT INTO purchase_inventory (
                  trade_detail_id, product_id, company_id, warehouse_id, purchase_date,
                  original_quantity, remaining_quantity, unit_price, total_weight,
                  shipper_location, sender, status
              ) VALUES (
                  NEW.id, NEW.product_id, v_company_id, IFNULL(v_warehouse_id, ${defaultWarehouseId}), v_trade_date,
                  NEW.quantity, NEW.quantity, NEW.unit_price, IFNULL(NEW.total_weight, 0),
                  IFNULL(NEW.shipper_location, ''), IFNULL(NEW.sender, ''), 'AVAILABLE'
              );
          END IF;
      END
    `);
        console.log('   ✓ 트리거 수정 완료\n');

        console.log('===========================================');
        console.log('WMS 마이그레이션 완료!');
        console.log('===========================================');

        process.exit(0);
    } catch (error) {
        console.error('\n❌ 마이그레이션 오류:', error.message);
        console.error(error);
        process.exit(1);
    }
}

migrate();
