const db = require('./config/database');

async function cleanup() {
    try {
        const connection = await db.getConnection();
        console.log('Cleaning up duplicate trade_details for Trade 145...');

        // Strategy: For each seq_no having count > 1, Keep the one with the smallest ID (Oldest), Delete others.
        // This assumes the "Oldest" is the valid original, and "Newer" are the duplicates from the Insert Bug.

        // 1. Get Duplicates
        const [duplicates] = await connection.query(`
      SELECT seq_no, COUNT(*) as cnt 
      FROM trade_details 
      WHERE trade_master_id = 145 
      GROUP BY seq_no 
      HAVING cnt > 1
    `);

        if (duplicates.length === 0) {
            console.log('No duplicates found.');
        } else {
            console.log(`Found ${duplicates.length} duplicate groups. cleaning...`);

            for (const grp of duplicates) {
                const [rows] = await connection.query(`
             SELECT id FROM trade_details 
             WHERE trade_master_id = 145 AND seq_no = ? 
             ORDER BY id ASC
          `, [grp.seq_no]);

                // Row[0] is Oldest (Keep). Row[1..n] are New (Delete).
                const toDelete = rows.slice(1).map(r => r.id);
                if (toDelete.length > 0) {
                    console.log(`Seq ${grp.seq_no}: Keeping ${rows[0].id}, Deleting ${toDelete.join(', ')}`);
                    await connection.query(`DELETE FROM trade_details WHERE id IN (?)`, [toDelete]);
                }
            }
            console.log('Duplicates deleted successfully.');
        }

        connection.release();
        process.exit(0);
    } catch (error) {
        console.error('Validation Error:', error);
        process.exit(1);
    }
}

cleanup();
