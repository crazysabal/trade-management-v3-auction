const express = require('express');
const router = express.Router();
const db = require('../config/database');

// 재고 이동 실행
router.post('/', async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const { purchase_inventory_id, to_warehouse_id, quantity, notes, target_display_order } = req.body;
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
    let nextDisplayOrder;

    if (target_display_order !== undefined && target_display_order !== null) {
      // 지정된 위치에 삽입: 기존 항목들 순번 밀어내기
      // NULL 값은 COALESCE를 통해 매우 큰 값으로 취급하여 밀어내기 대상에서 관리
      await connection.query(`
        UPDATE purchase_inventory 
        SET display_order = COALESCE(display_order, 2147483647) + 1 
        WHERE warehouse_id = ? AND (display_order >= ? OR display_order IS NULL)
      `, [to_warehouse_id, target_display_order]);
      nextDisplayOrder = target_display_order;
    } else {
      // 기본 로직: 최상단 배치
      const [minOrderRows] = await connection.query(`
        SELECT MIN(display_order) as min_order FROM purchase_inventory WHERE warehouse_id = ?
      `, [to_warehouse_id]);
      nextDisplayOrder = (minOrderRows[0]?.min_order || 0) - 1;
    }

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

    let newInventoryId = null;

    if (existingRows.length > 0) {
      // 병합 (Merge)
      const targetItem = existingRows[0];
      newInventoryId = targetItem.id;
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
      const [insertResult] = await connection.query(`
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
        moveQty, // remaining = moveQty (Split)
        sourceItem.unit_price,
        (sourceItem.total_weight / sourceItem.original_quantity) * moveQty,
        sourceItem.shipper_location,
        sourceItem.sender,
        nextDisplayOrder
      ]);
      newInventoryId = insertResult.insertId;
    }

    // 4. 이동 이력 기록
    await connection.query(`
      INSERT INTO warehouse_transfers (
        transfer_date, product_id, purchase_inventory_id, new_inventory_id, from_warehouse_id, to_warehouse_id,
        quantity, weight, notes, created_by
      ) VALUES (CURDATE(), ?, ?, ?, ?, ?, ?, ?, ?, 'system')
    `, [
      sourceItem.product_id,
      purchase_inventory_id,
      newInventoryId,
      sourceItem.warehouse_id,
      to_warehouse_id,
      moveQty,
      (sourceItem.total_weight / sourceItem.original_quantity) * moveQty,
      notes
    ]);

    // 5. 원본 재고가 0이 되면 상태 변경 (옵션)
    // DEPLETED 상태는 자동으로 처리되지 않으므로 그대로 둠 (잔여 0)

    await connection.commit();
    res.json({ success: true, message: '재고 이동이 완료되었습니다.', newInventoryId });

  } catch (error) {
    await connection.rollback();
    console.error('재고 이동 오류:', error);
    res.status(500).json({ success: false, message: error.message || '서버 오류가 발생했습니다.' });
  } finally {
    connection.release();
  }
});

// 재고 이동 취소
router.delete('/:id', async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const transferId = req.params.id;

    // 1. 이동 기록 조회 (Lock)
    const [transfers] = await connection.query(
      `SELECT * FROM warehouse_transfers WHERE id = ? FOR UPDATE`,
      [transferId]
    );

    if (transfers.length === 0) {
      throw new Error('이동 내역을 찾을 수 없습니다.');
    }

    const transfer = transfers[0];
    const { purchase_inventory_id: fromId, new_inventory_id: toId, quantity, weight } = transfer;

    // 2. 대상 재고(To Lot) 조회 및 유효성 검사
    // 대상 재고가 현재 남아있어야 취소 가능 (이미 팔렸거나 다시 이동했으면 불가)
    const [toLots] = await connection.query(
      `SELECT * FROM purchase_inventory WHERE id = ? FOR UPDATE`,
      [toId]
    );

    if (toLots.length === 0) {
      // 대상 재고가 아예 삭제됨? (논리적으로 발생하기 힘듬, 보통 DEPLETED로 남음)
      throw new Error('이동된 대상 재고 정보를 찾을 수 없습니다.');
    }

    const toLot = toLots[0];

    // 유효성 체크: 되돌릴 수량이 남아있는가?
    // 실수 오차 고려하여 epsilon 사용
    if (parseFloat(toLot.remaining_quantity) < parseFloat(quantity) - 0.0001) {
      throw new Error('이동된 재고가 이미 소진되거나 타 창고로 이동되어 취소할 수 없습니다.');
    }

    // 3. 재고 원복 (Reverse Operation)

    // 3-A. 대상 창고(To)에서 차감
    // original_quantity도 줄여야 함 (이동 시 늘어났거나 생성되었으므로)
    // 만약 이게 New Lot이었다면 original도 0, remaining도 0이 되어 DEPLETED 상태가 됨.
    await connection.query(`
            UPDATE purchase_inventory 
            SET remaining_quantity = remaining_quantity - ?,
                original_quantity = original_quantity - ?,
                total_weight = total_weight - ?,
                status = CASE WHEN remaining_quantity - ? <= 0.0001 THEN 'DEPLETED' ELSE status END
            WHERE id = ?
        `, [quantity, quantity, weight, quantity, toId]);


    // 3-B. 원본 창고(From)로 반환
    // 원본 재고가 존재해야 함.
    const [fromLots] = await connection.query(
      `SELECT id FROM purchase_inventory WHERE id = ? FOR UPDATE`,
      [fromId]
    );

    if (fromLots.length === 0) {
      // 원본이 삭제됨? (매우 드문 케이스, 보통 보존됨)
      throw new Error('복구할 원본 재고 레코드를 찾을 수 없습니다.');
    }

    await connection.query(`
            UPDATE purchase_inventory 
            SET remaining_quantity = remaining_quantity + ?,
                status = 'AVAILABLE'
            WHERE id = ?
        `, [quantity, fromId]);


    // 4. 이동 기록 삭제
    await connection.query(`DELETE FROM warehouse_transfers WHERE id = ?`, [transferId]);

    await connection.commit();
    res.json({ success: true, message: '재고 이동이 취소되었습니다.' });

  } catch (error) {
    await connection.rollback();
    console.error('재고 이동 취소 오류:', error);
    res.status(400).json({ success: false, message: error.message || '취소 중 오류가 발생했습니다.' });
  } finally {
    connection.release();
  }
});

module.exports = router;
