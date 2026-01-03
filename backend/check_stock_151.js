const db = require('./config/database');

async function check() {
    try {
        const tradeDetailId = 2117; // Linked to Product 151
        console.log(`Checking Inventory for Trade Detail ID: ${tradeDetailId}`);

        const [rows] = await db.query(
            `SELECT * FROM purchase_inventory WHERE trade_detail_id = ?`,
            [tradeDetailId]
        );
        console.table(rows);

        const totalRemaining = rows.reduce((sum, row) => sum + parseFloat(row.remaining_quantity), 0);
        console.log(`Total Remaining Quantity: ${totalRemaining}`);

    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

check();
