require('dotenv').config({ path: 'backend/.env' });
const db = require('../config/database');

async function migrate() {
    try {
        console.log('Adding display_order column to purchase_inventory table...');

        // Check if column exists
        const [columns] = await db.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = 'trade_management' 
      AND TABLE_NAME = 'purchase_inventory' 
      AND COLUMN_NAME = 'display_order'
    `);

        if (columns.length > 0) {
            console.log('Column display_order already exists.');
        } else {
            await db.query(`
        ALTER TABLE purchase_inventory 
        ADD COLUMN display_order INT DEFAULT 0 COMMENT '표시 순서'
      `);
            console.log('Column display_order added successfully.');
        }

        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrate();
