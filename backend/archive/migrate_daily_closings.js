const path = require('path');
// Explicitly load .env from the current directory (backend/)
require('dotenv').config({ path: path.join(__dirname, '.env') });

const db = require('./config/database');

async function migrate() {
    console.log('Starting migration: Creating daily_closings table...');
    console.log('DB Config Check:', {
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        db: process.env.DB_NAME
    });

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

        await db.query(createTableQuery);
        console.log('Successfully created daily_closings table.');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrate();
