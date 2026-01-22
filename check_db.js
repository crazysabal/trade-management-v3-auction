const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../backend/.env') });

async function check() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT
    });

    console.log('--- [INVENTORY TABLE SCHEMA] ---');
    const [cols] = await connection.query('DESCRIBE inventory');
    console.log(JSON.stringify(cols, null, 2));

    console.log('\n--- [BEFORE_DELETE TRIGGER] ---');
    const [triggers] = await connection.query('SHOW CREATE TRIGGER before_trade_detail_delete');
    if (triggers.length > 0) {
        console.log(triggers[0]['SQL Original Statement']);
    } else {
        console.log('Trigger not found.');
    }

    await connection.end();
}

check().catch(console.error);
