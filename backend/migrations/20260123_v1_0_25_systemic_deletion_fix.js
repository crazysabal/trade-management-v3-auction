/**
 * v1.0.25 - 연쇄 삭제 누락 방지(Master Shield) 및 재고 정합성 최종 패치
 */
module.exports = async (db) => {
    console.log('--- [v1.0.25 Migration] 시스템 결함 보정 및 연쇄 삭제 트리거 시작 ---');

    try {
        // [1] BEFORE DELETE ON trade_masters 트리거 추가 (Master Shield)
        // 목적: 상위 전표 삭제 시 하위 품목 트리거가 상위 trade_type을 참조할 수 있도록 명시적으로 먼저 삭제함.
        console.log('[Migration] before_trade_master_delete 트리거 (Master Shield) 생성 중...');
        await db.query('DROP TRIGGER IF EXISTS before_trade_master_delete');
        await db.query(`
            CREATE TRIGGER before_trade_master_delete BEFORE DELETE ON trade_masters FOR EACH ROW 
            BEGIN 
                -- 하위 trade_details를 명시적으로 먼저 삭제하여 after_trade_detail_delete 트리거가 trade_masters 데이터를 볼 수 있게 함
                DELETE FROM trade_details WHERE trade_master_id = OLD.id; 
            END
        `);

        // [2] before_trade_detail_delete 트리거 업데이트 (삭제 거부 조건 강화)
        console.log('[Migration] before_trade_detail_delete 트리거 (가드 강화) 업데이트 중...');
        await db.query('DROP TRIGGER IF EXISTS before_trade_detail_delete');

        const deleteTriggerSQL = `
CREATE TRIGGER before_trade_detail_delete BEFORE DELETE ON trade_details FOR EACH ROW BEGIN
    DECLARE v_trade_type VARCHAR(20);
    DECLARE v_trade_date DATE;
    DECLARE v_trade_no VARCHAR(50);
    DECLARE v_matched_count INT DEFAULT 0;
    DECLARE v_prod_count INT DEFAULT 0;
    DECLARE v_unit_weight DECIMAL(18,2);
    DECLARE v_calc_weight DECIMAL(18,2);
    DECLARE v_before_qty DECIMAL(15,2);
    DECLARE v_after_qty DECIMAL(15,2);
    
    SELECT trade_type, trade_date, trade_number INTO v_trade_type, v_trade_date, v_trade_no
    FROM trade_masters WHERE id = OLD.trade_master_id;

    -- trade_type이 없으면 작업 중단 (Shield 작동 실패 상황)
    IF v_trade_type IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '전표 정보를 찾을 수 없어 삭제를 중단합니다.';
    END IF;

    SELECT weight INTO v_unit_weight FROM products WHERE id = OLD.product_id;
    SET v_calc_weight = IFNULL(OLD.total_weight, IFNULL(v_unit_weight * ABS(OLD.quantity), 0));
    SELECT IFNULL(quantity, 0) INTO v_before_qty FROM inventory WHERE product_id = OLD.product_id;

    -- 1. 매입(PURCHASE) 삭제 가드
    IF v_trade_type = 'PURCHASE' THEN
        -- 매출 매칭 확인
        SELECT COUNT(*) INTO v_matched_count FROM sale_purchase_matching spm
        JOIN purchase_inventory pi ON spm.purchase_inventory_id = pi.id
        WHERE pi.trade_detail_id = OLD.id;

        IF v_matched_count > 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '이미 매출과 매칭된 매입 품목은 삭제할 수 없습니다.';
        END IF;

        -- 생산(Split) 투입 확인
        SELECT COUNT(*) INTO v_prod_count FROM inventory_production_ingredients ipi
        JOIN purchase_inventory pi ON ipi.used_inventory_id = pi.id
        WHERE pi.trade_detail_id = OLD.id;

        IF v_prod_count > 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '이미 품목 생산(분할)에 사용된 매입 품목은 삭제할 수 없습니다.';
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

    -- 3. 생산(PRODUCTION) 삭제 가드
    ELSEIF v_trade_type = 'PRODUCTION' THEN
        -- 만약 Output 품목(quantity > 0) 삭제라면, 그 Output이 판매되었는지 확인
        IF OLD.quantity > 0 THEN
            SELECT COUNT(*) INTO v_matched_count FROM sale_purchase_matching spm
            JOIN purchase_inventory pi ON spm.purchase_inventory_id = pi.id
            WHERE pi.trade_detail_id = OLD.id;

            IF v_matched_count > 0 THEN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '생산된 품목이 이미 판매되어 작업을 취소할 수 없습니다.';
            END IF;

            DELETE FROM purchase_inventory WHERE trade_detail_id = OLD.id;
        END IF;

        -- 결과적으로 aggregate inventory는 원복
        SET v_after_qty = v_before_qty - OLD.quantity;
        UPDATE inventory SET quantity = quantity - OLD.quantity, weight = weight - v_calc_weight WHERE product_id = OLD.product_id;
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
        console.log('[Migration] 최신 데이터 기준 강제 동기화(Hard Sync) 실행 중...');
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

        console.log('✅ [v1.0.25 Migration] 완료');
    } catch (err) {
        console.error('❌ [v1.0.25 Migration] 실패:', err.message);
        throw err;
    }
};
