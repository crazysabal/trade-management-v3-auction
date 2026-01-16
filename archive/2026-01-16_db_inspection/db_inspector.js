const mysql = require('mysql2/promise');
require('dotenv').config({ path: '../backend/.env' });

async function inspect() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });

    console.log('--- Table List ---');
    const [tables] = await connection.query('SHOW TABLES');
    const dbName = process.env.DB_NAME;
    const keyName = `Tables_in_${dbName}`;

    for (const tableRow of tables) {
        const tableName = tableRow[keyName];
        console.log(`\n[TABLE: ${tableName}]`);
        const [columns] = await connection.query(`DESCRIBE ${tableName}`);
        columns.forEach(col => {
            console.log(`  - ${col.Field}: ${col.Type} (${col.Null === 'YES' ? 'NULL' : 'NOT NULL'})`);
        });
    }

    console.log('\n--- Trigger List ---');
    const [triggers] = await connection.query('SHOW TRIGGERS');
    triggers.forEach(trig => {
        console.log(`  - ${trig.Trigger} on ${trig.Table} (${trig.Timing} ${trig.Event})`);
    });

    await connection.end();
}

inspect().catch(console.error);
