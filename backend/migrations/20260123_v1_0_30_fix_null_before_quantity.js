const db = require('../config/database');

async function up() {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        console.log('[Migration] after_trade_detail_insert 트리거 업데이트 중 (매출 시 재고 로우 보장)...');
        await connection.query('DROP TRIGGER IF EXISTS after_trade_detail_insert');
        await connection.query(`
            CREATE TRIGGER after_trade_detail_insert
            AFTER INSERT ON trade_details
            FOR EACH ROW
            BEGIN
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

                SELECT weight INTO v_unit_weight FROM products WHERE id = NEW.product_id;
                SET v_calc_weight = IFNULL(NEW.total_weight, IFNULL(v_unit_weight * ABS(NEW.quantity), 0));

                SELECT IFNULL(quantity, 0) INTO v_before_qty FROM inventory WHERE product_id = NEW.product_id;

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

                ELSEIF v_trade_type = 'SALE' THEN
                    SET v_after_qty = v_before_qty - NEW.quantity;
                    
                    INSERT INTO inventory (product_id, quantity, weight)
                    VALUES (NEW.product_id, -NEW.quantity, -v_calc_weight)
                    ON DUPLICATE KEY UPDATE
                        quantity = quantity - NEW.quantity,
                        weight = weight - v_calc_weight;

                ELSEIF v_trade_type = 'PRODUCTION' THEN
                    SET v_after_qty = v_before_qty + NEW.quantity;
                    -- PRODUCTION is handled like PURCHASE or inverse depending on logic, keeping current structure
                    INSERT INTO inventory (product_id, quantity, weight)
                    VALUES (NEW.product_id, NEW.quantity, v_calc_weight)
                    ON DUPLICATE KEY UPDATE
                        quantity = quantity + NEW.quantity,
                        weight = weight + v_calc_weight;
                END IF;

                IF v_trade_type IN ('PURCHASE', 'SALE', 'PRODUCTION') THEN
                    INSERT INTO inventory_transactions
                    (transaction_date, transaction_type, product_id, quantity, weight, unit_price,
                     before_quantity, after_quantity, trade_detail_id, reference_number, created_by)
                    VALUES
                    (v_trade_date, 
                     CASE WHEN NEW.quantity > 0 THEN 'IN' ELSE 'OUT' END, 
                     NEW.product_id, ABS(NEW.quantity), ABS(v_calc_weight), NEW.unit_price,
                     IFNULL(v_before_qty, 0), v_after_qty, NEW.id,
                     (SELECT trade_number FROM trade_masters WHERE id = NEW.trade_master_id), 'system');
                END IF;
            END
        `);

        console.log('[Migration] after_trade_detail_update 트리거 업데이트 중 (NULL 방지 및 최적화)...');
        await connection.query('DROP TRIGGER IF EXISTS after_trade_detail_update');
        await connection.query(`
            CREATE TRIGGER after_trade_detail_update
            AFTER UPDATE ON trade_details
            FOR EACH ROW
            BEGIN
                DECLARE v_trade_type VARCHAR(20);
                DECLARE v_trade_date DATE;
                DECLARE v_trade_no VARCHAR(50);
                DECLARE v_unit_weight_old DECIMAL(18,2);
                DECLARE v_unit_weight_new DECIMAL(18,2);
                DECLARE v_calc_weight_old DECIMAL(18,2);
                DECLARE v_calc_weight_new DECIMAL(18,2);
                DECLARE v_before_qty DECIMAL(15,2) DEFAULT 0;
                DECLARE v_after_qty_mid DECIMAL(15,2) DEFAULT 0;
                DECLARE v_after_qty_final DECIMAL(15,2) DEFAULT 0;

                -- 중요 변경 사항이 없는 경우 (매칭 상태 업데이트 등) 즉시 종료
                IF (OLD.product_id = NEW.product_id AND OLD.quantity = NEW.quantity AND OLD.unit_price = NEW.unit_price AND IFNULL(OLD.total_weight, 0) = IFNULL(NEW.total_weight, 0)) THEN
                    -- No inventory impact
                    SET v_trade_type = 'NO_CHANGE';
                ELSE
                    SELECT trade_type, trade_date, trade_number INTO v_trade_type, v_trade_date, v_trade_no 
                    FROM trade_masters WHERE id = NEW.trade_master_id;
                END IF;

                IF v_trade_type IN ('PURCHASE', 'SALE', 'PRODUCTION') THEN
                    -- 0. 중량 및 현재 재고 조회
                    SELECT weight INTO v_unit_weight_old FROM products WHERE id = OLD.product_id;
                    SELECT weight INTO v_unit_weight_new FROM products WHERE id = NEW.product_id;
                    SELECT IFNULL(quantity, 0) INTO v_before_qty FROM inventory WHERE product_id = OLD.product_id;
                    
                    SET v_calc_weight_old = IFNULL(OLD.total_weight, IFNULL(v_unit_weight_old * ABS(OLD.quantity), 0));
                    SET v_calc_weight_new = IFNULL(NEW.total_weight, IFNULL(v_unit_weight_new * ABS(NEW.quantity), 0));

                    -- 1. 이전 상태 복원
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

                    INSERT INTO inventory_transactions
                    (transaction_date, transaction_type, product_id, quantity, weight, unit_price,
                     before_quantity, after_quantity, trade_detail_id, reference_number, created_by, notes)
                    VALUES
                    (v_trade_date, 'ADJUST', OLD.product_id, OLD.quantity, v_calc_weight_old, OLD.unit_price,
                     v_before_qty, v_after_qty_mid, OLD.id, v_trade_no, 'system', 'UPDATE_REVERSE');

                    -- 2. 새 상태 반영
                    SELECT IFNULL(quantity, 0) INTO v_before_qty FROM inventory WHERE product_id = NEW.product_id;

                    IF v_trade_type = 'PURCHASE' THEN
                        SET v_after_qty_final = v_before_qty + NEW.quantity;
                        
                        INSERT INTO inventory (product_id, quantity, weight, purchase_price)
                        VALUES (NEW.product_id, NEW.quantity, v_calc_weight_new, NEW.unit_price)
                        ON DUPLICATE KEY UPDATE
                            quantity = quantity + NEW.quantity, 
                            weight = weight + v_calc_weight_new, 
                            purchase_price = NEW.unit_price;
                            
                    ELSEIF v_trade_type = 'SALE' THEN
                        SET v_after_qty_final = v_before_qty - NEW.quantity;
                        
                        INSERT INTO inventory (product_id, quantity, weight)
                        VALUES (NEW.product_id, -NEW.quantity, -v_calc_weight_new)
                        ON DUPLICATE KEY UPDATE
                            quantity = quantity - NEW.quantity, 
                            weight = weight - v_calc_weight_new;
                            
                    ELSEIF v_trade_type = 'PRODUCTION' THEN
                        SET v_after_qty_final = v_before_qty + NEW.quantity;
                        
                        INSERT INTO inventory (product_id, quantity, weight)
                        VALUES (NEW.product_id, NEW.quantity, v_calc_weight_new)
                        ON DUPLICATE KEY UPDATE
                            quantity = quantity + NEW.quantity, 
                            weight = weight + v_calc_weight_new;
                    END IF;

                    INSERT INTO inventory_transactions
                    (transaction_date, transaction_type, product_id, quantity, weight, unit_price,
                     before_quantity, after_quantity, trade_detail_id, reference_number, created_by, notes)
                    VALUES
                    (v_trade_date, 
                     CASE WHEN NEW.quantity \u003e 0 THEN 'IN' ELSE 'OUT' END, 
                     NEW.product_id, ABS(NEW.quantity), ABS(v_calc_weight_new), NEW.unit_price,
                     v_before_qty, v_after_qty_final, NEW.id, v_trade_no, 'system', 'UPDATE_APPLY');
                END IF;
            END
        `);

        console.log('[Migration] before_trade_detail_delete 트리거 업데이트 중 (NULL 방지)...');
        await connection.query('DROP TRIGGER IF EXISTS before_trade_detail_delete');
        await connection.query(`
            CREATE TRIGGER before_trade_detail_delete
            BEFORE DELETE ON trade_details
            FOR EACH ROW
            BEGIN
                DECLARE v_trade_type VARCHAR(20);
                DECLARE v_trade_date DATE;
                DECLARE v_trade_no VARCHAR(50);
                DECLARE v_matched_count INT DEFAULT 0;
                DECLARE v_unit_weight DECIMAL(18,2);
                DECLARE v_calc_weight DECIMAL(18,2);
                DECLARE v_before_qty DECIMAL(15,2) DEFAULT 0;
                DECLARE v_after_qty DECIMAL(15,2) DEFAULT 0;
                
                SELECT trade_type, trade_date, trade_number INTO v_trade_type, v_trade_date, v_trade_no
                FROM trade_masters WHERE id = OLD.trade_master_id;

                SELECT weight INTO v_unit_weight FROM products WHERE id = OLD.product_id;
                SET v_calc_weight = IFNULL(OLD.total_weight, IFNULL(v_unit_weight * ABS(OLD.quantity), 0));
                SELECT IFNULL(quantity, 0) INTO v_before_qty FROM inventory WHERE product_id = OLD.product_id;

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

                ELSEIF v_trade_type = 'SALE' THEN
                    SET v_after_qty = v_before_qty + OLD.quantity;
                    UPDATE inventory SET quantity = quantity + OLD.quantity, weight = weight + v_calc_weight WHERE product_id = OLD.product_id;
                    
                    UPDATE purchase_inventory pi
                    JOIN sale_purchase_matching spm ON pi.id = spm.purchase_inventory_id
                    SET pi.remaining_quantity = pi.remaining_quantity + spm.matched_quantity,
                        pi.status = 'AVAILABLE'
                    WHERE spm.sale_detail_id = OLD.id;
                    
                    DELETE FROM sale_purchase_matching WHERE sale_detail_id = OLD.id;

                ELSEIF v_trade_type = 'PRODUCTION' THEN
                    SET v_after_qty = v_before_qty - OLD.quantity;
                    UPDATE inventory SET quantity = quantity - OLD.quantity, weight = weight - v_calc_weight WHERE product_id = OLD.product_id;
                    DELETE FROM purchase_inventory WHERE trade_detail_id = OLD.id;
                END IF;

                INSERT INTO inventory_transactions
                (transaction_date, transaction_type, product_id, quantity, weight, unit_price,
                 before_quantity, after_quantity, trade_detail_id, reference_number, created_by, notes)
                VALUES
                (v_trade_date, 'ADJUST', OLD.product_id, OLD.quantity, v_calc_weight, OLD.unit_price,
                 v_before_qty, v_after_qty, OLD.id, v_trade_no, 'system', 'DELETE_REVERSE');
            END
        `);

        await connection.commit();
        console.log('Migration v1_0_30 applied: Fixed NULL before_quantity in triggers');
    } catch (error) {
        await connection.rollback();
        console.error('Migration failed:', error);
        throw error;
    } finally {
        connection.release();
    }
}

// 직접 실행 로직
if (require.main === module) {
    up().then(() => process.exit(0)).catch(err => {
        console.error(err);
        process.exit(1);
    });
}

module.exports = { up };
