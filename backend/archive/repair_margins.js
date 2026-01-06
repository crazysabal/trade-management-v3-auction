const db = require('./config/database');

async function repair_margins() {
    console.log('Starting Margin Repair...');
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Find items to repair
        const [rows] = await connection.query(`
      SELECT td.id
      FROM trade_details td
      WHERE td.matching_status IN ('MATCHED', 'PARTIAL')
        AND (td.purchase_price IS NULL OR td.purchase_price = 0)
    `);

        console.log(`Found ${rows.length} items to repair.`);

        for (const row of rows) {
            const sale_detail_id = row.id;

            // 2. Calculate Weighted Avg Price
            const [avgPurchasePrice] = await connection.query(`
        SELECT SUM(spm.matched_quantity * pi.unit_price) / SUM(spm.matched_quantity) as weighted_avg_price
        FROM sale_purchase_matching spm
        JOIN purchase_inventory pi ON spm.purchase_inventory_id = pi.id
        WHERE spm.sale_detail_id = ?
      `, [sale_detail_id]);

            const purchasePrice = avgPurchasePrice[0]?.weighted_avg_price || 0;

            if (purchasePrice > 0) {
                console.log(`Repairing Trade Detail ID ${sale_detail_id}: Price ${purchasePrice}`);
                // 3. Update
                await connection.query(`
          UPDATE trade_details SET purchase_price = ? WHERE id = ?
        `, [purchasePrice, sale_detail_id]);
            } else {
                console.log(`Skipping Trade Detail ID ${sale_detail_id}: Calculated Price is 0 or NULL.`);
                // If calculated price is 0, it implies matched inventory has 0 cost.
                // We might want to set it to 0 explicitly if it was NULL, to avoid "IS NULL" checks failing?
                // But the check above covers 0.
            }
        }

        await connection.commit();
        console.log('Repair Complete.');
    } catch (error) {
        await connection.rollback();
        console.error('Repair Failed:', error);
    } finally {
        connection.release();
        process.exit(0);
    }
}

repair_margins();
