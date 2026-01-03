const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'backend', '.env') });
const db = require('./backend/config/database');

async function inspect() {
    try {
        const tradeNumber = 'PUR-20260103-001';
        console.log(`Inspecting Trade: ${tradeNumber}`);

        const [masters] = await db.query('SELECT * FROM trade_masters WHERE trade_number = ?', [tradeNumber]);
        console.log('--- Masters ---');
        console.table(masters);

        if (masters.length > 0) {
            const masterId = masters[0].id;
            const [details] = await db.query('SELECT * FROM trade_details WHERE trade_master_id = ?', [masterId]);
            console.log('--- Details ---');
            console.table(details);

            const detailIds = details.map(d => d.id);
            if (detailIds.length > 0) {
                const [inventories] = await db.query('SELECT * FROM purchase_inventory WHERE trade_detail_id IN (?)', [detailIds]);
                console.log('--- Inventories ---');
                console.table(inventories);
            }
        }
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

inspect();
