require('dotenv').config({ path: 'backend/.env' });
const db = require('./backend/config/database');

async function checkCounts() {
    try {
        const [rows] = await db.query(`
            SELECT 
                (SELECT COUNT(*) FROM trade_masters) as trade_count,
                (SELECT COUNT(*) FROM trade_details) as detail_count,
                (SELECT COUNT(*) FROM purchase_inventory) as inv_count,
                (SELECT COUNT(*) FROM sale_purchase_matching) as matching_count,
                (SELECT COUNT(*) FROM inventory_productions) as prod_count
        `);
        console.log('Counts:', rows[0]);

        // If inventory exists, show sample
        if (rows[0].inv_count > 0) {
            const [sample] = await db.query('SELECT id, trade_detail_id FROM purchase_inventory LIMIT 5');
            console.log('Sample Inventory:', sample);

            // Check if linked trade_detail exists
            if (sample.length > 0) {
                const ids = sample.map(s => s.trade_detail_id).join(',');
                const [details] = await db.query(`SELECT id FROM trade_details WHERE id IN (${ids})`);
                console.log('Linked Details Found:', details.length);
            }
        }

        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

checkCounts();
