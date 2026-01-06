const db = require('./config/database');

async function debugCentral() {
    try {
        const connection = await db.getConnection();

        console.log('--- Searching for "135" or "중앙" in Sender/Location ---');

        // Search in trade_details
        const [rows] = await connection.query(`
      SELECT 
        td.id, 
        td.sender, 
        td.shipper_location, 
        p.product_name,
        tm.trade_number,
        c.company_name
      FROM trade_details td
      JOIN trade_masters tm ON td.trade_master_id = tm.id
      JOIN products p ON td.product_id = p.id
      JOIN companies c ON tm.company_id = c.id
      WHERE td.sender LIKE '%135%' 
         OR td.sender LIKE '%중앙%'
         OR td.shipper_location LIKE '%135%'
         OR td.shipper_location LIKE '%중앙%'
    `);

        console.log('Found Rows:', JSON.stringify(rows, null, 2));

        connection.release();
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

debugCentral();
