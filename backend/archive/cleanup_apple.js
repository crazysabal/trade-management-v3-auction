const db = require('./config/database');

async function cleanup() {
    try {
        const connection = await db.getConnection();

        console.log('--- Deleting Unused Duplicate Inventory ID 1863 ---');
        const [result] = await connection.query(`
      DELETE FROM purchase_inventory WHERE id = 1863
    `);

        console.log('Result:', result);

        // Verify remaining
        const [remaining] = await connection.query(`
      SELECT * FROM purchase_inventory WHERE trade_detail_id = 2143
    `);
        console.log('Remaining Inventory for Detail 2143:', JSON.stringify(remaining, null, 2));

        connection.release();
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

cleanup();
