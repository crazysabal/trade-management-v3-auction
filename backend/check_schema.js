const fs = require('fs');
const db = require('./config/database');

async function check() {
    try {
        const [columns] = await db.query('DESCRIBE warehouse_transfers');
        const [piColumns] = await db.query('DESCRIBE purchase_inventory');

        fs.writeFileSync('schema_output.json', JSON.stringify({
            warehouse_transfers: columns,
            purchase_inventory: piColumns
        }, null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

check();
