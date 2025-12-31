const express = require('express');
const router = express.Router();
const db = require('../config/database');

// 창고 목록 조회
router.get('/', async (req, res) => {
    const { active_only } = req.query;
    try {
        let sql = `
            SELECT 
                w.*,
                (
                    SELECT COUNT(*) 
                    FROM purchase_inventory pi 
                    WHERE pi.warehouse_id = w.id 
                    AND pi.remaining_quantity > 0 
                    AND pi.status = 'AVAILABLE'
                ) as stock_count
            FROM warehouses w
        `;

        if (active_only === 'true' || active_only === '1') {
            sql += ' WHERE w.is_active = 1';
        }

        sql += ' ORDER BY w.display_order ASC, w.id ASC';

        const [rows] = await db.query(sql);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('창고 목록 조회 오류:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
});

// 창고 삭제
router.delete('/:id', async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const { id } = req.params;

        // 1. 재고 확인
        const [stockCheck] = await connection.query(`
            SELECT COUNT(*) as count 
            FROM purchase_inventory 
            WHERE warehouse_id = ? 
            AND remaining_quantity > 0 
            AND status = 'AVAILABLE'
        `, [id]);

        if (stockCheck[0].count > 0) {
            throw new Error('재고가 남아있는 창고는 삭제할 수 없습니다.');
        }

        // 2. 사용 이력 확인 (선택적: 이력이 있으면 비활성화를 권장하지만, 삭제를 막을지 여부는 정책 결정)
        // 일단 재고만 없으면 삭제 가능하도록 처리 (FK 제약조건이 있다면 DB 에러 발생함)

        await connection.query('DELETE FROM warehouses WHERE id = ?', [id]);

        await connection.commit();
        res.json({ success: true });
    } catch (error) {
        await connection.rollback();
        console.error('창고 삭제 오류:', error);
        res.status(400).json({ success: false, message: error.message || '삭제 실패' });
    } finally {
        connection.release();
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
