require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/database');

async function runMigration() {
    console.log('--- [v1.0.12] 재고 데이터 전수 동기화 및 트리거 최종 보정 시작 ---');
    try {
        // [1] 트리거 정합성 재확인 (v1.0.9~v1.0.11 핵심 로직 포함)
        console.log('🔄 데이터베이스 트리거 최신화 중...');
        await db.query('DROP TRIGGER IF EXISTS after_trade_detail_insert');
        await db.query('DROP TRIGGER IF EXISTS before_trade_detail_delete');

        const insertTriggerSQL = `
CREATE TRIGGER after_trade_detail_insert AFTER INSERT ON trade_details FOR EACH ROW BEGIN
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
        SELECT IFNULL(MAX(display_order), 0) + 1 INTO v_display_order FROM purchase_inventory;
        SET v_after_qty = v_before_qty + NEW.quantity;
        INSERT INTO inventory (product_id, quantity, weight, purchase_price)
        VALUES (NEW.product_id, NEW.quantity, IFNULL(NEW.total_weight, 0), NEW.unit_price)
        ON DUPLICATE KEY UPDATE
            quantity = quantity + NEW.quantity,
            weight = weight + IFNULL(NEW.total_weight, 0),
            purchase_price = NEW.unit_price;
        INSERT INTO purchase_inventory (
            trade_detail_id, product_id, company_id, warehouse_id, purchase_date,
            original_quantity, remaining_quantity, unit_price, total_weight, weight_unit,
            shipper_location, sender, status, display_order
        ) VALUES (
            NEW.id, NEW.product_id, v_company_id, IFNULL(v_warehouse_id, 1), v_trade_date,
            NEW.quantity, NEW.quantity, NEW.unit_price, IFNULL(NEW.total_weight, 0), NEW.weight_unit,
            IFNULL(NEW.shipper_location, ''), IFNULL(NEW.sender, ''), 'AVAILABLE', v_display_order
        );
        INSERT INTO inventory_transactions
        (transaction_date, transaction_type, product_id, quantity, weight, unit_price,
         before_quantity, after_quantity, trade_detail_id, reference_number, created_by)
        VALUES
        (v_trade_date, 'IN', NEW.product_id, NEW.quantity, IFNULL(NEW.total_weight, 0), NEW.unit_price,
         v_before_qty, v_after_qty, NEW.id,
         (SELECT trade_number FROM trade_masters WHERE id = NEW.trade_master_id), 'system');

    ELSEIF v_trade_type = 'SALE' THEN
        SET v_after_qty = v_before_qty - NEW.quantity;
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
END`;

        const deleteTriggerSQL = `
CREATE TRIGGER before_trade_detail_delete
BEFORE DELETE ON trade_details
FOR EACH ROW
BEGIN
    DECLARE v_trade_type VARCHAR(20);
    DECLARE v_matched_count INT DEFAULT 0;
    SELECT trade_type INTO v_trade_type
    FROM trade_masters WHERE id = OLD.trade_master_id;
    IF v_trade_type = 'PURCHASE' THEN
        SELECT COUNT(*) INTO v_matched_count
        FROM sale_purchase_matching spm
        JOIN purchase_inventory pi ON spm.purchase_inventory_id = pi.id
        WHERE pi.trade_detail_id = OLD.id;
        IF v_matched_count > 0 THEN
            SIGNAL SQLSTATE '45000' 
            SET MESSAGE_TEXT = '이미 매출과 매칭된 매입은 삭제할 수 없습니다.';
        END IF;
        UPDATE inventory 
        SET quantity = quantity - OLD.quantity,
            weight = weight - IFNULL(OLD.total_weight, 0)
        WHERE product_id = OLD.product_id;
        DELETE FROM purchase_inventory WHERE trade_detail_id = OLD.id;
    END IF;
    IF v_trade_type = 'SALE' THEN
        UPDATE inventory 
        SET quantity = quantity + OLD.quantity,
            weight = weight + IFNULL(OLD.total_weight, 0)
        WHERE product_id = OLD.product_id;
        UPDATE purchase_inventory pi
        JOIN sale_purchase_matching spm ON pi.id = spm.purchase_inventory_id
        SET pi.remaining_quantity = pi.remaining_quantity + spm.matched_quantity,
            pi.status = 'AVAILABLE'
        WHERE spm.sale_detail_id = OLD.id;
        DELETE FROM sale_purchase_matching WHERE sale_detail_id = OLD.id;
    END IF;
    DELETE FROM inventory_transactions WHERE trade_detail_id = OLD.id;
END`;
        await db.query(insertTriggerSQL);
        await db.query(deleteTriggerSQL);
        console.log('✅ 트리거 업데이트 완료');

        // [2] 꼬인 데이터 전수 복구 (Hard Sync)
        // 기존 bugs로 인해 inventory 테이블이 음수이거나 잘못된 값을 가진 경우를 위해
        // Lot(purchase_inventory) 정보를 기준으로 집계 재고를 강제 재계산합니다.
        console.log('🔄 꼬인 재고 데이터 전수 복구 중...');

        // 1. 초기화 (모든 활성 품목 대상)
        await db.query('UPDATE inventory SET quantity = 0, weight = 0');

        // 2. Lot 기반 재계산
        const syncSQL = `
            INSERT INTO inventory (product_id, quantity, weight, purchase_price)
            SELECT 
                pi.product_id, 
                SUM(pi.remaining_quantity) as total_qty, 
                SUM(pi.remaining_quantity * IFNULL(p.weight, 0)) as total_weight,
                MAX(pi.unit_price) as last_price
            FROM purchase_inventory pi
            JOIN products p ON pi.product_id = p.id
            WHERE pi.status != 'DEPLETED' OR pi.remaining_quantity > 0
            GROUP BY pi.product_id
            ON DUPLICATE KEY UPDATE
                quantity = VALUES(quantity),
                weight = VALUES(weight),
                purchase_price = VALUES(purchase_price)
        `;
        await db.query(syncSQL);
        console.log('✅ 재고 데이터 동기화 완료');

        console.log('🏁 v1.0.12 통합 마이그레이션 및 데이터 정화 작업이 완료되었습니다.');

    } catch (err) {
        console.error('❌ 작업 중 오류 발생:', err.message);
    } finally {
        process.exit();
    }
}

runMigration();
