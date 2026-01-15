const db = require('./backend/config/database');

async function analyzeLegacyData() {
    try {
        console.log('--- 기존 반품 데이터 분석 ---');

        // 1. parent_detail_id가 없는 반품 내역 조회
        const [returns] = await db.query(`
            SELECT td.id, td.trade_master_id, td.product_id, td.quantity, td.created_at, tm.trade_number
            FROM trade_details td
            JOIN trade_masters tm ON td.trade_master_id = tm.id
            WHERE td.quantity < 0 AND td.parent_detail_id IS NULL
        `);
        console.log(`링크되지 않은 기존 반품 내역: ${returns.length}건`);

        if (returns.length > 0) {
            console.log('\n예시 내역 (상위 5건):');
            returns.slice(0, 5).forEach(r => {
                console.log(`- [${r.trade_number}] ID: ${r.id}, 수량: ${r.quantity}, 날짜: ${r.created_at}`);
            });
        }

        // 2. 재고 ID 기반으로 연결 가능성 확인
        // 반품 전표 항목과 동일한 inventory_id를 참조하는 매출 전표 항목이 있는지 확인
        // (sale_purchase_matching 테이블을 통해)
        const [linkable] = await db.query(`
            SELECT 
                td_ret.id as return_detail_id,
                td_sale.id as sale_detail_id,
                tm_sale.trade_number as sale_trade_number
            FROM trade_details td_ret
            JOIN sale_purchase_matching spm_ret ON td_ret.id = spm_ret.sale_detail_id
            JOIN sale_purchase_matching spm_sale ON spm_ret.purchase_inventory_id = spm_sale.purchase_inventory_id
            JOIN trade_details td_sale ON spm_sale.sale_detail_id = td_sale.id
            JOIN trade_masters tm_sale ON td_sale.trade_master_id = tm_sale.id
            WHERE td_ret.quantity < 0 
              AND td_sale.quantity > 0
              AND td_ret.parent_detail_id IS NULL
            LIMIT 10
        `);
        console.log(`\n자동 링크 가능한 내역 (샘플): ${linkable.length}건`);

        process.exit(0);
    } catch (error) {
        console.error('분석 실패:', error.message);
        process.exit(1);
    }
}

analyzeLegacyData();
