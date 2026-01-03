const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
};

async function migrate() {
    const connection = await mysql.createConnection(dbConfig);

    try {
        console.log('Migration started...');

        // 1. Create period_closings table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS period_closings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                start_date DATE NOT NULL,
                end_date DATE NOT NULL,
                
                revenue DECIMAL(15, 2) DEFAULT 0,
                cogs DECIMAL(15, 2) DEFAULT 0,
                gross_profit DECIMAL(15, 2) DEFAULT 0,
                expenses DECIMAL(15, 2) DEFAULT 0,
                net_profit DECIMAL(15, 2) DEFAULT 0,
                
                closed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                note TEXT,
                
                UNIQUE KEY unique_period (start_date, end_date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        console.log('Created period_closings table.');

    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await connection.end();
    }
}

migrate();
