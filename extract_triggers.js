const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'backend/.env') });

async function check() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT
    });

    const [triggers] = await connection.query('SHOW CREATE TRIGGER after_trade_detail_insert');
    console.log('--- [after_trade_detail_insert] ---');
    console.log(triggers[0]['SQL Original Statement']);

    const [triggers2] = await connection.query('SHOW CREATE TRIGGER before_trade_detail_delete');
    console.log('\n--- [before_trade_detail_delete] ---');
    console.log(triggers2[0]['SQL Original Statement']);

    await connection.end();
}
check().catch(console.error);
