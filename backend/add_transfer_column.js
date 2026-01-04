const db = require('./config/database');

async function addColumn() {
    try {
        await db.query("ALTER TABLE warehouse_transfers ADD COLUMN new_inventory_id INT NULL DEFAULT NULL AFTER purchase_inventory_id");
        console.log("Column added successfully");
    } catch (error) {
        if (error.code === 'ER_DUP_FIELDNAME') {
            console.log("Column already exists");
        } else {
            console.error(error);
        }
    } finally {
        process.exit();
    }
}

addColumn();
