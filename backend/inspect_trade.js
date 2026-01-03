const path = require('path');
const fs = require('fs');
require('dotenv').config();
const db = require('./config/database');

async function inspect() {
    try {
        const tradeNumber = 'PUR-20260103-001';

        const output = {};

        const [masters] = await db.query('SELECT * FROM trade_masters WHERE trade_number = ?', [tradeNumber]);
        output.masters = masters;

        if (masters.length > 0) {
            const masterId = masters[0].id;
            const [details] = await db.query('SELECT * FROM trade_details WHERE trade_master_id = ?', [masterId]);
            output.details = details;

            const detailIds = details.map(d => d.id);
            if (detailIds.length > 0) {
                const [inventories] = await db.query('SELECT * FROM purchase_inventory WHERE trade_detail_id IN (?)', [detailIds]);
                output.inventories = inventories;
            }
        }

        fs.writeFileSync('debug_output.json', JSON.stringify(output, null, 2));
        console.log('Done writing debug_output.json');

    } catch (e) {
        console.error(e);
        fs.writeFileSync('debug_error.log', e.toString());
    } finally {
        process.exit();
    }
}

inspect();
