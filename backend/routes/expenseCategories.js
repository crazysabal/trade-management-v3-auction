const express = require('express');
const router = express.Router();
const db = require('../config/database');

// 전체 지출 항목 조회
router.get('/', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM expense_categories ORDER BY sort_order ASC, id ASC');
        res.json(rows);
    } catch (error) {
        console.error('Error fetching expense categories:', error);
        res.status(500).json({ message: '지출 항목 목록을 불러오는 중 오류가 발생했습니다.' });
    }
});

// 활성화된 지출 항목만 조회 (드롭다운용)
router.get('/active', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM expense_categories WHERE is_active = 1 ORDER BY sort_order ASC, id ASC');
        res.json(rows);
    } catch (error) {
        console.error('Error fetching active expense categories:', error);
        res.status(500).json({ message: '활성 지출 항목 목록을 불러오는 중 오류가 발생했습니다.' });
    }
});

// 순서 변경 (일괄 처리)
router.put('/reorder', async (req, res) => {
    console.log('Reorder Request Body:', req.body); // 디버깅용 로그
    const { items } = req.body;

    if (!items) {
        return res.status(400).json({ message: '데이터 오류: items 필드가 없습니다.', body: req.body });
    }
    if (!Array.isArray(items)) {
        return res.status(400).json({ message: '데이터 오류: items가 배열이 아닙니다.' });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        for (const item of items) {
            await connection.query(
                'UPDATE expense_categories SET sort_order = ? WHERE id = ?',
                [item.sort_order, item.id]
            );
        }

        await connection.commit();
        res.json({ message: '순서가 저장되었습니다.' });
    } catch (error) {
        await connection.rollback();
        console.error('Error reordering categories:', error);
        res.status(500).json({ message: '순서 저장 중 오류가 발생했습니다.' });
    } finally {
        connection.release();
    }
});

// 지출 항목 등록
router.post('/', async (req, res) => {
    const { name, sort_order, is_active } = req.body;

    if (!name) {
        return res.status(400).json({ message: '항목명은 필수입니다.' });
    }

    try {
        const [result] = await db.query(
            'INSERT INTO expense_categories (name, sort_order, is_active) VALUES (?, ?, ?)',
            [name, sort_order || 0, is_active !== undefined ? is_active : 1]
        );
        res.json({ id: result.insertId, message: '지출 항목이 등록되었습니다.' });
    } catch (error) {
        console.error('Error creating expense category:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: '이미 존재하는 항목명입니다.' });
        }
        res.status(500).json({ message: '지출 항목 등록 중 오류가 발생했습니다.' });
    }
});

// 지출 항목 수정
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { name, sort_order, is_active } = req.body;

    if (!name) {
        return res.status(400).json({ message: '항목명은 필수입니다.' });
    }

    try {
        await db.query(
            'UPDATE expense_categories SET name = ?, sort_order = ?, is_active = ? WHERE id = ?',
            [name, sort_order || 0, is_active !== undefined ? is_active : 1, id]
        );
        res.json({ message: '지출 항목이 수정되었습니다.' });
    } catch (error) {
        console.error('Error updating expense category:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: '이미 존재하는 항목명입니다.' });
        }
        res.status(500).json({ message: '지출 항목 수정 중 오류가 발생했습니다.' });
    }
});

// 지출 항목 삭제
router.delete('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        // 사용 중인 항목인지 확인
        const [usageCheck] = await db.query('SELECT COUNT(*) as count FROM expenses WHERE category_id = ?', [id]);

        if (usageCheck[0].count > 0) {
            return res.status(400).json({
                message: '이미 이 항목으로 등록된 지출 내역이 있어 삭제할 수 없습니다. 대신 "미사용" 처리해주세요.',
                hasUsage: true
            });
        }

        await db.query('DELETE FROM expense_categories WHERE id = ?', [id]);
        res.json({ message: '지출 항목이 삭제되었습니다.' });
    } catch (error) {
        console.error('Error deleting expense category:', error);
        res.status(500).json({ message: '지출 항목 삭제 중 오류가 발생했습니다.' });
    }
});

module.exports = router;
