const express = require('express');
const router = express.Router();
const db = require('../config/database');
const authenticateToken = require('../middleware/auth');

// GET /api/user-settings/menu - Get current user's menu config
router.get('/menu', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const [rows] = await db.query(
            'SELECT menu_config FROM user_menu_settings WHERE user_id = ?',
            [userId]
        );

        if (rows.length === 0) {
            return res.json({ menuConfig: null }); // Client should use default
        }

        res.json({ menuConfig: rows[0].menu_config });
    } catch (error) {
        console.error('Error fetching menu config:', error);
        res.status(500).json({ message: '메뉴 설정을 불러오는 중 오류가 발생했습니다.' });
    }
});

// PUT /api/user-settings/menu - Update menu config
router.put('/menu', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { menuConfig } = req.body;

        if (!menuConfig || !Array.isArray(menuConfig)) {
            return res.status(400).json({ message: '올바르지 않은 메뉴 설정 형식입니다.' });
        }

        // Validate structure (optional but recommended)
        // Ensure essential keys exist
        const isValid = menuConfig.every(group =>
            group.id &&
            Array.isArray(group.items)
        );

        if (!isValid) {
            return res.status(400).json({ message: '메뉴 설정 데이터 구조가 손상되었습니다.' });
        }

        const query = `
            INSERT INTO user_menu_settings (user_id, menu_config)
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE menu_config = VALUES(menu_config)
        `;

        await db.query(query, [userId, JSON.stringify(menuConfig)]);

        res.json({ success: true, message: '메뉴 설정이 저장되었습니다.' });
    } catch (error) {
        console.error('Error saving menu config:', error);
        res.status(500).json({ message: '메뉴 설정 저장 중 오류가 발생했습니다.' });
    }
});

module.exports = router;
