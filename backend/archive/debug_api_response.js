const db = require('./config/database');

async function debugApi() {
    try {
        const connection = await db.getConnection();

        // 1. Find Trade Master ID for Apple Inventory (ID 1864)
        const [rows] = await connection.query(`
        SELECT td.trade_master_id 
        FROM purchase_inventory pi
        JOIN trade_details td ON pi.trade_detail_id = td.id
        WHERE pi.id = 1864
    `);

        if (rows.length === 0) {
            console.log('No trade found for Inventory 1864');
            return;
        }

        const tradeId = rows[0].trade_master_id;
        console.log(`Trade Master ID for Apple: ${tradeId}`);

        // 2. Simulate the Query used in matching.js (Lines 884+)
        // Note: The inventory list in matching.js (Lines 884-908) is NOT filtered by trade_id. It gets ALL available inventory.
        // So I will run that exact query and filter for ID 1864 in the result to see what it looks like.

        const [allInventory] = await connection.query(`
      SELECT 
        pi.id,
        pi.product_id,
        pi.purchase_date,
        pi.original_quantity,
        pi.remaining_quantity,
        pi.unit_price,
        td.shipper_location,
        td.sender,
        p.product_name,
        p.grade,
        p.weight as product_weight,
        tm.trade_number,
        c.company_name,
        c.alias
      FROM purchase_inventory pi
      JOIN products p ON pi.product_id = p.id
      JOIN trade_details td ON pi.trade_detail_id = td.id
      JOIN trade_masters tm ON td.trade_master_id = tm.id
      JOIN companies c ON tm.company_id = c.id
      WHERE pi.status = 'AVAILABLE' 
        AND pi.remaining_quantity > 0
      ORDER BY pi.purchase_date ASC, pi.id ASC
    `);

        const appleItem = allInventory.find(i => i.id === 1864);
        console.log('Apple Item (1864) in API Response:', JSON.stringify(appleItem, null, 2));

        connection.release();
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

debugApi();
