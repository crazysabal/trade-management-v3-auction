const express = require('express');
const router = express.Router();
const db = require('../config/database');
const authenticateToken = require('../middleware/auth');

// Helper to check if user is admin (optional, for now relying on basic auth)
// In a full implementation, we'd check for 'ROLE_MANAGEMENT' permission here.

// GET /api/roles - List all roles with their permissions
router.get('/', authenticateToken, async (req, res) => {
    try {
        const [roles] = await db.query('SELECT * FROM roles ORDER BY id');

        // Construct roles with permissions
        const rolesWithPermissions = await Promise.all(roles.map(async role => {
            const [params] = await db.query(`
                SELECT p.id, p.resource, p.action 
                FROM permissions p
                JOIN role_permissions rp ON p.id = rp.permission_id
                WHERE rp.role_id = ?
            `, [role.id]);
            return { ...role, permissions: params };
        }));

        res.json(rolesWithPermissions);
    } catch (error) {
        console.error('Error fetching roles:', error);
        res.status(500).json({ message: 'Error fetching roles' });
    }
});

// GET /api/roles/permissions - List all available system permissions
router.get('/permissions', authenticateToken, async (req, res) => {
    try {
        const [permissions] = await db.query('SELECT * FROM permissions ORDER BY resource, action');
        res.json(permissions);
    } catch (error) {
        console.error('Error fetching permissions:', error);
        res.status(500).json({ message: 'Error fetching permissions' });
    }
});

// POST /api/roles - Create new role
router.post('/', authenticateToken, async (req, res) => {
    const { name, description, permissionIds } = req.body;

    if (!name) {
        return res.status(400).json({ message: 'Role name is required' });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [result] = await connection.query(
            'INSERT INTO roles (name, description) VALUES (?, ?)',
            [name, description]
        );
        const roleId = result.insertId;

        if (permissionIds && permissionIds.length > 0) {
            const values = permissionIds.map(pid => [roleId, pid]);
            await connection.query(
                'INSERT INTO role_permissions (role_id, permission_id) VALUES ?',
                [values]
            );
        }

        await connection.commit();
        res.status(201).json({ message: 'Role created successfully', roleId });
    } catch (error) {
        await connection.rollback();
        console.error('Error creating role:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Role name already exists' });
        }
        res.status(500).json({ message: 'Error creating role' });
    } finally {
        connection.release();
    }
});

// PUT /api/roles/:id - Update role
router.put('/:id', authenticateToken, async (req, res) => {
    const roleId = req.params.id;
    const { name, description, permissionIds } = req.body;

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // Check if system role
        const [roles] = await connection.query('SELECT is_system FROM roles WHERE id = ?', [roleId]);
        if (roles.length === 0) {
            return res.status(404).json({ message: 'Role not found' });
        }

        // Update role details (Name/Desc)
        // Note: We might want to block renaming system roles
        await connection.query(
            'UPDATE roles SET name = ?, description = ? WHERE id = ?',
            [name, description, roleId]
        );

        // Update Permissions: Delete all existing and re-insert
        await connection.query('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);

        if (permissionIds && permissionIds.length > 0) {
            const values = permissionIds.map(pid => [roleId, pid]);
            await connection.query(
                'INSERT INTO role_permissions (role_id, permission_id) VALUES ?',
                [values]
            );
        }

        await connection.commit();
        res.json({ message: 'Role updated successfully' });
    } catch (error) {
        await connection.rollback();
        console.error('Error updating role:', error);
        res.status(500).json({ message: 'Error updating role' });
    } finally {
        connection.release();
    }
});

// DELETE /api/roles/:id - Delete role
router.delete('/:id', authenticateToken, async (req, res) => {
    const roleId = req.params.id;

    try {
        // Check if system role
        const [roles] = await db.query('SELECT is_system FROM roles WHERE id = ?', [roleId]);
        if (roles.length === 0) return res.status(404).json({ message: 'Role not found' });

        if (roles[0].is_system) {
            return res.status(403).json({ message: 'Cannot delete system role' });
        }

        await db.query('DELETE FROM roles WHERE id = ?', [roleId]);
        res.json({ message: 'Role deleted successfully' });
    } catch (error) {
        console.error('Error deleting role:', error);
        res.status(500).json({ message: 'Error deleting role' });
    }
});

module.exports = router;
