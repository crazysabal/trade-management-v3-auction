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
                pi.remaining_quantity as current_quantity,
                pi.warehouse_id,
                w.name as warehouse_name,
                c.company_name as purchase_store_name
            FROM inventory_audit_items ai
            LEFT JOIN products p ON ai.product_id = p.id
            LEFT JOIN purchase_inventory pi ON ai.inventory_id = pi.id
            LEFT JOIN warehouses w ON pi.warehouse_id = w.id
            LEFT JOIN trade_details td ON pi.trade_detail_id = td.id
            LEFT JOIN trade_masters tm ON td.trade_master_id = tm.id
            LEFT JOIN companies c ON tm.company_id = c.id
            WHERE ai.audit_id = ?

            ORDER BY w.display_order ASC, pi.warehouse_id ASC, pi.display_order ASC
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

        const isAllWarehouses = warehouse_id === 'ALL';

        // 1. 진행중인 동일 창고 실사 세션 확인
        if (!isAllWarehouses) {
            const [existing] = await connection.query(
                'SELECT id FROM inventory_audits WHERE warehouse_id = ? AND status = "IN_PROGRESS"',
                [warehouse_id]
            );

            if (existing.length > 0) {
                throw new Error('해당 창고에 이미 진행 중인 실사 세션이 있습니다.');
            }
        } else {
            // 전체 창고 모드: 아무 창고에서나 진행 중인 실사가 있으면 차단
            const [existingAny] = await connection.query(
                'SELECT id, warehouse_id FROM inventory_audits WHERE status = "IN_PROGRESS"'
            );
            if (existingAny.length > 0) {
                throw new Error('진행 중인 실사 세션이 있습니다. 기존 실사를 완료하거나 취소 후 다시 시도하세요.');
            }
        }

        // 2. 마스터 생성 (전체 창고일 경우 warehouse_id는 NULL)
        const [masterResult] = await connection.query(`
            INSERT INTO inventory_audits (warehouse_id, audit_date, notes, status)
            VALUES (?, ?, ?, 'IN_PROGRESS')
        `, [isAllWarehouses ? null : warehouse_id, audit_date, notes || '']);

        const audit_id = masterResult.insertId;

        // 3. 현재 재고 스냅샷 생성
        let inventoryQuery = `
            SELECT pi.id as inventory_id, pi.product_id, pi.remaining_quantity as system_quantity, pi.warehouse_id
            FROM purchase_inventory pi
            LEFT JOIN warehouses w ON pi.warehouse_id = w.id
            WHERE pi.remaining_quantity > 0
        `;
        const queryParams = [];

        if (!isAllWarehouses) {
            inventoryQuery += ' AND pi.warehouse_id = ?';
            queryParams.push(warehouse_id);
        }

        // 창고 순서(display_order), 입고 순서(display_order)로 정렬
        inventoryQuery += ' ORDER BY w.display_order ASC, pi.warehouse_id ASC, pi.display_order ASC';

        const [inventoryItems] = await connection.query(inventoryQuery, queryParams);

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
 * 특정 실사 항목의 전산 재고를 현재 재고로 동기화
 */
router.put('/:auditId/items/:itemId/sync', async (req, res) => {
    const { auditId, itemId } = req.params;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. 현재 시스템 재고 조회
        const [current] = await connection.query(`
            SELECT pi.remaining_quantity 
            FROM purchase_inventory pi
            JOIN inventory_audit_items ai ON pi.id = ai.inventory_id
            WHERE ai.id = ? AND ai.audit_id = ?
        `, [itemId, auditId]);

        if (current.length === 0) {
            throw new Error('항목을 찾을 수 없습니다.');
        }

        const currentQty = current[0].remaining_quantity;

        // 2. 실사 항목의 전산 재고 업데이트 (실사 수량도 함께 맞춤)
        await connection.query(`
            UPDATE inventory_audit_items 
            SET system_quantity = ?, actual_quantity = ?
            WHERE id = ? AND audit_id = ?
        `, [currentQty, currentQty, itemId, auditId]);

        await connection.commit();
        res.json({ success: true, current_quantity: currentQty });
    } catch (error) {
        await connection.rollback();
        console.error('재고 동기화 오류:', error);
        res.status(500).json({ success: false, message: error.message || '서버 오류가 발생했습니다.' });
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

                // [V1.0.33 ADD] 집계 재고 업데이트
                const [prod] = await connection.query('SELECT weight FROM products WHERE id = ?', [item.product_id]);
                const unitWeight = prod[0]?.weight || 0;
                const weightDiff = diff * unitWeight;

                await connection.query(`
                    UPDATE inventory 
                    SET quantity = quantity + ?,
                        weight = weight + ?
                    WHERE product_id = ?
                `, [diff, weightDiff, item.product_id]);

                // [V1.0.33 ADD] 수불부 기록
                await connection.query(`
                    INSERT INTO inventory_transactions 
                    (transaction_date, transaction_type, product_id, quantity, weight,
                     before_quantity, after_quantity, notes, created_by, reference_number)
                    VALUES (NOW(), 'ADJUST', ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    item.product_id,
                    diff,
                    weightDiff,
                    item.system_quantity,
                    item.actual_quantity,
                    `재고 실사 보정 (Audit ID: ${id})`,
                    'system',
                    `Audit: ${id}`
                ]);
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

                // [V1.0.33 ADD] 집계 재고 업데이트 (원복)
                const [prod] = await connection.query('SELECT p.id, p.weight FROM products p JOIN inventory_audit_items ai ON p.id = ai.product_id WHERE ai.id = ?', [item.id]);
                const productId = prod[0]?.id;
                const unitWeight = prod[0]?.weight || 0;
                const weightRevert = (-diff) * unitWeight;

                if (productId) {
                    await connection.query(`
                        UPDATE inventory 
                        SET quantity = quantity + ?,
                            weight = weight + ?
                        WHERE product_id = ?
                    `, [-diff, weightRevert, productId]);

                    // [V1.0.33 ADD] 수불부 기록 (원복)
                    await connection.query(`
                        INSERT INTO inventory_transactions 
                        (transaction_date, transaction_type, product_id, quantity, weight,
                         before_quantity, after_quantity, notes, created_by, reference_number)
                        VALUES (NOW(), 'ADJUST', ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        productId,
                        -diff,
                        weightRevert,
                        item.actual_quantity,
                        item.system_quantity,
                        `재고 실사 원복 (Audit ID: ${id})`,
                        'system',
                        `Audit Revert: ${id}`
                    ]);
                }
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
