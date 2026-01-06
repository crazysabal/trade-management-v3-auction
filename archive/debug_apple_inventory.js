const db = require('./backend/config/database');

async function debugApple() {
    try {
        const connection = await db.getConnection();

        console.log('--- 1. Search for Product "사과" ---');
        const [products] = await connection.query(`
      SELECT id, product_name, grade, weight 
      FROM products 
      WHERE product_name LIKE '%사과%'
    `);
        console.table(products);

        if (products.length === 0) {
            console.log('No product found.');
            return;
        }

        // Assuming we pick the relevant product IDs (or just list all matches)
        const productIds = products.map(p => p.id);

        console.log('\n--- 2. Search Purchase Trade Details for these products ---');
        const [details] = await connection.query(`
      SELECT 
        td.id as detail_id, 
        tm.trade_number, 
        tm.trade_date,
        td.seq_no,
        p.product_name,
        p.grade,
        td.quantity,
        td.unit_price,
        td.sender
      FROM trade_details td
      JOIN trade_masters tm ON td.trade_master_id = tm.id
      JOIN products p ON td.product_id = p.id
      WHERE td.product_id IN (?) AND tm.trade_type = 'PURCHASE'
      ORDER BY tm.trade_date DESC, tm.id DESC, td.seq_no ASC
    `, [productIds]);
        console.table(details);

        console.log('\n--- 3. Search Purchase Inventory for these products ---');
        const [inventory] = await connection.query(`
      SELECT 
        pi.id as inventory_id,
        pi.trade_detail_id,
        pi.original_quantity,
        pi.remaining_quantity,
        pi.status,
        pi.unit_price
      FROM purchase_inventory pi
      WHERE pi.product_id IN (?)
      ORDER BY pi.id DESC
    `, [productIds]);
        console.table(inventory);

        connection.release();
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

debugApple();
