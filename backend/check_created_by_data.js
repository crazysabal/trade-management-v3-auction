const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'trade_management'
};

async function checkCreatedByData() {
    try {
        const connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.execute("SELECT COUNT(*) as cnt, COUNT(created_by) as non_null_cnt FROM trade_masters");
        console.log('Trade Data Stats:', rows[0]);

        await connection.end();
    } catch (err) {
        console.error('Error:', err);
    }
}

checkCreatedByData();
