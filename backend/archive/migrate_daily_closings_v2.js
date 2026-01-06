const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const db = require('./config/database');

async function migrate() {
    console.log('Starting migration V2: Adding inventory/profit columns to daily_closings...');

    // MariaDB/MySQL compatible approach: Try Adding one by one and ignore Duplicate Error
    const columns = [
        'prev_inventory_value DECIMAL(15,2) DEFAULT 0',
        'today_purchase_cost DECIMAL(15,2) DEFAULT 0',
        'today_inventory_value DECIMAL(15,2) DEFAULT 0',
        'calculated_cogs DECIMAL(15,2) DEFAULT 0',
        'today_sales_revenue DECIMAL(15,2) DEFAULT 0',
        'gross_profit DECIMAL(15,2) DEFAULT 0'
    ];

    try {
        for (const colDef of columns) {
            try {
                await db.query(`ALTER TABLE daily_closings ADD COLUMN ${colDef}`);
                console.log(`Added: ${colDef.split(' ')[0]}`);
            } catch (err) {
                // ER_DUP_FIELDNAME (MySQL) or similar
                if (err.code === 'ER_DUP_FIELDNAME' || err.errno === 1060) {
                    console.log(`Skipped (Exists): ${colDef.split(' ')[0]}`);
                } else {
                    throw err;
                }
            }
        }

        console.log('Successfully updated daily_closings table schema.');
        process.exit(0);

    } catch (error) {
        console.error('Migration V2 failed:', error);
        process.exit(1);
    }
}

migrate();
