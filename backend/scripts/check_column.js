require('dotenv').config({ path: 'backend/.env' });
const db = require('../config/database');

async function checkColumn() {
    try {
        const [columns] = await db.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = 'trade_management' 
      AND TABLE_NAME = 'warehouses' 
      AND COLUMN_NAME = 'display_order'
    `);

        if (columns.length > 0) {
            console.log('Column display_order EXISTS');
        } else {
            console.log('Column display_order MISSING');
        }
        process.exit(0);
    } catch (error) {
        console.error('Check failed:', error);
        process.exit(1);
    }
}

checkColumn();
