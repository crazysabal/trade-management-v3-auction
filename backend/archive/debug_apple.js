const db = require('./config/database');

async function debugApple() {
    try {
        const connection = await db.getConnection();

        // 1. Get Product IDs for '사과'
        const [products] = await connection.query(`
      SELECT id, product_name FROM products WHERE product_name LIKE '%사과_10kg%' OR product_name LIKE '%사과%'
    `);
        const productIds = products.map(p => p.id);

        // 2. Get Inventory for these products
        const [inventory] = await connection.query(`
      SELECT 
        pi.id as inventory_id,
        pi.trade_detail_id,
        pi.original_quantity,
        pi.remaining_quantity
      FROM purchase_inventory pi
      WHERE pi.product_id IN (?)
      ORDER BY pi.id DESC
    `, [productIds]);

        // 3. Print cleanly
        console.log(JSON.stringify(inventory, null, 2));

        connection.release();
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

debugApple();
