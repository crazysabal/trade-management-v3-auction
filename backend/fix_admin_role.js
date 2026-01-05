const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'trade_management'
};

async function fixAdmin() {
    try {
        const connection = await mysql.createConnection(dbConfig);
        const [result] = await connection.execute("UPDATE users SET role = 'admin' WHERE username = 'admin'");
        console.log('Update Result:', result);

        const [rows] = await connection.execute("SELECT id, username, role FROM users WHERE username = 'admin'");
        console.log('Updated Admin User Data:', rows);

        await connection.end();
    } catch (err) {
        console.error('Error:', err);
    }
}

fixAdmin();
