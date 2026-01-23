const db = require('../config/database');

async function up() {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Drop existing trigger
        await connection.query('DROP TRIGGER IF EXISTS after_trade_detail_insert');

        // 2. Re-create trigger without the SALE negative check
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
              
              -- [MODIFIED] 재고 부족 체크 로직 제거 (마이너스 재고 허용)
              -- IF v_after_qty < 0 THEN
              --    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '재고가 부족하여 매출을 등록할 수 없습니다.';
              -- END IF;

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
      END
    `);

        await connection.commit();
        console.log('Migration v1_0_29 applied: Allowed negative inventory for sales');
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
