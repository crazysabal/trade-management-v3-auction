const db = require('./config/database');

async function debugUsage() {
    try {
        const connection = await db.getConnection();

        // IDs identified earlier
        const inventoryIds = [1863, 1864];

        console.log(`Checking usage for Inventory IDs: ${inventoryIds.join(', ')}`);

        const [matches] = await connection.query(`
      SELECT * FROM sale_purchase_matching 
      WHERE purchase_inventory_id IN (?)
    `, [inventoryIds]);

        console.log('Matches found:', JSON.stringify(matches, null, 2));

        connection.release();
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

debugUsage();
