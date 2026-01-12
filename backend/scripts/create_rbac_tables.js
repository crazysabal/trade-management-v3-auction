require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/database');

const createRBACTables = async () => {
    // 1. Roles Table
    const createRolesTable = `
        CREATE TABLE IF NOT EXISTS roles (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(50) NOT NULL UNIQUE,
            description VARCHAR(255),
            is_system BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;

    // 2. Permissions Table
    const createPermissionsTable = `
        CREATE TABLE IF NOT EXISTS permissions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            resource VARCHAR(50) NOT NULL,
            action VARCHAR(20) NOT NULL,
            description VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_permission (resource, action)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;

    // 3. Role-Permissions Mapping Table
    const createRolePermissionsTable = `
        CREATE TABLE IF NOT EXISTS role_permissions (
            role_id INT NOT NULL,
            permission_id INT NOT NULL,
            PRIMARY KEY (role_id, permission_id),
            FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
            FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;

    // 4. Alter Users Table to add role_id
    // Note: We'll keep the old 'role' column for now for backward compatibility
    const alterUsersTable = `
        SELECT count(*)
        FROM information_schema.COLUMNS
        WHERE (TABLE_SCHEMA = DATABASE())
        AND (TABLE_NAME = 'users')
        AND (COLUMN_NAME = 'role_id');
    `;

    try {
        console.log('Creating RBAC tables...');
        await db.query(createRolesTable);
        await db.query(createPermissionsTable);
        await db.query(createRolePermissionsTable);
        console.log('Tables created successfully.');

        // Alter users table check
        const [columns] = await db.query(alterUsersTable);
        // information_schema query returns count in a specific way depending on driver, 
        // strictly speaking simply running the ALTER IGNORE or checking specifically is better.
        // Simplified check:
        try {
            await db.query(`ALTER TABLE users ADD COLUMN role_id INT DEFAULT NULL`);
            await db.query(`ALTER TABLE users ADD CONSTRAINT fk_user_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE SET NULL`);
            console.log('Users table altered successfully.');
        } catch (err) {
            if (err.code === 'ER_DUP_FIELDNAME') {
                console.log('role_id column already exists in users table.');
            } else {
                throw err;
            }
        }

        // --- Data Initialization ---

        // 1. Create System Admin Role
        console.log('Initializing System Roles...');
        await db.query(`
            INSERT IGNORE INTO roles (name, description, is_system) 
            VALUES ('Administrator', 'System Administrator with full access', TRUE)
        `);

        // Get Admin Role ID
        const [adminRows] = await db.query("SELECT id FROM roles WHERE name = 'Administrator'");
        const adminRoleId = adminRows[0].id;

        // 2. Define Resources (Apps/Menus)
        const resources = [
            'DASHBOARD',
            'PURCHASE', 'SALE', 'TRADE_LIST', 'MATCHING',
            'COMPANY_LIST', 'COMPANY_BALANCES', 'COMPANY_INFO',
            'PRODUCT_LIST',
            'INVENTORY_LIST', 'INVENTORY_QUICK', 'INVENTORY_TRANSFER', 'INVENTORY_PRODUCTION', 'INVENTORY_PRODUCTION_HISTORY', 'INVENTORY_HISTORY', 'INVENTORY_AUDIT',
            'EXPENSES', 'EXPENSE_CATEGORIES',
            'SETTLEMENT', 'SETTLEMENT_HISTORY',
            'STATISTICS',
            'WAREHOUSES',
            'AUCTION_IMPORT', 'AUCTION_ACCOUNTS',
            'USER_MANAGEMENT', 'ROLE_MANAGEMENT', // New
            'SETTINGS', 'DASHBOARD', 'MESSAGE_TEST'
        ];

        const actions = ['READ', 'CREATE', 'UPDATE', 'DELETE'];

        console.log('Initializing Permissions...');
        for (const resource of resources) {
            for (const action of actions) {
                // Insert Permission
                await db.query(`
                    INSERT IGNORE INTO permissions (resource, action, description)
                    VALUES (?, ?, ?)
                `, [resource, action, `${action} access for ${resource}`]);
            }
        }

        // 3. Assign All Permissions to Administrator
        console.log('Assigning all permissions to Administrator...');
        const [allPermissions] = await db.query('SELECT id FROM permissions');

        const values = allPermissions.map(p => [adminRoleId, p.id]);
        if (values.length > 0) {
            await db.query(`
                INSERT IGNORE INTO role_permissions (role_id, permission_id)
                VALUES ?
            `, [values]);
        }

        // 4. Update existing 'admin' user to have Administrator role
        console.log('Linking existing admin user to Administrator role...');
        // Assuming username 'admin' exists
        await db.query(`UPDATE users SET role_id = ? WHERE username = 'admin'`, [adminRoleId]);

        console.log('RBAC Initialization Complete!');

    } catch (error) {
        console.error('Error initializing RBAC:', error);
    } finally {
        process.exit();
    }
};

createRBACTables();
