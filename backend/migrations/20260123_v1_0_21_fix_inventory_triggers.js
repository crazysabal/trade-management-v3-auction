/**
 * v1.0.21 - 재고 트리거 PRODUCTION 및 반품 처리 보정
 * 생산(PRODUCTION) 작업 시에도 집계 재고(inventory)가 자동으로 연동되도록 트리거를 업데이트합니다.
 */
module.exports = async (db) => {
    console.log('--- [v1.0.21 Migration] 재고 트리거 고도화 시작 ---');

    try {
        // [1] 트리거 교체 (INSERT)
        console.log('[Migration] after_trade_detail_insert 트리거 업데이트 중...');
        await db.query('DROP TRIGGER IF EXISTS after_trade_detail_insert');

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

    -- 1. 기초 재고 조회
    SELECT COUNT(*) INTO v_count FROM inventory WHERE product_id = NEW.product_id;
    IF v_count > 0 THEN
        SELECT IFNULL(quantity, 0) INTO v_before_qty
        FROM inventory WHERE product_id = NEW.product_id;
    ELSE
        SET v_before_qty = 0;
    END IF;

    -- 2. 매입(PURCHASE) 처리
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

    -- 3. 매출(SALE) 처리
    ELSEIF v_trade_type = 'SALE' THEN
        SET v_after_qty = v_before_qty - NEW.quantity;
        -- 재고 부족 체크 (음수 허용 안 함)
        IF v_after_qty < 0 THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = '재고가 부족하여 매출을 등록할 수 없습니다.';
        END IF;

        UPDATE inventory
        SET quantity = quantity - NEW.quantity,
            weight = weight - IFNULL(NEW.total_weight, 0)
        WHERE product_id = NEW.product_id;

    -- 4. 생산(PRODUCTION) 처리 - [V1.0.21 핵심 추가]
    ELSEIF v_trade_type = 'PRODUCTION' THEN
        SET v_after_qty = v_before_qty + NEW.quantity; -- NEW.quantity가 양수면 생산(IN), 음수면 소모(OUT)
        
        -- 소모품일 경우 재고 부족 체크
        IF v_after_qty < 0 THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = '생산에 필요한 원재료 재고가 부족합니다.';
        END IF;

        UPDATE inventory
        SET quantity = quantity + NEW.quantity,
            weight = weight + IFNULL(NEW.total_weight, 0)
        WHERE product_id = NEW.product_id;
    END IF;

    -- 수불부 기록 (모든 유형 공통)
    IF v_trade_type IN ('PURCHASE', 'SALE', 'PRODUCTION') THEN
        INSERT INTO inventory_transactions
        (transaction_date, transaction_type, product_id, quantity, weight, unit_price,
         before_quantity, after_quantity, trade_detail_id, reference_number, created_by)
        VALUES
        (v_trade_date, 
         CASE WHEN NEW.quantity > 0 THEN 'IN' ELSE 'OUT' END, 
         NEW.product_id, ABS(NEW.quantity), ABS(IFNULL(NEW.total_weight, 0)), NEW.unit_price,
         v_before_qty, v_after_qty, NEW.id,
         (SELECT trade_number FROM trade_masters WHERE id = NEW.trade_master_id), 'system');
    END IF;
END`;
        await db.query(insertTriggerSQL);

        // [2] 트리거 교체 (DELETE)
        console.log('[Migration] before_trade_detail_delete 트리거 업데이트 중...');
        await db.query('DROP TRIGGER IF EXISTS before_trade_detail_delete');

        const deleteTriggerSQL = `
CREATE TRIGGER before_trade_detail_delete
BEFORE DELETE ON trade_details
FOR EACH ROW
BEGIN
    DECLARE v_trade_type VARCHAR(20);
    DECLARE v_matched_count INT DEFAULT 0;
    
    SELECT trade_type INTO v_trade_type
    FROM trade_masters WHERE id = OLD.trade_master_id;

    -- 1. 매입(PURCHASE) 삭제 시
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

    -- 2. 매출(SALE) 삭제 시
    ELSEIF v_trade_type = 'SALE' THEN
        UPDATE inventory 
        SET quantity = quantity + OLD.quantity,
            weight = weight + IFNULL(OLD.total_weight, 0)
        WHERE product_id = OLD.product_id;

        -- 매칭 복구 (생략 가능하나 트리거에서 안전하게 처리)
        UPDATE purchase_inventory pi
        JOIN sale_purchase_matching spm ON pi.id = spm.purchase_inventory_id
        SET pi.remaining_quantity = pi.remaining_quantity + spm.matched_quantity,
            pi.status = 'AVAILABLE'
        WHERE spm.sale_detail_id = OLD.id;
        
        DELETE FROM sale_purchase_matching WHERE sale_detail_id = OLD.id;

    -- 3. 생산(PRODUCTION) 삭제 시 - [V1.0.21 핵심 추가]
    ELSEIF v_trade_type = 'PRODUCTION' THEN
        UPDATE inventory 
        SET quantity = quantity - OLD.quantity, -- 소모품(음수)였으면 +, 완성품(양수)였으면 -
            weight = weight - IFNULL(OLD.total_weight, 0)
        WHERE product_id = OLD.product_id;
    END IF;

    -- 수불부 삭제 (공통)
    DELETE FROM inventory_transactions WHERE trade_detail_id = OLD.id;
END`;
        await db.query(deleteTriggerSQL);

        // [3] 하드 싱크 (최종 데이터 정합성 맞추기)
        console.log('[Migration] 데이터 하드 싱크 실행 중...');
        await db.query('UPDATE inventory SET quantity = 0, weight = 0');
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

        console.log('✅ [v1.0.21 Migration] 완료');
    } catch (err) {
        console.error('❌ [v1.0.21 Migration] 실패:', err.message);
        throw err;
    }
};
