const db = require('./config/database');

async function cleanup() {
    try {
        const connection = await db.getConnection();
        console.log('Cleaning up duplicate trade_details for Trade 144...');

        // Identify the "Ghost" details (created later)
        // Valid time: 01:35:48
        // Ghost time: 01:36:04
        // Using ID range based on investigation (IDs > 1658 are the duplicates created at 01:36:04)
        const [rows] = await connection.query(`
      SELECT id FROM trade_details 
      WHERE trade_master_id = 144 
      AND id > 1658
    `);

        if (rows.length === 0) {
            console.log('No ghost details found.');
        } else {
            console.log(`Found ${rows.length} ghost details. Deleting...`);
            const ids = rows.map(r => r.id);

            // Delete ghost details (Cascade should handle inventory)
            if (ids.length > 0) {
                // Safe check: Ensure we are not deleting everything (Trade 144 has ~20 valid items too)
                const [total] = await connection.query('SELECT count(*) as cnt FROM trade_details WHERE trade_master_id = 144');
                if (total[0].cnt <= ids.length) {
                    console.error("Safety Stop: Attempting to delete ALL or MORE items than exist.");
                    process.exit(1);
                }

                await connection.query(`DELETE FROM trade_details WHERE id IN (?)`, [ids]);
                console.log('Ghost details deleted successfully.');
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
