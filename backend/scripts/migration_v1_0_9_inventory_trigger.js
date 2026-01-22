require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/database');

async function runMigration() {
    console.log('--- [v1.0.9] 재고 동기화 트리거 보정 마이그레이션 시작 ---');
    try {
        // [1] before_trade_detail_delete 트리거 수정
        // 기존: 집계 재고(inventory) 복구 로직 누락됨
        // 수정: 매입 삭제 시 재고 차감, 매출 삭제 시 재고 가산 로직 추가
        console.log('🔄 before_trade_detail_delete 트리거 업데이트 중...');
        await db.query('DROP TRIGGER IF EXISTS before_trade_detail_delete');

        const triggerSQL = `
CREATE TRIGGER before_trade_detail_delete
BEFORE DELETE ON trade_details
FOR EACH ROW
BEGIN
    DECLARE v_trade_type VARCHAR(20);
    DECLARE v_matched_count INT DEFAULT 0;
    
    SELECT trade_type INTO v_trade_type
    FROM trade_masters WHERE id = OLD.trade_master_id;
    
    IF v_trade_type = 'PURCHASE' THEN
        -- 매칭된 내역이 있는지 확인
        SELECT COUNT(*) INTO v_matched_count
        FROM sale_purchase_matching spm
        JOIN purchase_inventory pi ON spm.purchase_inventory_id = pi.id
        WHERE pi.trade_detail_id = OLD.id;
        
        -- 매칭된 내역이 있으면 에러 발생 (삭제 불가)
        IF v_matched_count > 0 THEN
            SIGNAL SQLSTATE '45000' 
            SET MESSAGE_TEXT = '이미 매출과 매칭된 매입은 삭제할 수 없습니다.';
        END IF;
        
        -- Aggregate Inventory 차감 (매입 취소이므로 재고 감소)
        UPDATE inventory 
        SET quantity = quantity - OLD.quantity,
            weight = weight - IFNULL(OLD.total_weight, 0)
        WHERE product_id = OLD.product_id;
        
        -- purchase_inventory에서 삭제
        DELETE FROM purchase_inventory WHERE trade_detail_id = OLD.id;
    END IF;
    
    IF v_trade_type = 'SALE' THEN
        -- Aggregate Inventory 복구 (매출 취소이므로 재고 증가)
        UPDATE inventory 
        SET quantity = quantity + OLD.quantity,
            weight = weight + IFNULL(OLD.total_weight, 0)
        WHERE product_id = OLD.product_id;

        -- 매출 삭제 시: 매칭된 재고 복원
        UPDATE purchase_inventory pi
        JOIN sale_purchase_matching spm ON pi.id = spm.purchase_inventory_id
        SET pi.remaining_quantity = pi.remaining_quantity + spm.matched_quantity,
            pi.status = 'AVAILABLE'
        WHERE spm.sale_detail_id = OLD.id;
        
        -- 매칭 기록 삭제
        DELETE FROM sale_purchase_matching WHERE sale_detail_id = OLD.id;
    END IF;
    
    -- inventory_transactions에서 관련 기록 삭제
    DELETE FROM inventory_transactions WHERE trade_detail_id = OLD.id;
END`;
        await db.query(triggerSQL);
        console.log('✅ before_trade_detail_delete 트리거 업데이트 완료');

        console.log('🏁 v1.0.9 마이그레이션 작업이 완료되었습니다.');

    } catch (err) {
        console.error('❌ 작업 중 오류 발생:', err.message);
    } finally {
        process.exit();
    }
}

runMigration();
