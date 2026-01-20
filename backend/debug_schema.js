const mysql = require('mysql2/promise');
require('dotenv').config();

async function debug() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'trade_management',
        port: process.env.DB_PORT || 3306
    });

    try {
        const [rows] = await connection.query('DESCRIBE purchase_inventory');
        console.log(JSON.stringify(rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await connection.end();
    }
}

debug();
