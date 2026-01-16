require('dotenv').config({ path: './backend/.env' });
const db = require('../config/database');

async function addIsCheckedColumn() {
    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();
        console.log('Starting migration: Add is_checked column to inventory_audit_items...');

        // Check if column exists
        const [columns] = await connection.query(`
            SHOW COLUMNS FROM inventory_audit_items LIKE 'is_checked'
        `);

        if (columns.length === 0) {
            await connection.query(`
                ALTER TABLE inventory_audit_items
                ADD COLUMN is_checked BOOLEAN DEFAULT FALSE AFTER diff_notes
            `);
            console.log('Added is_checked column.');
        } else {
            console.log('is_checked column already exists.');
        }

        await connection.commit();
        console.log('Migration completed successfully.');

    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Migration failed:', error);
        process.exit(1);
    } finally {
        if (connection) connection.release();
        process.exit(0);
    }
}

addIsCheckedColumn();
