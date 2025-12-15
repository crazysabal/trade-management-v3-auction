require('dotenv').config({ path: '../.env' });
const mysql = require('mysql2/promise');

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
};

async function checkColumns() {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.query("SHOW COLUMNS FROM trade_masters");
        // Print clean list
        rows.forEach(r => console.log(`${r.Field}: ${r.Type} (Null: ${r.Null})`));
    } catch (error) {
        console.error(error);
    } finally {
        if (connection) await connection.end();
    }
}

checkColumns();
