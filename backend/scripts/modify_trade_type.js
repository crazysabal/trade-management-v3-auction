const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const db = require('../config/database');

async function migrate() {
    const connection = await db.getConnection();
    try {
        console.log('Modifying trade_masters.trade_type...');
        await connection.query("ALTER TABLE trade_masters MODIFY COLUMN trade_type ENUM('PURCHASE', 'SALE', 'PRODUCTION') NOT NULL");
        console.log('Successfully updated trade_type enum.');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    } finally {
        connection.release();
    }
}
migrate();
