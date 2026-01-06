const db = require('./config/database');

async function cleanup() {
    try {
        const connection = await db.getConnection();
        console.log('Cleaning up duplicate purchase_inventory records...');

        // Get duplicates
        const [rows] = await connection.query(`
      SELECT pi.id 
      FROM purchase_inventory pi
      JOIN purchase_inventory pi2 ON pi.trade_detail_id = pi2.trade_detail_id AND pi.id > pi2.id
    `);

        if (rows.length === 0) {
            console.log('No duplicates found.');
        } else {
            console.log(`Found ${rows.length} duplicate records. Deleting...`);
            const ids = rows.map(r => r.id);

            // Delete in batches or all at once (ids matches IN clause)
            if (ids.length > 0) {
                await connection.query(`DELETE FROM purchase_inventory WHERE id IN (?)`, [ids]);
                console.log('Duplicates deleted successfully.');
            }
        }

        connection.release();
        process.exit(0);
    } catch (error) {
        console.error('Validation Error:', error);
        process.exit(1);
    }
}

cleanup();
