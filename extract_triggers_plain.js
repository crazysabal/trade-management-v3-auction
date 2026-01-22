const mysql = require('mysql2/promise');

async function check() {
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: 'ghdtjddn',
        database: 'trade_management',
        port: 3306
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
