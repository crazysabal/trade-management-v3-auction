require('dotenv').config({ path: './backend/.env' });
const db = require('./config/database');

async function createAuditTables() {
    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();
        console.log('Starting migration: Create audit tables...');

        // 1. inventory_audits 테이블 생성
        console.log('Creating inventory_audits table...');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS inventory_audits (
                id INT AUTO_INCREMENT PRIMARY KEY,
                warehouse_id INT NOT NULL,
                audit_date DATE NOT NULL,
                status ENUM('IN_PROGRESS', 'COMPLETED', 'CANCELLED') DEFAULT 'IN_PROGRESS',
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // 2. inventory_audit_items 테이블 생성
        console.log('Creating inventory_audit_items table...');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS inventory_audit_items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                audit_id INT NOT NULL,
                inventory_id INT NOT NULL,
                product_id INT NOT NULL,
                system_quantity DECIMAL(15, 3) NOT NULL,
                actual_quantity DECIMAL(15, 3) NOT NULL,
                diff_notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (audit_id) REFERENCES inventory_audits(id) ON DELETE CASCADE,
                FOREIGN KEY (inventory_id) REFERENCES purchase_inventory(id),
                FOREIGN KEY (product_id) REFERENCES products(id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

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

createAuditTables();
