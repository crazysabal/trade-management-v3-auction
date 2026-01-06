const db = require('./config/database');

async function check() {
    try {
        const inventoryId = 1868;
        console.log(`Inspecting Inventory ID: ${inventoryId}`);

        const [rows] = await db.query('SELECT * FROM purchase_inventory WHERE id = ?', [inventoryId]);
        console.table(rows);

        const [sales] = await db.query('SELECT * FROM sale_purchase_matching WHERE purchase_inventory_id = ?', [inventoryId]);
        console.log('--- Sales Linked ---');
        console.table(sales);

        const [transfers] = await db.query('SELECT * FROM warehouse_transfers WHERE purchase_inventory_id = ?', [inventoryId]);
        console.log('--- Transfers Linked ---');
        console.table(transfers);

        const [adjustments] = await db.query('SELECT * FROM inventory_adjustments WHERE purchase_inventory_id = ?', [inventoryId]);
        console.log('--- Adjustments Linked ---');
        console.table(adjustments);

    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

check();
