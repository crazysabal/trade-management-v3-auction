require('dotenv').config({ path: '../.env' });
const mysql = require('mysql2/promise');

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
};

async function auditTransfers() {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);

        console.log('🔍 Checking for split inventory items (Result of Transfers)...');

        // 1. Find trade_detail_ids that have multiple inventory records
        const [splits] = await connection.query(`
            SELECT trade_detail_id, COUNT(*) as count 
            FROM purchase_inventory 
            GROUP BY trade_detail_id 
            HAVING count > 1
        `);

        if (splits.length === 0) {
            console.log('No split inventory items found. (Has a transfer actually occurred?)');
        } else {
            console.log(`Found ${splits.length} split groups.`);

            for (const split of splits) {
                console.log(`\n📦 Group: Trade Detail ID ${split.trade_detail_id}`);

                // Get detailed info for these items
                const [items] = await connection.query(`
                    SELECT 
                        pi.id, 
                        pi.warehouse_id, 
                        w.name as warehouse_name,
                        pi.original_quantity, 
                        pi.remaining_quantity, 
                        pi.status 
                    FROM purchase_inventory pi
                    LEFT JOIN warehouses w ON pi.warehouse_id = w.id
                    WHERE pi.trade_detail_id = ?
                    ORDER BY pi.id ASC
                `, [split.trade_detail_id]);

                console.table(items);

                // Check sum
                const totalRem = items.reduce((sum, item) => sum + Number(item.remaining_quantity), 0);
                console.log(`   Total Remaining Quantity in Group: ${totalRem}`);
            }
        }

        console.log('\n📜 Recent Warehouse Transfers Log (Last 5):');
        const [transfers] = await connection.query(`
            SELECT 
                wt.id, 
                wt.transfer_date,
                wt.product_id,
                p.product_name,
                w1.name as from_wh,
                w2.name as to_wh,
                wt.quantity,
                wt.notes
            FROM warehouse_transfers wt
            JOIN products p ON wt.product_id = p.id
            JOIN warehouses w1 ON wt.from_warehouse_id = w1.id
            JOIN warehouses w2 ON wt.to_warehouse_id = w2.id
            ORDER BY wt.id DESC 
            LIMIT 5
        `);
        console.table(transfers);

    } catch (error) {
        console.error('Audit failed:', error);
    } finally {
        if (connection) await connection.end();
    }
}

auditTransfers();
