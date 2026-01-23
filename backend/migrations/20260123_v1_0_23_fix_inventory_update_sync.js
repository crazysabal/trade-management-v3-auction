/**
 * v1.0.23 - 재고 트리거 고도화 (UPDATE 트리거 및 중량 자동 보정)
 */
module.exports = async (db) => {
    console.log('--- [v1.0.23 Migration] 재고 트리거 고도화 시작 ---');

    try {
        // [1] after_trade_detail_insert 트리거 업데이트 (중량 자동 보정)
        console.log('[Migration] after_trade_detail_insert 트리거 업데이트 (중량 보정 추가) 중...');
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
    DECLARE v_unit_weight DECIMAL(18,2);
    DECLARE v_calc_weight DECIMAL(18,2);

    SELECT trade_type, trade_date, company_id, warehouse_id 
    INTO v_trade_type, v_trade_date, v_company_id, v_warehouse_id
    FROM trade_masters WHERE id = NEW.trade_master_id;

    -- 품목 단위 중량 조회 (자동 계산용)
    SELECT weight INTO v_unit_weight FROM products WHERE id = NEW.product_id;
    SET v_calc_weight = IFNULL(NEW.total_weight, IFNULL(v_unit_weight * ABS(NEW.quantity), 0));

    -- 기초 재고 조회
    SELECT COUNT(*) INTO v_count FROM inventory WHERE product_id = NEW.product_id;
    IF v_count > 0 THEN
        SELECT IFNULL(quantity, 0) INTO v_before_qty FROM inventory WHERE product_id = NEW.product_id;
    ELSE
        SET v_before_qty = 0;
    END IF;

    -- 1. 매입(PURCHASE) 처리
    IF v_trade_type = 'PURCHASE' THEN
        SELECT IFNULL(MAX(display_order), 0) + 1 INTO v_display_order FROM purchase_inventory;
        SET v_after_qty = v_before_qty + NEW.quantity;
        
        INSERT INTO inventory (product_id, quantity, weight, purchase_price)
        VALUES (NEW.product_id, NEW.quantity, v_calc_weight, NEW.unit_price)
        ON DUPLICATE KEY UPDATE
            quantity = quantity + NEW.quantity,
            weight = weight + v_calc_weight,
            purchase_price = NEW.unit_price;

        INSERT INTO purchase_inventory (
            trade_detail_id, product_id, company_id, warehouse_id, purchase_date,
            original_quantity, remaining_quantity, unit_price, total_weight, weight_unit,
            shipper_location, sender, status, display_order
        ) VALUES (
            NEW.id, NEW.product_id, v_company_id, IFNULL(v_warehouse_id, 1), v_trade_date,
            NEW.quantity, NEW.quantity, NEW.unit_price, v_calc_weight, NEW.weight_unit,
            IFNULL(NEW.shipper_location, ''), IFNULL(NEW.sender, ''), 'AVAILABLE', v_display_order
        );

    -- 2. 매출(SALE) 처리
    ELSEIF v_trade_type = 'SALE' THEN
        SET v_after_qty = v_before_qty - NEW.quantity;
        -- 재고 부족 체크
        IF v_after_qty < 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '재고가 부족하여 매출을 등록할 수 없습니다.';
        END IF;

        UPDATE inventory
        SET quantity = quantity - NEW.quantity,
            weight = weight - v_calc_weight
        WHERE product_id = NEW.product_id;

    -- 3. 생산(PRODUCTION) 처리
    ELSEIF v_trade_type = 'PRODUCTION' THEN
        SET v_after_qty = v_before_qty + NEW.quantity;
        IF v_after_qty < 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '생산에 필요한 원재료 재고가 부족합니다.';
        END IF;

        UPDATE inventory
        SET quantity = quantity + NEW.quantity,
            weight = weight + v_calc_weight
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
         NEW.product_id, ABS(NEW.quantity), ABS(v_calc_weight), NEW.unit_price,
         v_before_qty, v_after_qty, NEW.id,
         (SELECT trade_number FROM trade_masters WHERE id = NEW.trade_master_id), 'system');
    END IF;
END`;
        await db.query(insertTriggerSQL);

        // [2] after_trade_detail_update 트리거 추가 (중요!)
        console.log('[Migration] after_trade_detail_update 트리거 추가 중...');
        await db.query('DROP TRIGGER IF EXISTS after_trade_detail_update');

        const updateTriggerSQL = `
CREATE TRIGGER after_trade_detail_update AFTER UPDATE ON trade_details FOR EACH ROW BEGIN
    DECLARE v_trade_type VARCHAR(20);
    DECLARE v_unit_weight_old DECIMAL(18,2);
    DECLARE v_unit_weight_new DECIMAL(18,2);
    DECLARE v_calc_weight_old DECIMAL(18,2);
    DECLARE v_calc_weight_new DECIMAL(18,2);

    SELECT trade_type INTO v_trade_type FROM trade_masters WHERE id = NEW.trade_master_id;

    -- 0. 중량 계산 (Fallback 포함)
    SELECT weight INTO v_unit_weight_old FROM products WHERE id = OLD.product_id;
    SELECT weight INTO v_unit_weight_new FROM products WHERE id = NEW.product_id;
    
    SET v_calc_weight_old = IFNULL(OLD.total_weight, IFNULL(v_unit_weight_old * ABS(OLD.quantity), 0));
    SET v_calc_weight_new = IFNULL(NEW.total_weight, IFNULL(v_unit_weight_new * ABS(NEW.quantity), 0));

    -- 1. 이전 상태 복원 (Reverse OLD)
    IF v_trade_type = 'PURCHASE' THEN
        UPDATE inventory SET quantity = quantity - OLD.quantity, weight = weight - v_calc_weight_old WHERE product_id = OLD.product_id;
    ELSEIF v_trade_type = 'SALE' THEN
        UPDATE inventory SET quantity = quantity + OLD.quantity, weight = weight + v_calc_weight_old WHERE product_id = OLD.product_id;
    ELSEIF v_trade_type = 'PRODUCTION' THEN
        UPDATE inventory SET quantity = quantity - OLD.quantity, weight = weight - v_calc_weight_old WHERE product_id = OLD.product_id;
    END IF;

    -- 2. 새 상태 반영 (Apply NEW)
    IF v_trade_type = 'PURCHASE' THEN
        UPDATE inventory 
        SET quantity = quantity + NEW.quantity, 
            weight = weight + v_calc_weight_new,
            purchase_price = NEW.unit_price
        WHERE product_id = NEW.product_id;
    ELSEIF v_trade_type = 'SALE' THEN
        UPDATE inventory 
        SET quantity = quantity - NEW.quantity, 
            weight = weight - v_calc_weight_new
        WHERE product_id = NEW.product_id;
    ELSEIF v_trade_type = 'PRODUCTION' THEN
        UPDATE inventory 
        SET quantity = quantity + NEW.quantity, 
            weight = weight + v_calc_weight_new
        WHERE product_id = NEW.product_id;
    END IF;
END`;
        await db.query(updateTriggerSQL);

        // [3] 하드 싱크 실행 (보정 데이터 기반)
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

        console.log('✅ [v1.0.23 Migration] 완료');
    } catch (err) {
        console.error('❌ [v1.0.23 Migration] 실패:', err.message);
        throw err;
    }
};
