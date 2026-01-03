const db = require('./config/database');

async function debugSender() {
    try {
        const connection = await db.getConnection();

        // 1. Search for 'Central 135' by trade number part
        console.log('\n--- 1. Searching for Trade "135" ---');
        const [trades] = await connection.query(`
      SELECT tm.id, tm.trade_number, tm.trade_date, c.company_name 
      FROM trade_masters tm
      JOIN companies c ON tm.company_id = c.id
      WHERE tm.trade_number LIKE '%135%'
         OR c.company_name LIKE '%135%'
      ORDER BY tm.id DESC
    `);

        // Clean output
        const tradesClean = JSON.parse(JSON.stringify(trades));
        console.log('Trades found:', JSON.stringify(tradesClean, null, 2));

        if (trades.length > 0) {
            const tradeIds = trades.map(t => t.id);
            const [details] = await connection.query(`
            SELECT 
              td.id as detail_id, 
              td.product_id, 
              p.product_name, 
              td.sender as td_sender, 
              pi.id as inv_id, 
              pi.sender as inv_sender
            FROM trade_details td
            LEFT JOIN products p ON td.product_id = p.id
            LEFT JOIN purchase_inventory pi ON td.id = pi.trade_detail_id
            WHERE td.trade_master_id IN (?)
        `, [tradeIds]);

            console.log('Details for these trades (looking for Pear/Bae):', JSON.stringify(details, null, 2));
        }

        // 2. Search for 'Apple' (Inventory ID 1864 from previous log)
        console.log('\n--- 2. Inspecting Apple Inventory (ID 1864) ---');
        const [apple] = await connection.query(`
        SELECT 
            pi.id as inv_id, 
            pi.trade_detail_id, 
            pi.sender as inv_sender,
            td.sender as td_sender
        FROM purchase_inventory pi
        JOIN trade_details td ON pi.trade_detail_id = td.id
        WHERE pi.id = 1864
    `);
        console.log('Apple 1864:', JSON.stringify(apple, null, 2));

        connection.release();
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

debugSender();
