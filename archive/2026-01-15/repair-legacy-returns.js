const db = require('./backend/config/database');

async function repairLegacyData() {
    try {
        console.log('--- 기존 반품 데이터 자동 연결 시작 ---');

        // 1. 같은 재고(inventory_id)를 공유하는 매출-반품 쌍을 찾아 parent_detail_id 업데이트
        // 이 로직은 반품이 발생했을 때 원본 매출이 가리키던 purchase_inventory_id를 
        // 반품 전표도 동일하게 가리키고 있다는 가정하에 작동합니다.
        const [result] = await db.query(`
            UPDATE trade_details td_ret
            JOIN sale_purchase_matching spm_ret ON td_ret.id = spm_ret.sale_detail_id
            JOIN sale_purchase_matching spm_sale ON spm_ret.purchase_inventory_id = spm_sale.purchase_inventory_id
            JOIN trade_details td_sale ON spm_sale.sale_detail_id = td_sale.id
            SET td_ret.parent_detail_id = td_sale.id
            WHERE td_ret.quantity < 0 
              AND td_sale.quantity > 0
              AND td_ret.parent_detail_id IS NULL
        `);

        console.log(`성공적으로 연결된 내역: ${result.affectedRows}건`);

        // 2. 한도 초과 내역 식별
        console.log('\n--- 한도 초과 반품 내역 확인 ---');
        const [overReturns] = await db.query(`
            SELECT 
                tm.trade_number,
                td.id as detail_id,
                ABS(td.quantity) as return_qty,
                ABS(parent_td.quantity) as sale_qty,
                (
                    SELECT SUM(ABS(t2.quantity))
                    FROM trade_details t2
                    JOIN trade_masters m2 ON t2.trade_master_id = m2.id
                    WHERE t2.parent_detail_id = td.parent_detail_id
                      AND m2.status != 'CANCELLED'
                ) as total_returned
            FROM trade_details td
            JOIN trade_masters tm ON td.trade_master_id = tm.id
            JOIN trade_details parent_td ON td.parent_detail_id = parent_td.id
            WHERE td.quantity < 0
              AND tm.status != 'CANCELLED'
            HAVING total_returned > sale_qty
        `);

        if (overReturns.length > 0) {
            console.log(`한도 초과된 반품이 ${overReturns.length}건 발견되었습니다.`);
            overReturns.forEach(or => {
                console.log(`- 전표: ${or.trade_number}, 반품합계: ${or.total_returned}, 매출원본: ${or.sale_qty} (초과: ${or.total_returned - or.sale_qty})`);
            });
        } else {
            console.log('한도 초과된 기존 반품 내역이 없습니다.');
        }

        process.exit(0);
    } catch (error) {
        console.error('보정 실패:', error.message);
        process.exit(1);
    }
}

repairLegacyData();
