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
        const [users] = await db.query('SELECT id, username, role, created_at FROM users ORDER BY created_at DESC');
        res.json(users);
    } catch (error) {
        console.error('User list error:', error);
        res.status(500).json({ message: '사용자 목록을 불러오는 중 오류가 발생했습니다.' });
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

// 2. 사용자 추가 (Register 로직 재사용)
router.post('/', async (req, res) => {
    const { username, password, role } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: '아이디와 비밀번호를 입력해주세요.' });
    }

    try {
        const [existingUsers] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
        if (existingUsers.length > 0) {
            return res.status(409).json({ message: '이미 존재하는 아이디입니다.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // [SECURITY] 일반 직원은 'admin' 계정을 생성할 수 없음
        let userRole = role || 'user';
        if (userRole.toLowerCase() === 'admin') {
            if (!req.user.role || req.user.role.toLowerCase() !== 'admin') {
                return res.status(403).json({ message: '관리자 권한을 부여할 수 없습니다. (관리자 전용)' });
            }
        }
        await db.query('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
            [username, hashedPassword, userRole]);

        res.status(201).json({ message: '사용자가 추가되었습니다.' });
    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({ message: '사용자 추가 중 오류가 발생했습니다.' });
    }
});

// 3. 사용자 삭제 (Guarded Deletion)
router.delete('/:id', async (req, res) => {
    const userId = req.params.id;

    // 본인 삭제 방지 (선택 사항)
    if (req.user.id == userId) {
        return res.status(400).json({ message: '자기 자신은 삭제할 수 없습니다.' });
    }

    // [SECURITY] 일반 직원은 삭제 권한 없음 (관리자만 가능)
    // role check is case-insensitive for safety
    if (!req.user.role || req.user.role.toLowerCase() !== 'admin') {
        return res.status(403).json({ message: '사용자 삭제 권한이 없습니다. (관리자 전용)' });
    }

    try {
        // TODO: 전표 등 연관 데이터 확인 로직 추가 가능 (현재는 삭제만 수행)
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
