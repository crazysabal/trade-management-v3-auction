require('dotenv').config({ path: '../.env' });
const mysql = require('mysql2/promise');

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
};

async function listTables() {
    let connection;
    try {
        console.log(`Connecting to DB: ${dbConfig.database}...`);
        connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.query("SHOW TABLES LIKE '%inventory%'");
        console.table(rows);
    } catch (error) {
        console.error(error);
    } finally {
        if (connection) await connection.end();
    }
}

listTables();
