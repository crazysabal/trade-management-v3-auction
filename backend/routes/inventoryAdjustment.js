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

        // 2. 조정 이력 저장
        await connection.query(
            `INSERT INTO inventory_adjustments 
            (purchase_inventory_id, adjustment_type, quantity_change, reason) 
            VALUES (?, ?, ?, ?)`,
            [purchase_inventory_id, adjustment_type, changeQty, reason]
        );

        // 3. 재고 수량 업데이트 및 상태 변경
        const newQty = currentQty + changeQty;
        const newStatus = (newQty <= 0) ? 'DEPLETED' : inventory.status;

        await connection.query(
            `UPDATE purchase_inventory 
             SET remaining_quantity = ?, status = ? 
             WHERE id = ?`,
            [newQty, newStatus, purchase_inventory_id]
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

module.exports = router;
