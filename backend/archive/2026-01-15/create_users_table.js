const db = require('../config/database');

const createUsersTable = async () => {
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            role VARCHAR(20) DEFAULT 'user',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;

    try {
        const [result] = await db.query(createTableQuery);
        console.log('Users table created or already exists:', result);

        // Check if admin exists, if not create default admin
        const [users] = await db.query('SELECT * FROM users WHERE username = ?', ['admin']);
        if (users.length === 0) {
            const bcrypt = require('bcrypt');
            const hashedPassword = await bcrypt.hash('admin1234', 10);
            await db.query('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
                ['admin', hashedPassword, 'admin']);
            console.log('Default admin account created: admin / admin1234');
        } else {
            console.log('Admin account already exists.');
        }

    } catch (error) {
        console.error('Error creating users table:', error);
    } finally {
        process.exit();
    }
};

createUsersTable();
