require('dotenv').config();
const db = require('./config/database');

async function checkCounts() {
    try {
        const [rows] = await db.query(`
            SELECT 
                (SELECT COUNT(*) FROM trade_masters) as trade_count,
                (SELECT COUNT(*) FROM trade_details) as detail_count,
                (SELECT COUNT(*) FROM purchase_inventory) as inv_count,
                (SELECT COUNT(*) FROM sale_purchase_matching) as matching_count,
                (SELECT COUNT(*) FROM inventory_productions) as prod_count,
                -- Legacy Tables
                (SELECT COUNT(*) FROM inventory_transactions) as legacy_trans_count,
                (SELECT COUNT(*) FROM warehouse_transfers) as transfer_count,
                (SELECT COUNT(*) FROM inventory) as legacy_inv_count
        `);
        console.log('Counts:', rows[0]);

        if (rows[0].legacy_trans_count > 0) {
            const [sample] = await db.query('SELECT * FROM inventory_transactions LIMIT 3');
            console.log('Sample Legacy Trans:', sample);
        }

        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

checkCounts();
