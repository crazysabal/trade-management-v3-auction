const db = require('./config/database');

async function run() {
    try {
        const query = `
      SELECT 
        pi.id,
        pi.status,
        pi.remaining_quantity,
        pi.trade_detail_id,
        tm.id as trade_master_id,
        p.product_name
      FROM purchase_inventory pi
      JOIN products p ON pi.product_id = p.id
      JOIN companies c ON pi.company_id = c.id
      JOIN warehouses w ON pi.warehouse_id = w.id
      JOIN trade_details td ON pi.trade_detail_id = td.id
      JOIN trade_masters tm ON td.trade_master_id = tm.id
      WHERE pi.remaining_quantity > 0
      AND pi.status = 'AVAILABLE'
    `;

        const [rows] = await db.query(query);
        console.log(`[DEBUG] Found ${rows.length} available inventory items.`);
        if (rows.length > 0) {
            console.log('First 3 items:', rows.slice(0, 3));
        } else {
            // If 0, check how many total active items exist ignoring joins
            const [rawRows] = await db.query("SELECT COUNT(*) as count FROM purchase_inventory WHERE remaining_quantity > 0 AND status='AVAILABLE'");
            console.log(`[DEBUG] Raw 'purchase_inventory' count (ignoring joins): ${rawRows[0].count}`);
        }
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

run();
