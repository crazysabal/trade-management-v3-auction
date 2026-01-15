const db = require('../config/database');
const bcrypt = require('bcrypt');

const resetAdminPassword = async () => {
    try {
        const hashedPassword = await bcrypt.hash('admin1234', 10);

        // Update existing admin or insert if not exists (using ON DUPLICATE KEY UPDATE logic manually or simple UPDATE)

        // 1. Try UPDATE
        const [updateResult] = await db.query(
            'UPDATE users SET password_hash = ? WHERE username = ?',
            [hashedPassword, 'admin']
        );

        if (updateResult.affectedRows > 0) {
            console.log('Admin password updated successfully.');
        } else {
            console.log('Admin user not found. Creating...');
            await db.query(
                'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
                ['admin', hashedPassword, 'admin']
            );
            console.log('Admin user created successfully.');
        }

    } catch (error) {
        console.error('Error resetting admin password:', error);
    } finally {
        process.exit();
    }
};

resetAdminPassword();
