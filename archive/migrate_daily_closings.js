const mysql = require('mysql2/promise');
const dbConfig = require('./backend/config/database').pool.config.connectionConfig;

// config/database might export pool directly or config. Let's check how to import it properly.
// A common pattern in this project seems to be requiring the db module which exports a pool.
// But to be safe and independent, I'll define connection details if I can, or try to require the existing config.

// Let's try to require the existing db config to respect environment settings.
const db = require('./backend/config/database');

async function migrate() {
    console.log('Starting migration: Creating daily_closings table...');
    try {
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS daily_closings (
                closing_date DATE NOT NULL PRIMARY KEY,
                system_cash_balance DECIMAL(15,2) DEFAULT 0 NOT NULL,
                actual_cash_balance DECIMAL(15,2) DEFAULT 0 NOT NULL,
                difference DECIMAL(15,2) DEFAULT 0 NOT NULL,
                closing_note TEXT,
                closed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                closed_by VARCHAR(50)
            );
        `;

        await db.query(createTableQuery); // backend/config/database usually exports a pool with .query
        console.log('Successfully created daily_closings table.');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrate();
