require('dotenv').config({ path: '../.env' });
const mysql = require('mysql2/promise');

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
};

async function checkSchema() {
    let connection;
    try {
        console.log('Connecting to DB...');
        connection = await mysql.createConnection(dbConfig);

        console.log('\n--- purchase_inventory ---');
        const [pi] = await connection.query('DESCRIBE purchase_inventory');
        console.log(JSON.stringify(pi, null, 2));

        console.log('\n--- trade_details ---');
        const [td] = await connection.query('DESCRIBE trade_details');
        console.log(JSON.stringify(td, null, 2));

        console.log('\n--- trade_masters ---');
        const [tm] = await connection.query('DESCRIBE trade_masters');
        console.log(JSON.stringify(tm, null, 2));

    } catch (error) {
        console.error(error);
    } finally {
        if (connection) await connection.end();
    }
}

checkSchema();
