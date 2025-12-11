const db = require('./config/database');

async function updateTrigger() {
  try {
    await db.query('DROP TRIGGER IF EXISTS after_trade_detail_insert');
    console.log('기존 트리거 삭제');
    
    await db.query(`
      CREATE TRIGGER after_trade_detail_insert
      AFTER INSERT ON trade_details
      FOR EACH ROW
      BEGIN
          DECLARE v_trade_type VARCHAR(20);
          DECLARE v_before_qty DECIMAL(15,2) DEFAULT 0;
          DECLARE v_after_qty DECIMAL(15,2) DEFAULT 0;
          DECLARE v_trade_date DATE;
          DECLARE v_count INT DEFAULT 0;

          SELECT trade_type, trade_date INTO v_trade_type, v_trade_date
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
              VALUES (NEW.product_id, NEW.quantity, NEW.total_weight, NEW.unit_price)
              ON DUPLICATE KEY UPDATE
                  quantity = quantity + NEW.quantity,
                  weight = weight + IFNULL(NEW.total_weight, 0),
                  purchase_price = NEW.unit_price;

              INSERT INTO inventory_transactions
              (transaction_date, transaction_type, product_id, quantity, weight, unit_price,
               before_quantity, after_quantity, trade_detail_id, reference_number, created_by)
              VALUES
              (v_trade_date, 'IN', NEW.product_id, NEW.quantity, NEW.total_weight, NEW.unit_price,
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
              (v_trade_date, 'OUT', NEW.product_id, NEW.quantity, NEW.total_weight, NEW.unit_price,
               v_before_qty, v_after_qty, NEW.id,
               (SELECT trade_number FROM trade_masters WHERE id = NEW.trade_master_id), 'system');
          END IF;
      END
    `);
    console.log('트리거 업데이트 완료');
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}

updateTrigger();

