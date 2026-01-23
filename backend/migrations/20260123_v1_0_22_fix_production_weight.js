/**
 * v1.0.22 - PRODUCTION 전표 중량(total_weight) 보정
 * 과거에 중량 정보 없이 생성된 PRODUCTION 전표들의 중량을 제품 기준 정보를 바탕으로 복구합니다.
 */
module.exports = async (db) => {
    console.log('--- [v1.0.22 Migration] PRODUCTION 중량 보정 시작 ---');

    try {
        // 1. trade_details 보정 (PRODUCTION 유형)
        console.log('[Migration] trade_details 중량 보정 중...');
        const updateTradeDetailsSQL = `
            UPDATE trade_details td
            JOIN trade_masters tm ON td.trade_master_id = tm.id
            JOIN products p ON td.product_id = p.id
            SET td.total_weight = td.quantity * IFNULL(p.weight, 0)
            WHERE tm.trade_type = 'PRODUCTION' 
              AND (td.total_weight IS NULL OR td.total_weight = 0)
        `;
        const [res1] = await db.query(updateTradeDetailsSQL);
        console.log(` - trade_details ${res1.affectedRows}건 보정 완료`);

        // 2. purchase_inventory 보정 (PRODUCTION으로 생성된 Lot)
        console.log('[Migration] purchase_inventory 중량 보정 중...');
        const updatePurchaseInventorySQL = `
            UPDATE purchase_inventory pi
            JOIN products p ON pi.product_id = p.id
            SET pi.total_weight = pi.original_quantity * IFNULL(p.weight, 0)
            WHERE pi.trade_detail_id IN (
                SELECT td.id 
                FROM trade_details td 
                JOIN trade_masters tm ON td.trade_master_id = tm.id 
                WHERE tm.trade_type = 'PRODUCTION'
            )
            AND (pi.total_weight IS NULL OR pi.total_weight = 0)
        `;
        const [res2] = await db.query(updatePurchaseInventorySQL);
        console.log(` - purchase_inventory ${res2.affectedRows}건 보정 완료`);

        console.log('✅ [v1.0.22 Migration] 완료');
    } catch (err) {
        console.error('❌ [v1.0.22 Migration] 실패:', err.message);
        throw err;
    }
};
