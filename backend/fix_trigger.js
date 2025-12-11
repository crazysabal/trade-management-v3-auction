const db = require('./config/database');

async function fixTrigger() {
  try {
    console.log('트리거 수정 중...');
    
    // 기존 트리거 삭제
    await db.query(`DROP TRIGGER IF EXISTS after_trade_detail_insert`);
    console.log('기존 트리거 삭제 완료');
    
    // 수정된 트리거 생성
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
          
          -- inventory에 해당 품목이 있는지 확인
          SELECT COUNT(*) INTO v_count FROM inventory WHERE product_id = NEW.product_id;
          
          IF v_count > 0 THEN
              SELECT IFNULL(current_quantity, 0) INTO v_before_qty
              FROM inventory WHERE product_id = NEW.product_id;
          ELSE
              SET v_before_qty = 0;
          END IF;
          
          IF v_trade_type = 'PURCHASE' THEN
              SET v_after_qty = v_before_qty + NEW.quantity;
              
              INSERT INTO inventory (product_id, current_quantity, current_weight, last_purchase_price)
              VALUES (NEW.product_id, NEW.quantity, NEW.total_weight, NEW.unit_price)
              ON DUPLICATE KEY UPDATE 
                  current_quantity = current_quantity + NEW.quantity,
                  current_weight = current_weight + IFNULL(NEW.total_weight, 0),
                  last_purchase_price = NEW.unit_price;
              
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
              SET current_quantity = current_quantity - NEW.quantity,
                  current_weight = current_weight - IFNULL(NEW.total_weight, 0),
                  last_sale_price = NEW.unit_price
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
    
    console.log('트리거 수정 완료!');
    process.exit(0);
  } catch (error) {
    console.error('트리거 수정 오류:', error);
    process.exit(1);
  }
}

fixTrigger();



















