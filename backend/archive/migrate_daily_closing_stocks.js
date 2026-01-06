require('dotenv').config({ path: 'backend/.env' });
const db = require('./config/database');

async function migrate() {
    const connection = await db.getConnection();
    try {
        console.log('Starting migration for daily_closing_stocks...');

        await connection.query(`
            CREATE TABLE IF NOT EXISTS daily_closing_stocks (
                id INT AUTO_INCREMENT PRIMARY KEY,
                closing_date DATE NOT NULL,
                purchase_inventory_id INT NOT NULL,
                system_quantity DECIMAL(10, 2) NOT NULL DEFAULT 0,
                actual_quantity DECIMAL(10, 2) NOT NULL DEFAULT 0,
                adjustment_quantity DECIMAL(10, 2) NOT NULL DEFAULT 0,
                unit_price DECIMAL(15, 2) NOT NULL DEFAULT 0,
                total_value DECIMAL(15, 2) NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                
                FOREIGN KEY (closing_date) REFERENCES daily_closings(closing_date) ON DELETE CASCADE,
                FOREIGN KEY (purchase_inventory_id) REFERENCES purchase_inventory(id) ON DELETE CASCADE,
                INDEX idx_closing_date (closing_date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        console.log('daily_closing_stocks table created successfully.');

    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        connection.release();
        process.exit();
    }
}

migrate();
