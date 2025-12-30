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

    // 3. 대상 창고에 재고 생성 또는 병합 (Auto-Merge Logic)
    // 순서 결정을 위해 대상 창고의 최소 display_order 조회
    const [minOrderRows] = await connection.query(`
      SELECT MIN(display_order) as min_order FROM purchase_inventory WHERE warehouse_id = ?
    `, [to_warehouse_id]);
    const nextDisplayOrder = (minOrderRows[0]?.min_order || 0) - 1;

    // 동일한 trade_detail_id와 단가를 가진 재고가 대상 창고에 있는지 확인
    const [existingRows] = await connection.query(`
            SELECT id, original_quantity, remaining_quantity, total_weight 
            FROM purchase_inventory 
            WHERE warehouse_id = ? 
              AND trade_detail_id = ? 
              AND unit_price = ?
              AND company_id = ?
              AND product_id = ?
            LIMIT 1
        `, [to_warehouse_id, sourceItem.trade_detail_id, sourceItem.unit_price, sourceItem.company_id, sourceItem.product_id]);

    if (existingRows.length > 0) {
      // 병합 (Merge)
      const targetItem = existingRows[0];
      const addedWeight = (sourceItem.total_weight / sourceItem.original_quantity) * moveQty;

      await connection.query(`
                UPDATE purchase_inventory 
                SET remaining_quantity = remaining_quantity + ?,
                    original_quantity = original_quantity + ?,
                    total_weight = total_weight + ?,
                    display_order = ?
                WHERE id = ?
            `, [moveQty, moveQty, addedWeight, nextDisplayOrder, targetItem.id]);

    } else {
      // 신규 생성 (New Lot)
      await connection.query(`
                INSERT INTO purchase_inventory (
                    trade_detail_id, product_id, company_id, warehouse_id, purchase_date,
                    original_quantity, remaining_quantity, unit_price, total_weight,
                    shipper_location, sender, status, display_order
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'AVAILABLE', ?)
            `, [
        sourceItem.trade_detail_id,
        sourceItem.product_id,
        sourceItem.company_id,
        to_warehouse_id,
        sourceItem.purchase_date,
        moveQty,
        moveQty,
        sourceItem.unit_price,
        (sourceItem.total_weight / sourceItem.original_quantity) * moveQty,
        sourceItem.shipper_location,
        sourceItem.sender,
        nextDisplayOrder
      ]);
    }

    // 4. 이동 이력 기록
    await connection.query(`
      INSERT INTO warehouse_transfers (
        transfer_date, product_id, purchase_inventory_id, from_warehouse_id, to_warehouse_id,
        quantity, weight, notes, created_by
      ) VALUES (CURDATE(), ?, ?, ?, ?, ?, ?, ?, 'system')
    `, [
      sourceItem.product_id,
      purchase_inventory_id,
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
