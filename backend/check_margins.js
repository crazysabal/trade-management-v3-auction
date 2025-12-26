const db = require('./config/database');

async function check_missing_costs() {
    console.log('Checking for MATCHED items with missing purchase_price...');
    try {
        const [rows] = await db.query(`
      SELECT 
        td.id, 
        td.trade_master_id,
        td.product_id,
        td.quantity,
        td.unit_price as sale_price,
        td.purchase_price,
        td.matching_status,
        (SELECT SUM(matched_quantity) FROM sale_purchase_matching WHERE sale_detail_id = td.id) as actual_matched_qty
      FROM trade_details td
      WHERE td.matching_status IN ('MATCHED', 'PARTIAL')
        AND (td.purchase_price IS NULL OR td.purchase_price = 0)
    `);

        console.log(`Found ${rows.length} items with missing/zero purchase_price.`);
        if (rows.length > 0) {
            console.log('Sample Data:', rows.slice(0, 5));
        }

        // Also check if any purchase_inventory has unit_price = 0
        const [zeroCostInventory] = await db.query(`
        SELECT count(*) as count FROM purchase_inventory WHERE unit_price = 0
    `);
        console.log(`Inventory items with 0 unit_price: ${zeroCostInventory[0].count}`);

        process.exit(0);
    } catch (error) {
        console.error('Check failed:', error);
        process.exit(1);
    }
}

check_missing_costs();
