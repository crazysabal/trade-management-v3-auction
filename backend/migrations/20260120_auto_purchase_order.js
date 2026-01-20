/**
 * 매입 재고 순번(display_order) 자동 부여 및 인덱스 추가
 * 2026-01-20
 */
module.exports = async (db) => {
    console.log('[Migration] 매입 재고 순번 자동 부여 로직 적용 시작');

    // 1. 인덱스 추가 (display_order 조회 성능 최적화)
    try {
        const [indexes] = await db.query('SHOW INDEX FROM purchase_inventory');
        if (!indexes.map(i => i.Key_name).includes('idx_purchase_inventory_display_order')) {
            await db.query('CREATE INDEX idx_purchase_inventory_display_order ON purchase_inventory(display_order)');
            console.log('✅ purchase_inventory: display_order 인덱스 추가 완료');
        }
    } catch (e) {
        console.warn('[Migration] 인덱스 추가 중 경고:', e.message);
    }

    // 2. 트리거 재생성 (display_order 자동 부여 로직 포함)
    console.log('🔄 after_trade_detail_insert 트리거 업데이트 중...');
    await db.query('DROP TRIGGER IF EXISTS after_trade_detail_insert');

    const triggerSQL = `
CREATE TRIGGER after_trade_detail_insert AFTER INSERT ON trade_details FOR EACH ROW BEGIN
    DECLARE v_trade_type VARCHAR(20);
    DECLARE v_before_qty DECIMAL(15,2) DEFAULT 0;
    DECLARE v_after_qty DECIMAL(15,2) DEFAULT 0;
    DECLARE v_trade_date DATE;
    DECLARE v_count INT DEFAULT 0;
    DECLARE v_company_id INT;
    DECLARE v_warehouse_id INT;
    DECLARE v_display_order INT DEFAULT 0;

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
        -- [NEW] 신규 순번 계산: 현재 최대 순번 + 1
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

    await db.query(triggerSQL);
    console.log('✅ after_trade_detail_insert 트리거 업데이트 완료 (자동 순번 로직 포함)');
};
