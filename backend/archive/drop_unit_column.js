require('dotenv').config();
const db = require('./config/database');

async function dropUnitColumn() {
    console.log("Dropping 'unit' column from products table...");
    try {
        await db.query('ALTER TABLE products DROP COLUMN unit');
        console.log("Column dropped successfully.");
    } catch (e) {
        if (e.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
            console.log("Column 'unit' does not exist or already dropped.");
        } else {
            console.error(e);
        }
    }
    process.exit();
}

dropUnitColumn();
