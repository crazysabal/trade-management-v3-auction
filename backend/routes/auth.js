const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const authenticateToken = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Register (Optional for now, mostly for Admin usage)
router.post('/register', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: '아이디와 비밀번호를 입력해주세요.' });
    }

    try {
        const [existingUsers] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
        if (existingUsers.length > 0) {
            return res.status(409).json({ message: '이미 존재하는 아이디입니다.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await db.query('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, hashedPassword]);

        res.status(201).json({ message: '회원가입 성공. 로그인해주세요.' });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ message: '서버 오류가 발생했습니다.' });
    }
});

// Login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    try {
        const [users] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
        if (users.length === 0) {
            return res.status(401).json({ message: '아이디 또는 비밀번호가 잘못되었습니다.' });
        }

        const user = users[0];
        const match = await bcrypt.compare(password, user.password_hash);

        if (!match) {
            return res.status(401).json({ message: '아이디 또는 비밀번호가 잘못되었습니다.' });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' } // 24 hours expiration
        );

        // [HISTORY] Log successful login
        await db.query('INSERT INTO login_history (user_id, action_type, ip_address, user_agent) VALUES (?, ?, ?, ?)',
            [user.id, 'LOGIN', ip, userAgent]);

        // Fetch user permissions
        const [permissions] = await db.query(`
            SELECT p.resource, p.action 
            FROM permissions p
            JOIN role_permissions rp ON p.id = rp.permission_id
            WHERE rp.role_id = ?
        `, [user.role_id]);

        // Construct simplified permissions object { RESOURCE: ['READ', 'CREATE', ...] } or a flat list
        // Let's send a list of objects for flexibility: [{resource: 'TRADE', action: 'READ'}, ...]
        // Or simpler: { TRADE: ['READ', 'CREATE'] }

        const permissionMap = {};
        permissions.forEach(p => {
            if (!permissionMap[p.resource]) permissionMap[p.resource] = [];
            permissionMap[p.resource].push(p.action);
        });

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                role: user.role, // Legacy
                role_id: user.role_id,
                permissions: permissionMap
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: '로그인 처리 중 오류가 발생했습니다.' });
    }
});

// Logout (Log history)
router.post('/logout', authenticateToken, async (req, res) => {
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    try {
        await db.query('INSERT INTO login_history (user_id, action_type, ip_address, user_agent) VALUES (?, ?, ?, ?)',
            [req.user.id, 'LOGOUT', ip, userAgent]);

        res.json({ message: '로그아웃 처리되었습니다.' });
    } catch (error) {
        console.error('Logout log error:', error);
        // 로그아웃 자체는 성공으로 처리
        res.json({ message: '로그아웃 처리되었습니다.' });
    }
});

// Me (User Profile with latest permissions)
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const [users] = await db.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
        if (users.length === 0) return res.status(404).json({ message: 'User not found' });

        const user = users[0];

        // Fetch user permissions
        const [permissions] = await db.query(`
            SELECT p.resource, p.action 
            FROM permissions p
            JOIN role_permissions rp ON p.id = rp.permission_id
            WHERE rp.role_id = ?
        `, [user.role_id]);

        const permissionMap = {};
        permissions.forEach(p => {
            if (!permissionMap[p.resource]) permissionMap[p.resource] = [];
            permissionMap[p.resource].push(p.action);
        });

        res.json({
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                role_id: user.role_id,
                permissions: permissionMap
            }
        });
    } catch (error) {
        console.error('Me error:', error);
        res.status(500).json({ message: '사용자 정보를 가져오는 중 오류가 발생했습니다.' });
    }
});

module.exports = router;
