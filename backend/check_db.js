const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkTable() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        const [rows] = await connection.query("SHOW TABLES LIKE 'payment_methods'");
        if (rows.length > 0) {
            console.log('payment_methods table exists.');
            const [count] = await connection.query("SELECT COUNT(*) as count FROM payment_methods");
            console.log(`Row count: ${count[0].count}`);
        } else {
            console.log('payment_methods table DOES NOT exist.');
        }
        await connection.end();
    } catch (err) {
        console.error('Error:', err);
    }
}

checkTable();
