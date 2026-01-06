const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'trade_management'
};

async function checkUsersSchema() {
    try {
        const connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.execute("DESCRIBE users");
        console.log('Users Table Columns:', rows);
        await connection.end();
    } catch (err) {
        console.error('Error:', err);
    }
}

checkUsersSchema();
