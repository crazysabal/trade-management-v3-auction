const express = require('express');
const router = express.Router();
const db = require('../config/database');

// 결제 방법 목록 조회
router.get('/payment-methods', async (req, res) => {
    try {
        const { is_active } = req.query;
        let query = 'SELECT * FROM payment_methods';
        const params = [];

        if (is_active !== undefined) {
            query += ' WHERE is_active = ?';
            // 문자열 'true'/'false'를 boolean/integer로 변환
            params.push(is_active === 'true' || is_active === '1' ? 1 : 0);
        }

        query += ' ORDER BY sort_order ASC, id ASC';

        const [rows] = await db.query(query, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('결제 방법 조회 오류:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
});

// 결제 방법 추가
router.post('/payment-methods', async (req, res) => {
    try {
        const { code, name, sort_order } = req.body;

        if (!code || !name) {
            return res.status(400).json({ success: false, message: '코드와 이름은 필수입니다.' });
        }

        // 코드 중복 체크
        const [existing] = await db.query('SELECT id FROM payment_methods WHERE code = ?', [code]);
        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: '이미 존재하는 결제 방법 코드입니다.' });
        }

        // 순서가 없으면 가장 마지막 + 10으로 설정
        let order = sort_order;
        if (order === undefined || order === null) {
            const [maxOrder] = await db.query('SELECT MAX(sort_order) as max_order FROM payment_methods');
            order = (maxOrder[0].max_order || 0) + 10;
        }

        const [result] = await db.query(
            'INSERT INTO payment_methods (code, name, sort_order) VALUES (?, ?, ?)',
            [code, name, order]
        );

        res.status(201).json({
            success: true,
            message: '결제 방법이 추가되었습니다.',
            data: { id: result.insertId, code, name, sort_order: order, is_active: 1 }
        });
    } catch (error) {
        console.error('결제 방법 추가 오류:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
});

// 결제 방법 순서 재정렬 (일괄 업데이트)
router.put('/payment-methods/reorder', async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const { items } = req.body; // [{ id: 1, sort_order: 10 }, { id: 2, sort_order: 20 }]

        if (!items || !Array.isArray(items)) {
            return res.status(400).json({ success: false, message: '잘못된 요청 형식입니다.' });
        }

        for (const item of items) {
            await connection.query(
                'UPDATE payment_methods SET sort_order = ? WHERE id = ?',
                [item.sort_order, item.id]
            );
        }

        await connection.commit();
        res.json({ success: true, message: '순서가 저장되었습니다.' });
    } catch (error) {
        await connection.rollback();
        console.error('순서 변경 오류:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    } finally {
        connection.release();
    }
});

// 결제 방법 수정
router.put('/payment-methods/:id', async (req, res) => {
    try {
        const { name, is_active, sort_order } = req.body;
        const { id } = req.params;

        // 업데이트할 필드 동적 구성
        const updates = [];
        const params = [];

        if (name !== undefined) {
            updates.push('name = ?');
            params.push(name);
        }
        if (is_active !== undefined) {
            updates.push('is_active = ?');
            params.push(is_active ? 1 : 0);
        }
        if (sort_order !== undefined) {
            updates.push('sort_order = ?');
            params.push(sort_order);
        }

        if (updates.length === 0) {
            return res.status(400).json({ success: false, message: '변경할 내용이 없습니다.' });
        }

        params.push(id);
        const query = `UPDATE payment_methods SET ${updates.join(', ')} WHERE id = ?`;

        await db.query(query, params);

        res.json({ success: true, message: '결제 방법이 수정되었습니다.' });
    } catch (error) {
        console.error('결제 방법 수정 오류:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
});

module.exports = router;
