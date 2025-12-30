const mysql = require('mysql2/promise');
require('dotenv').config({ path: './.env' });

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
};

async function migrate() {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        console.log('🔌 Connected to database.');

        // Check if column exists
        const [columns] = await connection.query(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'warehouse_transfers' AND COLUMN_NAME = 'purchase_inventory_id'
        `, [dbConfig.database]);

        if (columns.length > 0) {
            console.log('✅ Column purchase_inventory_id already exists.');
        } else {
            console.log('🛠 Adding purchase_inventory_id to warehouse_transfers...');
            await connection.query(`
                ALTER TABLE warehouse_transfers
                ADD COLUMN purchase_inventory_id INT COMMENT 'Source Lot ID' AFTER id,
                ADD INDEX idx_purchase_inventory_id (purchase_inventory_id),
                ADD CONSTRAINT fk_wt_purchase_inventory FOREIGN KEY (purchase_inventory_id) REFERENCES purchase_inventory(id) ON DELETE SET NULL
            `);
            console.log('✅ Column added successfully.');
        }

    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        if (connection) await connection.end();
    }
}

migrate();
