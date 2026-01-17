require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/database');

async function runMigration() {
    console.log('--- 중량 단위(kg/g) 지원을 위한 스키마 및 트리거 보정 시작 ---');
    try {
        // 1. 컬럼 추가 (존재하지 않을 경우만)
        const addColumn = async (table, column, definition) => {
            const [cols] = await db.query(`SHOW COLUMNS FROM ${table}`);
            if (!cols.map(c => c.Field).includes(column)) {
                await db.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
                console.log(`✅ ${table}: ${column} 컬럼 추가 완료`);
            } else {
                console.log(`ℹ️ ${table}: ${column} 컬럼이 이미 존재합니다.`);
            }
        };

        await addColumn('products', 'weight_unit', "VARCHAR(10) DEFAULT 'kg' AFTER weight");
        await addColumn('trade_details', 'weight_unit', "VARCHAR(10) DEFAULT 'kg' AFTER total_weight");
        await addColumn('purchase_inventory', 'weight_unit', "VARCHAR(10) DEFAULT 'kg' AFTER total_weight");

        // 2. 트리거 재생성 (weight_unit 반영)
        console.log('🔄 after_trade_detail_insert 트리거 재생성 중...');
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
            shipper_location, sender, status
        ) VALUES (
            NEW.id, NEW.product_id, v_company_id, IFNULL(v_warehouse_id, 1), v_trade_date,
            NEW.quantity, NEW.quantity, NEW.unit_price, IFNULL(NEW.total_weight, 0), NEW.weight_unit,
            IFNULL(NEW.shipper_location, ''), IFNULL(NEW.sender, ''), 'AVAILABLE'
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
        console.log('✅ after_trade_detail_insert 트리거 재생성 완료');

        console.log('🏁 모든 마이그레이션 및 트리거 정합성 확보가 완료되었습니다.');

    } catch (err) {
        console.error('❌ 작업 중 오류 발생:', err.message);
    } finally {
        process.exit();
    }
}

runMigration();
