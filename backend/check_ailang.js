require('dotenv').config();
const db = require('./config/database');

async function check() {
    try {
        console.log('--- Ailang Related Inventory ---');
        const [rows] = await db.query(`
      SELECT pi.id, p.product_name, pi.original_quantity, pi.remaining_quantity, c.company_name, td.sender
      FROM purchase_inventory pi
      JOIN trade_details td ON pi.trade_detail_id = td.id
      JOIN trade_masters tm ON td.trade_master_id = tm.id
      JOIN companies c ON tm.company_id = c.id
      JOIN products p ON td.product_id = p.id
      WHERE td.sender LIKE '%아이낭%' OR c.company_name LIKE '%아이낭%'
    `);
        console.table(rows);

        console.log('\n--- Inflated Records (Remaining > Original) ---');
        const [inflated] = await db.query(`
      SELECT pi.id, p.product_name, pi.original_quantity, pi.remaining_quantity 
      FROM purchase_inventory pi 
      JOIN trade_details td ON pi.trade_detail_id = td.id
      JOIN products p ON td.product_id = p.id
      WHERE pi.remaining_quantity > pi.original_quantity
    `);
        console.table(inflated);
    } catch (e) { console.error(e); }
    process.exit();
}
check();
