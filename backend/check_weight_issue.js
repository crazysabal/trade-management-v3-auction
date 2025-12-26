require('dotenv').config();
const db = require('./config/database');

async function checkWeight() {
    console.log("Checking for OUT transactions with 0 weight...");

    // Check Inventory Transactions
    const [rows] = await db.query(`
        SELECT it.id, it.transaction_date, it.transaction_type, it.product_id, 
               it.quantity, it.weight, it.trade_detail_id,
               p.product_name, p.unit
        FROM inventory_transactions it
        JOIN products p ON it.product_id = p.id
        WHERE it.transaction_type = 'OUT' 
          AND (it.weight = 0 OR it.weight IS NULL)
        ORDER BY it.transaction_date DESC
        LIMIT 20
    `);

    console.log(JSON.stringify(rows, null, 2));

    if (rows.length > 0) {
        const detailIds = rows.map(r => r.trade_detail_id).filter(id => id);
        if (detailIds.length > 0) {
            console.log("\n--- Corresponding Trade Details ---");
            const [details] = await db.query(`
                SELECT id, quantity, total_weight, unit_price 
                FROM trade_details 
                WHERE id IN (?)
            `, [detailIds]);
            console.log(JSON.stringify(details, null, 2));
        }
    }

    process.exit();
}

checkWeight();
