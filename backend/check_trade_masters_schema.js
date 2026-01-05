const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'trade_management'
};

async function checkTradeMastersSchema() {
    try {
        const connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.execute("DESCRIBE trade_masters");
        console.log('trade_masters Columns:', rows.map(r => r.Field));

        const [fks] = await connection.execute(`
            SELECT 
                COLUMN_NAME, 
                CONSTRAINT_NAME, 
                REFERENCED_TABLE_NAME, 
                REFERENCED_COLUMN_NAME
            FROM
                INFORMATION_SCHEMA.KEY_COLUMN_USAGE
            WHERE
                REFERENCED_TABLE_SCHEMA = 'trade_management' 
                AND TABLE_NAME = 'trade_masters';
        `);
        console.log('Foreign Keys:', fks);

        await connection.end();
    } catch (err) {
        console.error('Error:', err);
    }
}

checkTradeMastersSchema();
