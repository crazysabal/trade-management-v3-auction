const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config(); // Current folder check

async function debug() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'trade_management',
        port: process.env.DB_PORT || 3306
    });

    try {
        const [rows] = await connection.query(`
      SELECT id, product_id, remaining_quantity, display_order, created_at 
      FROM purchase_inventory 
      ORDER BY id DESC 
      LIMIT 10
    `);

        console.log('Recent 10 items in purchase_inventory (JSON):');
        console.log(JSON.stringify(rows, null, 2));

        const [nullCount] = await connection.query('SELECT COUNT(*) as count FROM purchase_inventory WHERE display_order IS NULL');
        const [totalCount] = await connection.query('SELECT COUNT(*) as count FROM purchase_inventory');
        console.log(`NULL display_order count: ${nullCount[0].count} / ${totalCount[0].count}`);

    } catch (err) {
        console.error(err);
    } finally {
        await connection.end();
    }
}

debug();
