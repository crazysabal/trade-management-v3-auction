require('dotenv').config();
const db = require('./config/database');

async function fixWeight() {
    const tradeDetailId = 1511;
    const invTxId = 45;
    const productId = 29;
    const quantity = 41.0;
    const unitWeight = 5.0;
    const correctTotalWeight = quantity * unitWeight; // 205.0

    console.log(`Fixing Weight for TradeDetail ${tradeDetailId}... Target: ${correctTotalWeight}kg`);

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        // 1. Update Trade Details
        await connection.query(`UPDATE trade_details SET total_weight = ? WHERE id = ?`, [correctTotalWeight, tradeDetailId]);
        console.log('Updated trade_details.');

        // 2. Update Inventory Transactions
        await connection.query(`UPDATE inventory_transactions SET weight = ? WHERE id = ?`, [correctTotalWeight, invTxId]);
        console.log('Updated inventory_transactions.');

        // 3. Update Inventory
        await connection.query(`UPDATE inventory SET weight = weight - ? WHERE product_id = ?`, [correctTotalWeight, productId]);
        console.log('Updated inventory (subtracted missing weight reduction).');

        await connection.commit();
        console.log('Fix Complete.');
    } catch (e) {
        if (connection) await connection.rollback();
        console.error(e);
    } finally {
        if (connection) connection.release();
    }
    process.exit();
}

fixWeight();
