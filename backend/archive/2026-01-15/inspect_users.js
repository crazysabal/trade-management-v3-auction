const db = require('../config/database');

const inspectUsers = async () => {
    try {
        const [users] = await db.query('SELECT id, username, password_hash, role, created_at FROM users');
        console.log('Current Users in DB:');
        console.table(users);

        const admin = users.find(u => u.username === 'admin');
        if (admin && !admin.password_hash) {
            console.log('WARNING: Admin user exists but has NO password_hash!');
        }
    } catch (error) {
        console.error('Error inspecting users:', error);
    } finally {
        process.exit();
    }
};

inspectUsers();
