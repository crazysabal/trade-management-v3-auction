const db = require('../config/database');

async function runFix() {
    const connection = await db.getConnection();
    try {
        console.log('Starting inventory original_quantity fix...');
        await connection.beginTransaction();

        // 1. 이동 입고 내역이 있는 모든 재고 조회
        const [inventories] = await connection.query(`
            SELECT pi.id, pi.created_at, pi.original_quantity, pi.product_id
            FROM purchase_inventory pi
            WHERE EXISTS (SELECT 1 FROM warehouse_transfers wt WHERE wt.new_inventory_id = pi.id)
            FOR UPDATE
        `);

        console.log(`Found ${inventories.length} inventories with transfer-in history.`);

        let fixedCount = 0;

        for (const inv of inventories) {
            // 해당 재고로 들어온 모든 이동 내역 조회 (시간순)
            const [transfers] = await connection.query(`
                SELECT id, quantity, created_at 
                FROM warehouse_transfers 
                WHERE new_inventory_id = ? 
                ORDER BY created_at ASC, id ASC
            `, [inv.id]);

            if (transfers.length === 0) continue;

            let subtractQty = 0;
            let logMsg = `Inventory #${inv.id} (Orig: ${inv.original_quantity}): `;

            // 로직: 첫 번째 이동이 재고 생성과 거의 동시라면 Creator로 간주
            const firstTrans = transfers[0];
            const invTime = new Date(inv.created_at).getTime();
            const transTime = new Date(firstTrans.created_at).getTime();
            const timeDiff = Math.abs(invTime - transTime);

            let startIndex = 0;

            // 2초 이내면 동시 생성으로 간주 (Creator) - 차감 제외
            if (timeDiff <= 2000) {
                logMsg += `Created by Transfer #${firstTrans.id} (${firstTrans.quantity}). `;
                startIndex = 1; // 첫 번째는 건너뜀
            } else {
                logMsg += `Created by PURCHASE. `;
            }

            // 나머지 이동은 모두 병합(Merge)이므로 차감 대상
            for (let i = startIndex; i < transfers.length; i++) {
                subtractQty += parseFloat(transfers[i].quantity);
                logMsg += `Merge #${transfers[i].id} (-${transfers[i].quantity}); `;
            }

            if (subtractQty > 0) {
                const newOriginal = parseFloat(inv.original_quantity) - subtractQty;

                // 음수 방지 (데이터 정합성 문제 시)
                if (newOriginal < 0) {
                    console.error(`ERROR: Inventory #${inv.id} new original would be negative (${newOriginal}). Skipping.`);
                    continue;
                }

                console.log(`${logMsg} => New Original: ${newOriginal}`);

                await connection.query(`
                    UPDATE purchase_inventory 
                    SET original_quantity = ? 
                    WHERE id = ?
                `, [newOriginal, inv.id]);

                fixedCount++;
            }
        }

        await connection.commit();
        console.log(`Successfully fixed ${fixedCount} inventories.`);

    } catch (error) {
        await connection.rollback();
        console.error('Error:', error);
    } finally {
        connection.release();
        // db.end(); // Keep connection alive if needed, or close explicitly
        process.exit(0);
    }
}

runFix();
