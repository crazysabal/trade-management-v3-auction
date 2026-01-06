require('dotenv').config();
const db = require('./config/database');

async function cleanupLegacy() {
    try {
        console.log('Cleaning up legacy tables...');

        await db.query('SET FOREIGN_KEY_CHECKS = 0');
        await db.query('TRUNCATE TABLE inventory_transactions');
        await db.query('TRUNCATE TABLE warehouse_transfers');
        await db.query('TRUNCATE TABLE inventory');
        await db.query('SET FOREIGN_KEY_CHECKS = 1');

        console.log('Legacy tables truncated.');
        process.exit(0);
    } catch (error) {
        console.error('Cleanup failed:', error);
        process.exit(1);
    }
}

cleanupLegacy();
