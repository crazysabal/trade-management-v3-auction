const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'trade_management'
};

async function checkTradesFK() {
    try {
        const connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.execute(`
            SELECT 
                TABLE_NAME, 
                COLUMN_NAME, 
                CONSTRAINT_NAME, 
                REFERENCED_TABLE_NAME, 
                REFERENCED_COLUMN_NAME
            FROM
                INFORMATION_SCHEMA.KEY_COLUMN_USAGE
            WHERE
                REFERENCED_TABLE_SCHEMA = 'trade_management' 
                AND TABLE_NAME = 'trades';
        `);
        console.log('Foreign Keys on trades table:', rows);

        // Also check triggers or strict FK mode
        const [createTable] = await connection.execute("SHOW CREATE TABLE trades");
        console.log('Create Table SQL:', createTable[0]['Create Table']);

        await connection.end();
    } catch (err) {
        console.error('Error:', err);
    }
}

checkTradesFK();
