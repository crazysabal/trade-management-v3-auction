const express = require('express');
const router = express.Router();
const db = require('../config/database');

/**
 * 재고 조정 (폐기/분실/수량정정)
 * POST /api/inventory-adjustment
 */
router.post('/', async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const { purchase_inventory_id, adjustment_type, quantity_change, reason } = req.body;

        // 1. 현재 재고 조회 (유효성 검사)
        const [rows] = await connection.query(
            'SELECT * FROM purchase_inventory WHERE id = ? FOR UPDATE',
            [purchase_inventory_id]
        );

        if (rows.length === 0) {
            throw new Error('재고를 찾을 수 없습니다.');
        }

        const inventory = rows[0];
        const currentQty = Number(inventory.remaining_quantity);
        const changeQty = Number(quantity_change); // 차감일 경우 음수로 들어와야 함 (또는 로직에서 처리)

        // 수량 검증 (폐기량이 남은양보다 많을 수 없음)
        // quantity_change가 음수라고 가정 (Frontend에서 -값 전송)
        if (currentQty + changeQty < 0) {
            throw new Error(`차감 수량이 현재 재고(${currentQty})보다 많습니다.`);
        }

        const newQty = currentQty + changeQty;
        const newStatus = (newQty <= 0) ? 'DEPLETED' : 'AVAILABLE';

        // 2. 조정 이력 저장
        await connection.query(
            `INSERT INTO inventory_adjustments 
            (purchase_inventory_id, adjustment_type, quantity_change, reason) 
            VALUES (?, ?, ?, ?)`,
            [purchase_inventory_id, adjustment_type, changeQty, reason]
        );

        await connection.query(
            `UPDATE purchase_inventory 
             SET remaining_quantity = ?, status = ? 
             WHERE id = ?`,
            [newQty, newStatus, purchase_inventory_id]
        );

        // [V1.0.21 FIX] Update Aggregate Inventory
        const [prodInfo] = await connection.query('SELECT weight FROM products WHERE id = ?', [inventory.product_id]);
        const unitWeight = prodInfo[0]?.weight || 0;
        const weightChange = changeQty * unitWeight;

        await connection.query(
            `UPDATE inventory 
             SET quantity = quantity + ?,
                 weight = weight + ?
             WHERE product_id = ?`,
            [changeQty, weightChange, inventory.product_id]
        );

        // [V1.0.32 ADD] Insert into inventory_transactions
        await connection.query(
            `INSERT INTO inventory_transactions 
             (transaction_date, transaction_type, product_id, quantity, weight,
              before_quantity, after_quantity, notes, created_by, reference_number)
             VALUES (NOW(), 'ADJUST', ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                inventory.product_id,
                changeQty,
                weightChange,
                currentQty,
                newQty,
                reason,
                'system',
                `Adj: ${adjustment_type} (InvID: ${purchase_inventory_id})`
            ]
        );

        await connection.commit();

        res.json({
            success: true,
            message: '재고 조정이 완료되었습니다.',
            data: {
                purchase_inventory_id,
                previous_quantity: currentQty,
                new_quantity: newQty,
                status: newStatus
            }
        });

    } catch (error) {
        await connection.rollback();
        console.error('재고 조정 오류:', error);
        res.status(500).json({ success: false, message: error.message || '서버 오류가 발생했습니다.' });
    } finally {
        connection.release();
    }
});

/**
 * 재고 조정 취소 (원복)
 * DELETE /api/inventory-adjustment/:id
 */
router.delete('/:id', async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const adjustmentId = req.params.id;

        // 1. 조정 내역 조회
        const [adjRows] = await connection.query(
            'SELECT * FROM inventory_adjustments WHERE id = ? FOR UPDATE',
            [adjustmentId]
        );

        if (adjRows.length === 0) {
            throw new Error('조정 내역을 찾을 수 없습니다.');
        }

        const adjustment = adjRows[0];
        const { purchase_inventory_id, quantity_change } = adjustment;

        // 2. 현재 재고 조회
        const [invRows] = await connection.query(
            'SELECT * FROM purchase_inventory WHERE id = ? FOR UPDATE',
            [purchase_inventory_id]
        );

        if (invRows.length === 0) {
            throw new Error('재고 정보를 찾을 수 없습니다 (이미 삭제되었을 수 있음).');
        }

        const inventory = invRows[0];
        const currentQty = Number(inventory.remaining_quantity);

        // 3. 수량 원복 (조정했던 수량을 뺌)
        // 예: -5개 조정(폐기) -> (-(-5)) = +5개 복구
        // 예: +3개 조정(발견) -> (-(+3)) = -3개 차감
        const revertQty = -Number(quantity_change);
        const newQty = currentQty + revertQty;

        if (newQty < 0) {
            throw new Error('조정 취소 시 재고가 0보다 작아집니다. (이미 소진되었을 수 있음)');
        }

        // 4. 재고 업데이트 및 상태 변경
        const newStatus = (newQty <= 0) ? 'DEPLETED' : 'AVAILABLE'; // Restore to AVAILABLE if positive

        await connection.query(
            `UPDATE purchase_inventory 
             SET remaining_quantity = ?, status = ? 
             WHERE id = ?`,
            [newQty, newStatus, purchase_inventory_id]
        );

        // [V1.0.21 FIX] Update Aggregate Inventory (Revert)
        const [prodInfo] = await connection.query('SELECT weight FROM products WHERE id = ?', [inventory.product_id]);
        const unitWeight = prodInfo[0]?.weight || 0;
        const weightRevert = revertQty * unitWeight;

        await connection.query(
            `UPDATE inventory 
             SET quantity = quantity + ?,
                 weight = weight + ?
             WHERE product_id = ?`,
            [revertQty, weightRevert, inventory.product_id]
        );

        // 5. 조정 내역 삭제 (Hard Delete)
        await connection.query(
            'DELETE FROM inventory_adjustments WHERE id = ?',
            [adjustmentId]
        );

        // [V1.0.32 ADD] Insert into inventory_transactions (REVERSE)
        await connection.query(
            `INSERT INTO inventory_transactions 
             (transaction_date, transaction_type, product_id, quantity, weight,
              before_quantity, after_quantity, notes, created_by, reference_number)
             VALUES (NOW(), 'ADJUST', ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                inventory.product_id,
                revertQty,
                weightRevert,
                currentQty,
                newQty,
                'REVERSE: ' + (adjustment.reason || ''),
                'system',
                `Cancel Adj ID: ${adjustmentId} (InvID: ${purchase_inventory_id})`
            ]
        );

        await connection.commit();

        res.json({
            success: true,
            message: '재고 조정이 취소되었습니다.',
            data: {
                purchase_inventory_id,
                reverted_quantity: revertQty,
                new_quantity: newQty
            }
        });

    } catch (error) {
        await connection.rollback();
        console.error('재고 조정 취소 오류:', error);
        res.status(500).json({ success: false, message: error.message || '서버 오류가 발생했습니다.' });
    } finally {
        connection.release();
    }
});

module.exports = router;
