const express = require('express');
const router = express.Router();
const db = require('../config/database');

// 재고 이동 실행
router.post('/', async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const { purchase_inventory_id, to_warehouse_id, quantity, notes } = req.body;
        const moveQty = parseFloat(quantity);

        // 1. 원본 재고 조회 (Lock for update)
        const [rows] = await connection.query(`
      SELECT * FROM purchase_inventory WHERE id = ? FOR UPDATE
    `, [purchase_inventory_id]);

        if (rows.length === 0) {
            throw new Error('재고를 찾을 수 없습니다.');
        }

        const sourceItem = rows[0];

        // 유효성 검사
        if (sourceItem.warehouse_id === parseInt(to_warehouse_id)) {
            throw new Error('동일한 창고로 이동할 수 없습니다.');
        }
        if (sourceItem.remaining_quantity < moveQty) {
            throw new Error('이동 수량이 잔여 수량보다 많습니다.');
        }

        // 2. 원본 재고 차감
        await connection.query(`
      UPDATE purchase_inventory 
      SET remaining_quantity = remaining_quantity - ? 
      WHERE id = ?
    `, [moveQty, purchase_inventory_id]);

        // 3. 대상 창고에 재고 생성 (새로운 Lot)
        // 기존 정보(unit_price, dates 등)는 유지하되 warehouse_id 변경
        const [result] = await connection.query(`
      INSERT INTO purchase_inventory (
        trade_detail_id, product_id, company_id, warehouse_id, purchase_date,
        original_quantity, remaining_quantity, unit_price, total_weight,
        shipper_location, sender, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'AVAILABLE')
    `, [
            sourceItem.trade_detail_id,
            sourceItem.product_id,
            sourceItem.company_id,
            to_warehouse_id,
            sourceItem.purchase_date,
            moveQty, // original quantity for this new lot is the moved amount
            moveQty,
            sourceItem.unit_price,
            (sourceItem.total_weight / sourceItem.original_quantity) * moveQty, // Weight proportional
            sourceItem.shipper_location,
            sourceItem.sender
        ]);

        // 4. 이동 이력 기록
        await connection.query(`
      INSERT INTO warehouse_transfers (
        transfer_date, product_id, from_warehouse_id, to_warehouse_id,
        quantity, weight, notes, created_by
      ) VALUES (CURDATE(), ?, ?, ?, ?, ?, ?, 'system')
    `, [
            sourceItem.product_id,
            sourceItem.warehouse_id,
            to_warehouse_id,
            moveQty,
            (sourceItem.total_weight / sourceItem.original_quantity) * moveQty,
            notes
        ]);

        // 5. 원본 재고가 0이 되면 상태 변경 (옵션)
        // DEPLETED 상태는 자동으로 처리되지 않으므로 그대로 둠 (잔여 0)

        await connection.commit();
        res.json({ success: true, message: '재고 이동이 완료되었습니다.' });

    } catch (error) {
        await connection.rollback();
        console.error('재고 이동 오류:', error);
        res.status(500).json({ success: false, message: error.message || '서버 오류가 발생했습니다.' });
    } finally {
        connection.release();
    }
});

module.exports = router;
