const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../config/database');
const authenticateToken = require('../middleware/auth');

// 모든 요청에 인증 필요
router.use(authenticateToken);

// 1. 사용자 목록 조회
router.get('/', async (req, res) => {
    try {
        // [RBAC] Join with roles table to get role name. 
        // We use 'r.name as role' to keep frontend compatibility for now
        const [users] = await db.query(`
            SELECT u.id, u.username, u.is_active, u.created_at, u.role_id,
                   coalesce(r.name, u.role) as role 
            FROM users u
            LEFT JOIN roles r ON u.role_id = r.id
            ORDER BY CASE WHEN u.username = 'admin' THEN 0 ELSE 1 END, u.created_at DESC
        `);
        res.json(users);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching users' });
    }
});

// [HISTORY] 1.5. 로그인 이력 조회
router.get('/history', async (req, res) => {
    try {
        // user_id join to get username
        const query = `
            SELECT h.*, u.username, u.role 
            FROM login_history h 
            JOIN users u ON h.user_id = u.id 
            ORDER BY h.created_at DESC 
            LIMIT 100
        `;
        const [history] = await db.query(query);
        res.json(history);
    } catch (error) {
        console.error('Login history error:', error);
        res.status(500).json({ message: '이력을 불러오는 중 오류가 발생했습니다.' });
    }
});

// 2. 사용자 추가
router.post('/', async (req, res) => {
    const { username, password, role_id, is_active } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: '아이디와 비밀번호를 입력해주세요.' });
    }

    try {
        const [existingUsers] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
        if (existingUsers.length > 0) {
            return res.status(409).json({ message: '이미 존재하는 아이디입니다.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await db.query(
            'INSERT INTO users (username, password_hash, role_id, is_active) VALUES (?, ?, ?, ?)',
            [username, hashedPassword, role_id || null, is_active === undefined ? 1 : is_active]
        );

        res.status(201).json({ message: '사용자가 추가되었습니다.' });
    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({ message: '사용자 추가 중 오류가 발생했습니다.' });
    }
});

// Update User (including role/status)
router.put('/:id', async (req, res) => {
    const { role_id, is_active, password } = req.body;
    const userId = req.params.id;

    // console.log(`[DEBUG] Update User ID: ${userId}, PW exists: ${!!password}`);

    try {
        // [SAFETY] Check if target is 'admin'
        const [[targetUser]] = await db.query('SELECT username FROM users WHERE id = ?', [userId]);
        if (!targetUser) {
            // console.log(`[DEBUG] User not found: ${userId}`);
            return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
        }

        const isAdminAccount = targetUser.username === 'admin';
        // console.log(`[DEBUG] Target User: ${targetUser.username}, Is Admin Account: ${isAdminAccount}`);

        let query = 'UPDATE users SET ';
        let params = [];
        let sets = [];

        // admin 계정은 role_id와 is_active 수정을 원천 차단
        if (!isAdminAccount) {
            sets.push('role_id = ?', 'is_active = ?');
            params.push(role_id, is_active);
        }

        if (password) {
            // console.log(`[DEBUG] Hashing new password for ${targetUser.username}`);
            const hashedPassword = await bcrypt.hash(password, 10);
            sets.push('password_hash = ?');
            params.push(hashedPassword);
        }

        if (sets.length === 0) {
            // console.log(`[DEBUG] No changes to apply for ${targetUser.username}`);
            return res.json({ message: '변경할 정보가 없거나 보호된 계정입니다.' });
        }

        query += sets.join(', ') + ' WHERE id = ?';
        params.push(userId);

        // console.log(`[DEBUG] Executing Query: ${query}`);
        const [result] = await db.query(query, params);
        // console.log(`[DEBUG] Update Result: ${result.affectedRows} row(s) updated`);

        res.json({ message: '사용자 정보가 업데이트되었습니다.', affected: result.affectedRows });
    } catch (err) {
        console.error('Update user error:', err);
        res.status(500).json({ message: '사용자 정보 수정 중 오류가 발생했습니다.' });
    }
});

// 3. 사용자 삭제 (Guarded Deletion)
router.delete('/:id', async (req, res) => {
    const userId = req.params.id;

    try {
        // [SAFETY] admin 계정 삭제 시도 원천 차단
        const [[targetUser]] = await db.query('SELECT username FROM users WHERE id = ?', [userId]);
        if (targetUser && targetUser.username === 'admin') {
            return res.status(403).json({ message: '최고 관리자(admin) 계정은 삭제할 수 없습니다.' });
        }

        // 본인 삭제 방지
        if (req.user.id == userId) {
            return res.status(400).json({ message: '자기 자신은 삭제할 수 없습니다.' });
        }

        // [SECURITY] 관리자만 삭제 가능
        if (!req.user.role || req.user.role.toLowerCase() !== 'admin') {
            return res.status(403).json({ message: '사용자 삭제 권한이 없습니다. (관리자 전용)' });
        }

        const [result] = await db.query('DELETE FROM users WHERE id = ?', [userId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
        }

        res.json({ message: '사용자가 삭제되었습니다.' });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ message: '사용자 삭제 중 오류가 발생했습니다.' });
    }
});

// 4. 비밀번호 초기화 (Reset Password)
router.put('/:id/password', async (req, res) => {
    const userId = req.params.id;
    const { newPassword } = req.body;

    // [SECURITY] 타인의 비밀번호 변경 제한
    // 1. 관리자는 모든 사용자의 비밀번호 변경 가능
    // 2. 일반 사용자는 자신의 비밀번호만 변경 가능
    const isSelf = (req.user.id == userId);
    const isAdmin = (req.user.role && req.user.role.toLowerCase() === 'admin');

    if (!isSelf && !isAdmin) {
        return res.status(403).json({ message: '비밀번호 변경 권한이 없습니다. (본인 또는 관리자만 가능)' });
    }

    if (!newPassword) {
        return res.status(400).json({ message: '새로운 비밀번호를 입력해주세요.' });
    }

    try {
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        const [result] = await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [hashedPassword, userId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
        }

        res.json({ message: '비밀번호가 변경되었습니다.' });
    } catch (error) {
        console.error('Password reset error:', error);
        res.status(500).json({ message: '비밀번호 변경 중 오류가 발생했습니다.' });
    }
});

module.exports = router;
