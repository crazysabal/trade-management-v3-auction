const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
};

async function createExpenseTables() {
    let connection;
    try {
        console.log('Connecting to database...');
        connection = await mysql.createConnection(dbConfig);

        // 1. Create expense_categories table
        console.log('Creating expense_categories table...');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS expense_categories (
                id INT PRIMARY KEY AUTO_INCREMENT,
                name VARCHAR(50) NOT NULL,
                is_active TINYINT(1) DEFAULT 1,
                sort_order INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_name (name)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        console.log('expense_categories table created or already exists.');

        // 2. Create expenses table
        console.log('Creating expenses table...');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS expenses (
                id INT PRIMARY KEY AUTO_INCREMENT,
                expense_date DATE NOT NULL,
                category_id INT NOT NULL,
                amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
                description TEXT,
                payment_method VARCHAR(20) DEFAULT 'CASH',
                company_id INT DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (category_id) REFERENCES expense_categories(id),
                FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
                INDEX idx_expense_date (expense_date),
                INDEX idx_category_id (category_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        console.log('expenses table created or already exists.');

        // 3. Insert default categories if empty
        const [rows] = await connection.query('SELECT COUNT(*) as count FROM expense_categories');
        if (rows[0].count === 0) {
            console.log('Inserting default categories...');
            const defaultCategories = [
                ['식대', 1, 10],
                ['교통비', 1, 20],
                ['임대료', 1, 30],
                ['통신비', 1, 40],
                ['소모품비', 1, 50],
                ['기타', 1, 999]
            ];
            await connection.query(
                'INSERT INTO expense_categories (name, is_active, sort_order) VALUES ?',
                [defaultCategories]
            );
            console.log('Default categories inserted.');
        }

    } catch (error) {
        console.error('Error creating tables:', error);
    } finally {
        if (connection) await connection.end();
    }
}

createExpenseTables();
