const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'trade_management'
};

async function fixUsersTable() {
    try {
        const connection = await mysql.createConnection(dbConfig);
        // Make password column nullable
        const [result] = await connection.execute("ALTER TABLE users MODIFY COLUMN password VARCHAR(255) NULL");
        console.log('Alter Table Result:', result);

        await connection.end();
    } catch (err) {
        console.error('Error:', err);
    }
}

fixUsersTable();
