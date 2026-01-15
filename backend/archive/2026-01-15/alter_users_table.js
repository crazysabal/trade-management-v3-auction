const db = require('../config/database');

const alterUsersTable = async () => {
    try {
        // Check if password_hash column exists
        const [columns] = await db.query(`SHOW COLUMNS FROM users LIKE 'password_hash'`);

        if (columns.length === 0) {
            console.log('Column password_hash missing. Adding it...');
            await db.query(`ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NOT NULL AFTER username`);
            console.log('Column password_hash added successfully.');
        } else {
            console.log('Column password_hash already exists.');
        }

        // Also check role column
        const [roleColumns] = await db.query(`SHOW COLUMNS FROM users LIKE 'role'`);
        if (roleColumns.length === 0) {
            console.log('Column role missing. Adding it...');
            await db.query(`ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'user' AFTER password_hash`);
            console.log('Column role added successfully.');
        }

    } catch (error) {
        console.error('Error altering users table:', error);
    } finally {
        process.exit();
    }
};

alterUsersTable();
