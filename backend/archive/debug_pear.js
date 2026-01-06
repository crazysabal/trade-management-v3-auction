const db = require('./config/database');

async function debugPear() {
    try {
        const connection = await db.getConnection();

        // 1. Find Trade Master ID for 'Central 135' or any Pear Purchase
        const [trades] = await connection.query(`
      SELECT tm.id, tm.trade_number 
      FROM trade_masters tm 
      WHERE tm.trade_number LIKE '%135%'
    `);

        if (trades.length === 0) {
            console.log('No "135" trade found. Searching by Product "Pear"...');
        }

        // 2. Search Inventory by Product Name 'Pear' (Bae)
        const [inventory] = await connection.query(`
      SELECT 
        pi.id,
        pi.remaining_quantity,
        pi.status,
        td.sender,
        td.shipper_location,
        tm.trade_number,
        p.product_name
      FROM purchase_inventory pi
      JOIN trade_details td ON pi.trade_detail_id = td.id
      JOIN trade_masters tm ON td.trade_master_id = tm.id
      JOIN products p ON pi.product_id = p.id
      WHERE p.product_name LIKE '%배%' OR p.product_name LIKE '%Pear%'
      ORDER BY pi.id DESC
      LIMIT 10
    `);

        console.log('Pear Inventory:', JSON.stringify(inventory, null, 2));

        connection.release();
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

debugPear();
