const express = require('express');
const router = express.Router();
const db = require('../config/database');

/**
 * 실사 목록 조회
 */
router.get('/', async (req, res) => {
    try {
        const { warehouse_id, status } = req.query;
        let sql = `
            SELECT 
                a.*,
                w.name as warehouse_name,
                (SELECT COUNT(*) FROM inventory_audit_items WHERE audit_id = a.id) as item_count
            FROM inventory_audits a
            LEFT JOIN warehouses w ON a.warehouse_id = w.id
            WHERE 1=1
        `;
        const params = [];

        if (warehouse_id) {
            sql += ' AND a.warehouse_id = ?';
            params.push(warehouse_id);
        }
        if (status) {
            sql += ' AND a.status = ?';
            params.push(status);
        }
        if (req.query.date) {
            sql += ' AND a.audit_date = ?';
            params.push(req.query.date);
        }

        sql += ' ORDER BY a.audit_date DESC, a.id DESC';

        if (req.query.limit) {
            sql += ' LIMIT ?';
            params.push(parseInt(req.query.limit));
        }

        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('실사 목록 조회 오류:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
});

/**
 * 실사 상세 조회 (항목 포함)
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // 1. 마스터 조회
        const [master] = await db.query(`
            SELECT a.*, w.name as warehouse_name
            FROM inventory_audits a
            LEFT JOIN warehouses w ON a.warehouse_id = w.id
            WHERE a.id = ?
        `, [id]);

        if (master.length === 0) {
            return res.status(404).json({ success: false, message: '실사 세션을 찾을 수 없습니다.' });
        }

        // 2. 상세 항목 조회
        const [items] = await db.query(`
            SELECT 
                ai.*,
                p.product_name,
                p.grade,
                p.weight as product_weight,
                td.sender,
                pi.purchase_date,
                pi.unit_price as unit_cost,
                c.company_name as purchase_store_name
            FROM inventory_audit_items ai
            LEFT JOIN products p ON ai.product_id = p.id
            LEFT JOIN purchase_inventory pi ON ai.inventory_id = pi.id
            LEFT JOIN trade_details td ON pi.trade_detail_id = td.id
            LEFT JOIN trade_masters tm ON td.trade_master_id = tm.id
            LEFT JOIN companies c ON tm.company_id = c.id
            WHERE ai.audit_id = ?
            ORDER BY pi.display_order ASC
        `, [id]);

        res.json({
            success: true,
            data: {
                master: master[0],
                items: items
            }
        });
    } catch (error) {
        console.error('실사 상세 조회 오류:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
});

/**
 * 실사 시작 (새 세션 생성 및 스냅샷)
 */
router.post('/start', async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const { warehouse_id, audit_date, notes } = req.body;

        if (!warehouse_id || !audit_date) {
            throw new Error('창고와 실사 날짜는 필수 항목입니다.');
        }

        // 1. 실약중인 동일 창고 실사 세션 확인
        const [existing] = await connection.query(
            'SELECT id FROM inventory_audits WHERE warehouse_id = ? AND status = "IN_PROGRESS"',
            [warehouse_id]
        );

        if (existing.length > 0) {
            throw new Error('해당 창고에 이미 진행 중인 실사 세션이 있습니다.');
        }

        // 2. 마스터 생성
        const [masterResult] = await connection.query(`
            INSERT INTO inventory_audits (warehouse_id, audit_date, notes, status)
            VALUES (?, ?, ?, 'IN_PROGRESS')
        `, [warehouse_id, audit_date, notes || '']);

        const audit_id = masterResult.insertId;

        // 3. 현재 재고 스냅샷 생성 (해당 창고의 잔량 > 0 인 항목들)
        const [inventoryItems] = await connection.query(`
            SELECT id as inventory_id, product_id, remaining_quantity as system_quantity
            FROM purchase_inventory
            WHERE warehouse_id = ? AND remaining_quantity > 0 AND status = 'AVAILABLE'
        `, [warehouse_id]);

        if (inventoryItems.length > 0) {
            const auditItems = inventoryItems.map(item => [
                audit_id,
                item.inventory_id,
                item.product_id,
                item.system_quantity,
                item.system_quantity // 초기값은 전산재고와 동일하게 설정 (Open 방식)
            ]);

            await connection.query(`
                INSERT INTO inventory_audit_items 
                (audit_id, inventory_id, product_id, system_quantity, actual_quantity)
                VALUES ?
            `, [auditItems]);
        }

        await connection.commit();
        res.status(201).json({ success: true, audit_id });
    } catch (error) {
        await connection.rollback();
        console.error('실사 시작 오류:', error);
        res.status(400).json({ success: false, message: error.message || '실사 시작 실패' });
    } finally {
        connection.release();
    }
});

/**
 * 실사 결과 실시간 저장 (모바일/PC 공용)
 */
