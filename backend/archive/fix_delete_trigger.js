const db = require('./config/database');

async function updateDeleteTrigger() {
  try {
    console.log('삭제 트리거 업데이트 중...');
    
    // 기존 트리거 삭제
    await db.query('DROP TRIGGER IF EXISTS before_trade_detail_delete');
    console.log('기존 트리거 삭제 완료');
    
    // 새 트리거 생성 
    // - 컬럼명 수정: current_quantity -> quantity, current_weight -> weight
    // - inventory_transactions 삭제 로직 추가
    await db.query(`
      CREATE TRIGGER before_trade_detail_delete
      BEFORE DELETE ON trade_details
      FOR EACH ROW
      BEGIN
          DECLARE v_trade_type VARCHAR(20);
          
          SELECT trade_type INTO v_trade_type
          FROM trade_masters WHERE id = OLD.trade_master_id;
          
          IF v_trade_type = 'PURCHASE' THEN
              UPDATE inventory 
              SET quantity = quantity - OLD.quantity,
                  weight = weight - IFNULL(OLD.total_weight, 0)
              WHERE product_id = OLD.product_id;
          ELSEIF v_trade_type = 'SALE' THEN
              UPDATE inventory 
              SET quantity = quantity + OLD.quantity,
                  weight = weight + IFNULL(OLD.total_weight, 0)
              WHERE product_id = OLD.product_id;
          END IF;
          
          -- 해당 trade_detail과 연결된 inventory_transactions 삭제
          DELETE FROM inventory_transactions WHERE trade_detail_id = OLD.id;
      END
    `);
    console.log('새 트리거 생성 완료');
    
    console.log('\n✅ 삭제 트리거 업데이트 완료!');
    console.log('이제 매입 전표 삭제 시:');
    console.log('  - 재고(inventory)가 올바르게 차감됩니다.');
    console.log('  - 수불부(inventory_transactions)도 함께 삭제됩니다.');
    
    process.exit(0);
  } catch (error) {
    console.error('오류:', error.message);
    process.exit(1);
  }
}

updateDeleteTrigger();

