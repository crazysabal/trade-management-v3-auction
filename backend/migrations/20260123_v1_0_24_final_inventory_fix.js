/**
 * v1.0.24 - 재고 정합성 최종 보정 및 트리거 이력 로깅 강화
 */
module.exports = async (db) => {
    console.log('--- [v1.0.24 Migration] 재고 정합성 보정 및 로깅 강화 시작 ---');

    try {
        // [1] after_trade_detail_update 트리거 업데이트 (이력 로깅 추가)
        console.log('[Migration] after_trade_detail_update 트리거 업데이트 중...');
        await db.query('DROP TRIGGER IF EXISTS after_trade_detail_update');

        const updateTriggerSQL = `
CREATE TRIGGER after_trade_detail_update AFTER UPDATE ON trade_details FOR EACH ROW BEGIN
    DECLARE v_trade_type VARCHAR(20);
    DECLARE v_trade_date DATE;
    DECLARE v_trade_no VARCHAR(50);
    DECLARE v_unit_weight_old DECIMAL(18,2);
    DECLARE v_unit_weight_new DECIMAL(18,2);
    DECLARE v_calc_weight_old DECIMAL(18,2);
    DECLARE v_calc_weight_new DECIMAL(18,2);
    DECLARE v_before_qty DECIMAL(15,2);
    DECLARE v_after_qty_mid DECIMAL(15,2);
    DECLARE v_after_qty_final DECIMAL(15,2);

    SELECT trade_type, trade_date, trade_number INTO v_trade_type, v_trade_date, v_trade_no 
    FROM trade_masters WHERE id = NEW.trade_master_id;

    -- 0. 중량 및 현재 재고 조회
    SELECT weight INTO v_unit_weight_old FROM products WHERE id = OLD.product_id;
    SELECT weight INTO v_unit_weight_new FROM products WHERE id = NEW.product_id;
    SELECT IFNULL(quantity, 0) INTO v_before_qty FROM inventory WHERE product_id = OLD.product_id;
    
    SET v_calc_weight_old = IFNULL(OLD.total_weight, IFNULL(v_unit_weight_old * ABS(OLD.quantity), 0));
    SET v_calc_weight_new = IFNULL(NEW.total_weight, IFNULL(v_unit_weight_new * ABS(NEW.quantity), 0));

    -- 1. 이전 상태 복원 (Reverse OLD)
    IF v_trade_type = 'PURCHASE' THEN
        SET v_after_qty_mid = v_before_qty - OLD.quantity;
        UPDATE inventory SET quantity = quantity - OLD.quantity, weight = weight - v_calc_weight_old WHERE product_id = OLD.product_id;
    ELSEIF v_trade_type = 'SALE' THEN
        SET v_after_qty_mid = v_before_qty + OLD.quantity;
        UPDATE inventory SET quantity = quantity + OLD.quantity, weight = weight + v_calc_weight_old WHERE product_id = OLD.product_id;
    ELSEIF v_trade_type = 'PRODUCTION' THEN
        SET v_after_qty_mid = v_before_qty - OLD.quantity;
        UPDATE inventory SET quantity = quantity - OLD.quantity, weight = weight - v_calc_weight_old WHERE product_id = OLD.product_id;
    END IF;

    -- 복원 이력 기록 (DEBUG용)
    INSERT INTO inventory_transactions
    (transaction_date, transaction_type, product_id, quantity, weight, unit_price,
     before_quantity, after_quantity, trade_detail_id, reference_number, created_by, notes)
    VALUES
    (v_trade_date, 'ADJUST', OLD.product_id, OLD.quantity, v_calc_weight_old, OLD.unit_price,
     v_before_qty, v_after_qty_mid, OLD.id, v_trade_no, 'system', 'UPDATE_REVERSE');

    -- 2. 새 상태 반영 (Apply NEW)
    -- 새로운 before_qty 조회 (동일 품목일수도 있고 다를 수도 있음)
    SELECT IFNULL(quantity, 0) INTO v_before_qty FROM inventory WHERE product_id = NEW.product_id;

    IF v_trade_type = 'PURCHASE' THEN
        SET v_after_qty_final = v_before_qty + NEW.quantity;
        UPDATE inventory SET quantity = quantity + NEW.quantity, weight = weight + v_calc_weight_new, purchase_price = NEW.unit_price WHERE product_id = NEW.product_id;
    ELSEIF v_trade_type = 'SALE' THEN
        SET v_after_qty_final = v_before_qty - NEW.quantity;
        UPDATE inventory SET quantity = quantity - NEW.quantity, weight = weight - v_calc_weight_new WHERE product_id = NEW.product_id;
    ELSEIF v_trade_type = 'PRODUCTION' THEN
        SET v_after_qty_final = v_before_qty + NEW.quantity;
        UPDATE inventory SET quantity = quantity + NEW.quantity, weight = weight + v_calc_weight_new WHERE product_id = NEW.product_id;
    END IF;

    -- 새 상태 이력 기록
    INSERT INTO inventory_transactions
    (transaction_date, transaction_type, product_id, quantity, weight, unit_price,
     before_quantity, after_quantity, trade_detail_id, reference_number, created_by, notes)
    VALUES
    (v_trade_date, 
     CASE WHEN NEW.quantity > 0 THEN 'IN' ELSE 'OUT' END, 
     NEW.product_id, ABS(NEW.quantity), ABS(v_calc_weight_new), NEW.unit_price,
     v_before_qty, v_after_qty_final, NEW.id, v_trade_no, 'system', 'UPDATE_APPLY');
END`;
        await db.query(updateTriggerSQL);

        // [2] before_trade_detail_delete 트리거 업데이트 (이력 로깅 추가)
        console.log('[Migration] before_trade_detail_delete 트리거 업데이트 중...');
        await db.query('DROP TRIGGER IF EXISTS before_trade_detail_delete');

        const deleteTriggerSQL = `
CREATE TRIGGER before_trade_detail_delete BEFORE DELETE ON trade_details FOR EACH ROW BEGIN
    DECLARE v_trade_type VARCHAR(20);
    DECLARE v_trade_date DATE;
    DECLARE v_trade_no VARCHAR(50);
    DECLARE v_matched_count INT DEFAULT 0;
    DECLARE v_unit_weight DECIMAL(18,2);
    DECLARE v_calc_weight DECIMAL(18,2);
    DECLARE v_before_qty DECIMAL(15,2);
    DECLARE v_after_qty DECIMAL(15,2);
    
    SELECT trade_type, trade_date, trade_number INTO v_trade_type, v_trade_date, v_trade_no
    FROM trade_masters WHERE id = OLD.trade_master_id;

    SELECT weight INTO v_unit_weight FROM products WHERE id = OLD.product_id;
    SET v_calc_weight = IFNULL(OLD.total_weight, IFNULL(v_unit_weight * ABS(OLD.quantity), 0));
    SELECT IFNULL(quantity, 0) INTO v_before_qty FROM inventory WHERE product_id = OLD.product_id;

    -- 1. 매입(PURCHASE) 삭제
    IF v_trade_type = 'PURCHASE' THEN
        SELECT COUNT(*) INTO v_matched_count FROM sale_purchase_matching spm
        JOIN purchase_inventory pi ON spm.purchase_inventory_id = pi.id
        WHERE pi.trade_detail_id = OLD.id;

        IF v_matched_count > 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '이미 매출과 매칭된 매입은 삭제할 수 없습니다.';
        END IF;

        SET v_after_qty = v_before_qty - OLD.quantity;
        UPDATE inventory SET quantity = quantity - OLD.quantity, weight = weight - v_calc_weight WHERE product_id = OLD.product_id;
        DELETE FROM purchase_inventory WHERE trade_detail_id = OLD.id;

    -- 2. 매출(SALE) 삭제
    ELSEIF v_trade_type = 'SALE' THEN
        SET v_after_qty = v_before_qty + OLD.quantity;
        UPDATE inventory SET quantity = quantity + OLD.quantity, weight = weight + v_calc_weight WHERE product_id = OLD.product_id;
        
        -- 매칭 복원 (remaining_quantity 증가)
        UPDATE purchase_inventory pi
        JOIN sale_purchase_matching spm ON pi.id = spm.purchase_inventory_id
        SET pi.remaining_quantity = pi.remaining_quantity + spm.matched_quantity,
            pi.status = 'AVAILABLE'
        WHERE spm.sale_detail_id = OLD.id;
        
        DELETE FROM sale_purchase_matching WHERE sale_detail_id = OLD.id;

    -- 3. 생산(PRODUCTION) 삭제
    ELSEIF v_trade_type = 'PRODUCTION' THEN
        SET v_after_qty = v_before_qty - OLD.quantity;
        UPDATE inventory SET quantity = quantity - OLD.quantity, weight = weight - v_calc_weight WHERE product_id = OLD.product_id;
        DELETE FROM purchase_inventory WHERE trade_detail_id = OLD.id;
    END IF;

    -- 삭제 이력 기록
    INSERT INTO inventory_transactions
    (transaction_date, transaction_type, product_id, quantity, weight, unit_price,
     before_quantity, after_quantity, trade_detail_id, reference_number, created_by, notes)
    VALUES
    (v_trade_date, 'ADJUST', OLD.product_id, OLD.quantity, v_calc_weight, OLD.unit_price,
     v_before_qty, v_after_qty, OLD.id, v_trade_no, 'system', 'DELETE_REVERSE');
END`;
        await db.query(deleteTriggerSQL);

        // [3] 최종 하드 싱크 (전체 재계산)
        console.log('[Migration] 최신 데이터 기준 하드 싱크 실행 중...');
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

        console.log('✅ [v1.0.24 Migration] 완료');
    } catch (err) {
        console.error('❌ [v1.0.24 Migration] 실패:', err.message);
        throw err;
    }
};