router.put('/:id/items', async (req, res) => {
    const { items } = req.body; // Array of { id, actual_quantity, diff_notes }

    if (!Array.isArray(items)) {
        return res.status(400).json({ success: false, message: 'Invalid data format' });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        for (const item of items) {
            const fields = [];
            const values = [];

            if (item.actual_quantity !== undefined) {
                fields.push('actual_quantity = ?');
                values.push(item.actual_quantity);
            }
            if (item.diff_notes !== undefined) {
                fields.push('diff_notes = ?');
                values.push(item.diff_notes);
            }
            if (item.is_checked !== undefined) {
                fields.push('is_checked = ?');
                values.push(item.is_checked);
            }

            if (fields.length > 0) {
                values.push(item.id, req.params.id);
                await connection.query(`
                    UPDATE inventory_audit_items 
                    SET ${fields.join(', ')}
                    WHERE id = ? AND audit_id = ?
                `, values);
            }
        }

        await connection.commit();
        res.json({ success: true });
    } catch (error) {
        await connection.rollback();
        console.error('실사 결과 저장 오류:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    } finally {
        connection.release();
    }
});

/**
 * 실사 확정 (재고 조정 반영)
 */
router.post('/:id/finalize', async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const { id } = req.params;

        // 1. 실사 데이터 조회
        const [audit] = await connection.query('SELECT * FROM inventory_audits WHERE id = ?', [id]);
        if (audit.length === 0 || audit[0].status !== 'IN_PROGRESS') {
            throw new Error('진행 중인 실사 세션을 찾을 수 없습니다.');
        }

        const [items] = await connection.query(`
            SELECT ai.*, pi.warehouse_id
            FROM inventory_audit_items ai
            JOIN purchase_inventory pi ON ai.inventory_id = pi.id
            WHERE ai.audit_id = ?
        `, [id]);

        // 2. 오차 조정 반영
        for (const item of items) {
            const diff = parseFloat(item.actual_quantity) - parseFloat(item.system_quantity);

            if (diff !== 0) {
                // 재고 업데이트
                await connection.query(`
                    UPDATE purchase_inventory 
                    SET remaining_quantity = ?,
                        status = IF(? > 0, 'AVAILABLE', 'DEPLETED')
                    WHERE id = ?
                `, [item.actual_quantity, item.actual_quantity, item.inventory_id]);

                // 실사 조정 이력 기록
                await connection.query(`
                    INSERT INTO inventory_adjustments 
                    (purchase_inventory_id, adjustment_type, quantity_change, reason)
                    VALUES (?, 'CORRECTION', ?, ?)
                `, [item.inventory_id, diff, `재고 실사 조정 (ID: ${id})`]);
            }
        }

        // 3. 상태 변경
        await connection.query('UPDATE inventory_audits SET status = "COMPLETED" WHERE id = ?', [id]);

        await connection.commit();
        res.json({ success: true, message: '실사 확정 및 재고 조정이 완료되었습니다.' });
    } catch (error) {
        await connection.rollback();
        console.error('실사 확정 오류:', error);
        res.status(400).json({ success: false, message: error.message || '실사 확정 실패' });
    } finally {
        connection.release();
    }
});

/**
 * 실사 확정 취소 (재고 원복)
 */
router.post('/:id/revert', async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const { id } = req.params;

        // 1. 실사 데이터 조회
        const [audit] = await connection.query('SELECT * FROM inventory_audits WHERE id = ?', [id]);
        if (audit.length === 0 || audit[0].status !== 'COMPLETED') {
            throw new Error('완료된 실사 세션만 원복할 수 있습니다.');
        }

        const [items] = await connection.query('SELECT * FROM inventory_audit_items WHERE audit_id = ?', [id]);

        // 2. 재고 원복 (조정된 차이만큼 다시 되돌림)
        for (const item of items) {
            const diff = parseFloat(item.actual_quantity) - parseFloat(item.system_quantity);

            if (diff !== 0) {
                // diff만큼 더했으므로, 원복할 때는 diff만큼 뺌
                // remaining_quantity = remaining_quantity - diff
                await connection.query(`
                    UPDATE purchase_inventory 
                    SET remaining_quantity = remaining_quantity - ?,
                        status = IF(remaining_quantity - ? > 0, 'AVAILABLE', 'DEPLETED')
                    WHERE id = ?
                `, [diff, diff, item.inventory_id]);

                // 실사 원복 이력 기록 (역방향 조정)
                await connection.query(`
                    INSERT INTO inventory_adjustments 
                    (purchase_inventory_id, adjustment_type, quantity_change, reason)
                    VALUES (?, 'CORRECTION', ?, ?)
                `, [item.inventory_id, -diff, `재고 실사 원복 (ID: ${id})`]);
            }
        }

        // 3. 상태 변경 (다시 진행 중으로)
        await connection.query('UPDATE inventory_audits SET status = "IN_PROGRESS" WHERE id = ?', [id]);

        await connection.commit();
        res.json({ success: true, message: '실사 확정이 취소되고 재고가 원복되었습니다.' });
    } catch (error) {
        await connection.rollback();
        console.error('실사 원복 오류:', error);
        res.status(400).json({ success: false, message: error.message || '실사 원복 실패' });
    } finally {
        connection.release();
    }
});

/**
 * 실사 취소
 */
router.post('/:id/cancel', async (req, res) => {
    try {
        await db.query('UPDATE inventory_audits SET status = "CANCELLED" WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('실사 취소 오류:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
});

/**
 * 실사 이력 삭제 (취소된 건만 가능)
 */
router.delete('/:id', async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. 상태 확인
        const [audit] = await connection.query('SELECT status FROM inventory_audits WHERE id = ?', [req.params.id]);
        if (audit.length === 0) {
            throw new Error('실사 세션을 찾을 수 없습니다.');
        }
        if (audit[0].status !== 'CANCELLED') {
            throw new Error('취소된 실사만 삭제할 수 있습니다.');
        }

        // 2. 항목 삭제
        await connection.query('DELETE FROM inventory_audit_items WHERE audit_id = ?', [req.params.id]);

        // 3. 마스터 삭제
        await connection.query('DELETE FROM inventory_audits WHERE id = ?', [req.params.id]);

        await connection.commit();
        res.json({ success: true, message: '실사 이력이 삭제되었습니다.' });
    } catch (error) {
        await connection.rollback();
        console.error('실사 삭제 오류:', error);
        res.status(400).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
});

module.exports = router;
