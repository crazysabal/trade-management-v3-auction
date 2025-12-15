const express = require('express');
const router = express.Router();
const db = require('../config/database');

// 창고 목록 조회
router.get('/', async (req, res) => {
    try {
        const [rows] = await db.query(`
      SELECT * FROM warehouses 
      ORDER BY display_order ASC, id ASC
    `);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('창고 목록 조회 오류:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
});

// 창고 순서 변경 (Reorder)
router.put('/reorder', async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const { orderedIds } = req.body; // [id1, id2, id3...]

        if (!Array.isArray(orderedIds)) {
            throw new Error('Invalid data format');
        }

        for (let i = 0; i < orderedIds.length; i++) {
            await connection.query(
                'UPDATE warehouses SET display_order = ? WHERE id = ?',
                [i, orderedIds[i]]
            );
        }

        await connection.commit();
        res.json({ success: true });
    } catch (error) {
        await connection.rollback();
        console.error('창고 순서 변경 오류:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    } finally {
        connection.release();
    }
});

// 창고 등록
router.post('/', async (req, res) => {
    try {
        const { name, type, is_default, description, address } = req.body;

        // 기본 창고 설정 시 다른 창고들의 is_default 해제
        if (is_default) {
            await db.query('UPDATE warehouses SET is_default = FALSE');
        }

        const [result] = await db.query(`
      INSERT INTO warehouses (name, type, is_default, description, address)
      VALUES (?, ?, ?, ?, ?)
    `, [name, type || 'STORAGE', is_default || false, description, address]);

        res.json({ success: true, data: { id: result.insertId } });
    } catch (error) {
        console.error('창고 등록 오류:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
});

// 창고 수정
router.put('/:id', async (req, res) => {
    try {
        const { name, type, is_default, is_active, description, address } = req.body;
        const id = req.params.id;

        if (is_default) {
            await db.query('UPDATE warehouses SET is_default = FALSE');
        }

        await db.query(`
      UPDATE warehouses 
      SET name = ?, type = ?, is_default = ?, is_active = ?, description = ?, address = ?
      WHERE id = ?
    `, [name, type, is_default, is_active, description, address, id]);

        res.json({ success: true });
    } catch (error) {
        console.error('창고 수정 오류:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
});

module.exports = router;
