require('dotenv').config({ path: '../.env' });
const mysql = require('mysql2/promise');

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
};

async function createTable() {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        console.log('Connecting to database...');

        const sql = `
            CREATE TABLE IF NOT EXISTS inventory_adjustments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                purchase_inventory_id INT NOT NULL,
                adjustment_type ENUM('DISPOSAL', 'LOSS', 'CORRECTION') NOT NULL,
                quantity_change DECIMAL(10,2) NOT NULL,
                reason VARCHAR(255),
                adjusted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (purchase_inventory_id) REFERENCES purchase_inventory(id)
            )
        `;

        await connection.query(sql);
        console.log('Created table: inventory_adjustments');

    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        if (connection) await connection.end();
    }
}

createTable();
