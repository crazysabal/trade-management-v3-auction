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

        // 1. 상세 사용 이력 확인 (단순 현재 재고뿐만 아니라 과거 모든 기록 확인)
        const [usageCheck] = await connection.query(`
            SELECT 
                (SELECT COUNT(*) FROM purchase_inventory WHERE warehouse_id = ?) as inventory_history,
                (SELECT COUNT(*) FROM trade_masters WHERE warehouse_id = ?) as trade_history,
                (SELECT COUNT(*) FROM warehouse_transfers WHERE from_warehouse_id = ? OR to_warehouse_id = ?) as transfer_history,
                (SELECT COUNT(*) FROM inventory_audits WHERE warehouse_id = ?) as audit_history
        `, [id, id, id, id, id]);

        const usage = usageCheck[0];
        const totalUsage = Object.values(usage).reduce((a, b) => a + b, 0);

        if (totalUsage > 0) {
            let detail = [];
            if (usage.inventory_history > 0) detail.push('재고 기록');
            if (usage.trade_history > 0) detail.push('거래 전표');
            if (usage.transfer_history > 0) detail.push('이동 이력');
            if (usage.audit_history > 0) detail.push('실사 기록');

            throw new Error(`이 창고는 이미 사용된 이력(${detail.join(', ')})이 있어 삭제할 수 없습니다. 대신 '미사용' 상태로 변경하여 관리해 주세요.`);
        }

        await connection.query('DELETE FROM warehouses WHERE id = ?', [id]);

        await connection.commit();
        res.json({ success: true });
    } catch (error) {
        await connection.rollback();

        // 비즈니스 로직에 따른 의도된 에러(400)인 경우 스택 트레이스 없이 로그 출력
        if (error.status === 400 || error.message.includes('삭제할 수 없습니다')) {
            console.warn(`창고 삭제 제한: ${error.message}`);
            return res.status(400).json({ success: false, message: error.message });
        }

        console.error('창고 삭제 서버 오류:', error);
        res.status(500).json({ success: false, message: '서er 오류가 발생했습니다.' });
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
