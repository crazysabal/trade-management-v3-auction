const express = require('express');
const router = express.Router();
const db = require('../config/database');

// 재고 현황 조회
router.get('/', async (req, res) => {
  try {
    const { search, low_stock } = req.query;

    let query = `
      SELECT 
        i.id,
        i.product_id,
        i.quantity,
        i.weight,
        i.purchase_price,
        i.weight_unit,
        p.product_code,
        p.product_name,
        p.grade,
        p.weight as box_weight,
        p.category,
        (
          SELECT it.transaction_date 
          FROM inventory_transactions it 
          WHERE it.product_id = i.product_id AND it.transaction_type = 'IN'
          ORDER BY it.transaction_date DESC, it.id DESC LIMIT 1
        ) as last_purchase_date,
        (
          SELECT td.sender 
          FROM inventory_transactions it 
          LEFT JOIN trade_details td ON it.trade_detail_id = td.id
          WHERE it.product_id = i.product_id AND it.transaction_type = 'IN'
          ORDER BY it.transaction_date DESC, it.id DESC LIMIT 1
        ) as sender,
        (
          SELECT c.company_name 
          FROM inventory_transactions it 
          LEFT JOIN trade_details td ON it.trade_detail_id = td.id
          LEFT JOIN trade_masters tm ON td.trade_master_id = tm.id
          LEFT JOIN companies c ON tm.company_id = c.id
          WHERE it.product_id = i.product_id AND it.transaction_type = 'IN'
          ORDER BY it.transaction_date DESC, it.id DESC LIMIT 1
        ) as supplier_name
      FROM inventory i
      INNER JOIN products p ON i.product_id = p.id
      WHERE p.is_active = 1
    `;
    const params = [];

    if (search) {
      query += ' AND (p.product_name LIKE ? OR p.product_code LIKE ? OR p.grade LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (low_stock === 'true') {
      query += ' AND i.quantity < 10'; // 10 Box 미만
    }

    query += ' ORDER BY p.product_name ASC, p.sort_order ASC, last_purchase_date ASC';

    const [rows] = await db.query(query, params);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('재고 현황 조회 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// 특정 품목 재고 조회
router.get('/product/:productId', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT 
        i.*,
        i.weight_unit,
        p.product_code,
        p.product_name,
        p.grade,
        p.weight as box_weight,
        p.category
      FROM inventory i
      INNER JOIN products p ON i.product_id = p.id
      WHERE i.product_id = ?`,
      [req.params.productId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: '재고 정보를 찾을 수 없습니다.' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('품목 재고 조회 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// 재고 수불부 조회 (통합: 입출고 + 이동)
// 재고 수불부 조회 (통합: 입출고 + 이동)
router.get('/transactions', async (req, res) => {
  try {
    const { start_date, end_date, product_id, transaction_type, warehouse_id } = req.query;

    // 전체 파라미터 배열 (순서대로 push)
    // UNION ALL을 쓰므로 각 쿼리마다 파라미터를 따로 관리하기보다, 
    // 각 쿼리의 WHERE 절을 완성한 뒤 합치는 방식이 복잡함.
    // 여기서는 동적 쿼리이므로, 각 SELECT 문에 대해 조건을 붙이고 params를 각각 관리해야 함.

    // 1. Inventory Transactions (입고, 출고, 조정)
    let where1 = ["1=1"];
    let params1 = [];

    // 2. Warehouse Transfers (이동 - 보내는 쪽 OUT)
    let where2 = ["wt.status = 'COMPLETED'"];
    let params2 = [];

    // 3. Warehouse Transfers (이동 - 받는 쪽 IN)
    let where3 = ["wt.status = 'COMPLETED'"];
    let params3 = [];

    // 공통 필터 적용 함수
    const addFilter = (condition1, val1, condition23, val23) => {
      if (condition1 && val1 !== undefined) {
        where1.push(condition1);
        params1.push(val1);
      }
      if (condition23 && val23 !== undefined) {
        where2.push(condition23);
        params2.push(val23);
        where3.push(condition23);
        params3.push(val23);
      }
    };

    if (start_date) {
      addFilter("it.transaction_date >= ?", start_date, "wt.transfer_date >= ?", start_date);
    }

    if (end_date) {
      addFilter("it.transaction_date <= ?", end_date, "wt.transfer_date <= ?", end_date);
    }

    if (product_id) {
      addFilter("it.product_id = ?", product_id, "wt.product_id = ?", product_id);
    }

    if (warehouse_id) {
      // Inventory Transactions: trade_details 통해서나 직접 필터 불가시 제외
      // 여기서는 trade_details가 LEFT JOIN되어 있으므로 td.warehouse_id 체크
      // 주의: 조정(ADJUST) 등은 trade_details가 없어서 td.warehouse_id가 NULL일 수 있음.
      // 창고 필터가 걸리면 '특정 창고' 데이터만 봐야 하므로 OR NULL 조건은 빼는 게 맞음 (사용자가 NULL을 의도한게 아니라면)
      // 하지만 기존 로직상 (td.warehouse_id = ? OR td.warehouse_id IS NULL)은 '창고 지정 없는 건 다 보여준다'는 의미였음.
      // 여기서는 명확히 '해당 창고'만 보여주기로 함.
      where1.push("tm.warehouse_id = ?");
      params1.push(warehouse_id);

      // Transfer OUT: From이 해당 창고
      where2.push("wt.from_warehouse_id = ?");
      params2.push(warehouse_id);

      // Transfer IN: To가 해당 창고
      where3.push("wt.to_warehouse_id = ?");
      params3.push(warehouse_id);
    }

    if (transaction_type) {
      if (transaction_type === 'TRANSFER') {
        // Transfer Only
        where1.push("1=0"); // Query1 제외
        // Query2, 3는 유지
      } else {
        // Check specific type
        where1.push("it.transaction_type = ?");
        params1.push(transaction_type);

        // 일반 타입 조회 시 Transfer 제외
        where2.push("1=0");
        where3.push("1=0");
      }
    }

    // Base Queries
    const baseQuery1 = `
      SELECT 
        it.id,
        it.transaction_date,
        CONVERT(it.transaction_type USING utf8mb4) as type,
        CONVERT(CASE 
          WHEN it.transaction_type = 'IN' THEN '입고'
          WHEN it.transaction_type = 'OUT' THEN '출고'
          WHEN it.transaction_type = 'ADJUST' THEN '조정'
          ELSE CONVERT(it.transaction_type USING utf8mb4)
        END USING utf8mb4) as type_label,
        it.product_id,
        it.quantity,
        it.weight,
        it.weight_unit,
        it.unit_price,
        CONVERT(it.notes USING utf8mb4) as notes,
        CONVERT(it.created_by USING utf8mb4) as created_by,
        it.created_at,
        CONVERT(p.product_code USING utf8mb4) as product_code,
        CONVERT(p.product_name USING utf8mb4) as product_name,
        CONVERT(p.grade USING utf8mb4) as grade,
        p.weight as standard_weight,
        CONVERT(p.category USING utf8mb4) as category,
        CONVERT(c.company_name USING utf8mb4) as rel_company,
        CONVERT(td.sender USING utf8mb4) as sender,
        (
          SELECT GROUP_CONCAT(DISTINCT CONVERT(c_s.company_name USING utf8mb4) SEPARATOR ', ')
          FROM sale_purchase_matching spm
          INNER JOIN purchase_inventory pi ON spm.purchase_inventory_id = pi.id
          INNER JOIN companies c_s ON pi.company_id = c_s.id
          WHERE spm.sale_detail_id = td.id
        ) as matched_supplier_name,
        (
          SELECT GROUP_CONCAT(DISTINCT CONVERT(pi.sender USING utf8mb4) SEPARATOR ', ')
          FROM sale_purchase_matching spm
          INNER JOIN purchase_inventory pi ON spm.purchase_inventory_id = pi.id
          WHERE spm.sale_detail_id = td.id
        ) as matched_sender_name,
        CAST(NULL AS CHAR CHARACTER SET utf8mb4) as from_warehouse_name,
        CAST(NULL AS CHAR CHARACTER SET utf8mb4) as to_warehouse_name,
        CONVERT(w.name USING utf8mb4) as warehouse_name
      FROM inventory_transactions it
      INNER JOIN products p ON it.product_id = p.id
      LEFT JOIN trade_details td ON it.trade_detail_id = td.id
      LEFT JOIN trade_masters tm ON td.trade_master_id = tm.id
      LEFT JOIN companies c ON tm.company_id = c.id
      LEFT JOIN warehouses w ON tm.warehouse_id = w.id
    `;

    const baseQuery2 = `
      SELECT 
        wt.id,
        wt.transfer_date as transaction_date,
        CONVERT('TRANSFER_OUT' USING utf8mb4) as type,
        CONVERT('이동출고' USING utf8mb4) as type_label,
        wt.product_id,
        wt.quantity,
        wt.weight,
        'kg' as weight_unit,
        NULL as unit_price,
        CONVERT(wt.notes USING utf8mb4) as notes,
        CONVERT(wt.created_by USING utf8mb4) as created_by,
        wt.created_at,
        CONVERT(p.product_code USING utf8mb4) as product_code,
        CONVERT(p.product_name USING utf8mb4) as product_name,
        CONVERT(p.grade USING utf8mb4) as grade,
        p.weight as standard_weight,
        CONVERT(p.category USING utf8mb4) as category,
        CAST(NULL AS CHAR CHARACTER SET utf8mb4) as rel_company,
        CAST(NULL AS CHAR CHARACTER SET utf8mb4) as sender,
        CAST(NULL AS CHAR CHARACTER SET utf8mb4) as matched_supplier_name,
        CAST(NULL AS CHAR CHARACTER SET utf8mb4) as matched_sender_name,
        CONVERT(w1.name USING utf8mb4) as from_warehouse_name,
        CONVERT(w2.name USING utf8mb4) as to_warehouse_name,
        CONVERT(w1.name USING utf8mb4) as warehouse_name
      FROM warehouse_transfers wt
      INNER JOIN products p ON wt.product_id = p.id
      INNER JOIN warehouses w1 ON wt.from_warehouse_id = w1.id
      INNER JOIN warehouses w2 ON wt.to_warehouse_id = w2.id
    `;

    const baseQuery3 = `
      SELECT 
        wt.id,
        wt.transfer_date as transaction_date,
        CONVERT('TRANSFER_IN' USING utf8mb4) as type,
        CONVERT('이동입고' USING utf8mb4) as type_label,
        wt.product_id,
        wt.quantity,
        wt.weight,
        'kg' as weight_unit,
        NULL as unit_price,
        CONVERT(wt.notes USING utf8mb4) as notes,
        CONVERT(wt.created_by USING utf8mb4) as created_by,
        wt.created_at,
        CONVERT(p.product_code USING utf8mb4) as product_code,
        CONVERT(p.product_name USING utf8mb4) as product_name,
        CONVERT(p.grade USING utf8mb4) as grade,
        p.weight as standard_weight,
        CONVERT(p.category USING utf8mb4) as category,
        CAST(NULL AS CHAR CHARACTER SET utf8mb4) as rel_company,
        CAST(NULL AS CHAR CHARACTER SET utf8mb4) as sender,
        CAST(NULL AS CHAR CHARACTER SET utf8mb4) as matched_supplier_name,
        CAST(NULL AS CHAR CHARACTER SET utf8mb4) as matched_sender_name,
        CONVERT(w1.name USING utf8mb4) as from_warehouse_name,
        CONVERT(w2.name USING utf8mb4) as to_warehouse_name,
        CONVERT(w2.name USING utf8mb4) as warehouse_name
      FROM warehouse_transfers wt
      INNER JOIN products p ON wt.product_id = p.id
      INNER JOIN warehouses w1 ON wt.from_warehouse_id = w1.id
      INNER JOIN warehouses w2 ON wt.to_warehouse_id = w2.id
    `;

    // Final Assembly
    const fullQuery1 = `${baseQuery1} WHERE ${where1.join(' AND ')}`;
    const fullQuery2 = `${baseQuery2} WHERE ${where2.join(' AND ')}`;
    const fullQuery3 = `${baseQuery3} WHERE ${where3.join(' AND ')}`;

    const finalQuery = `
      SELECT * FROM (${fullQuery1}) as q1
      UNION ALL
      SELECT * FROM (${fullQuery2}) as q2
      UNION ALL
      SELECT * FROM (${fullQuery3}) as q3
      ORDER BY transaction_date DESC, created_at DESC
    `;

    const finalParams = [...params1, ...params2, ...params3];

    const [rows] = await db.query(finalQuery, finalParams);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('재고 수불부 조회 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// 수동 재고 조정
router.post('/adjust', async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const {
      product_id,
      adjust_quantity,
      adjust_type, // 'ADD' 또는 'SUBTRACT'
      notes,
      created_by
    } = req.body;

    if (!product_id || !adjust_quantity) {
      return res.status(400).json({
        success: false,
        message: '품목과 조정 수량은 필수입니다.'
      });
    }

    // 현재 재고 조회
    const [inventory] = await connection.query(
      'SELECT quantity, weight FROM inventory WHERE product_id = ?',
      [product_id]
    );

    if (inventory.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: '재고 정보를 찾을 수 없습니다.'
      });
    }

    const beforeQty = parseFloat(inventory[0].quantity);
    let afterQty;
    let actualAdjust;

    if (adjust_type === 'ADD') {
      actualAdjust = Math.abs(parseFloat(adjust_quantity));
      afterQty = beforeQty + actualAdjust;
    } else {
      actualAdjust = -Math.abs(parseFloat(adjust_quantity));
      afterQty = beforeQty + actualAdjust;

      if (afterQty < 0) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: '재고가 부족합니다.'
        });
      }
    }

    // 품목 정보 조회 (weight)
    const [product] = await connection.query(
      'SELECT weight FROM products WHERE id = ?',
      [product_id]
    );

    const boxWeight = product[0].weight || 0;
    const weightAdjust = actualAdjust * boxWeight;

    // 재고 업데이트
    await connection.query(
      `UPDATE inventory 
       SET quantity = ?,
           weight = weight + ?
       WHERE product_id = ?`,
      [afterQty, weightAdjust, product_id]
    );

    // 수불부 기록
    await connection.query(
      `INSERT INTO inventory_transactions 
       (transaction_date, transaction_type, product_id, quantity, weight,
        before_quantity, after_quantity, notes, created_by)
       VALUES (CURDATE(), 'ADJUST', ?, ?, ?, ?, ?, ?, ?)`,
      [product_id, actualAdjust, weightAdjust, beforeQty, afterQty, notes, created_by || 'admin']
    );

    await connection.commit();

    res.json({
      success: true,
      message: '재고가 조정되었습니다.',
      data: { before: beforeQty, after: afterQty }
    });

  } catch (error) {
    await connection.rollback();
    console.error('재고 조정 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  } finally {
    connection.release();
  }
});

// 재고 통계 (대시보드용)
router.get('/stats', async (req, res) => {
  try {
    // 총 재고 금액 (매입가 기준)
    const [totalValue] = await db.query(`
      SELECT 
        SUM(i.quantity * IFNULL(i.purchase_price, 0)) as total_inventory_value,
        SUM(i.quantity) as total_quantity,
        SUM(i.weight) as total_weight
      FROM inventory i
    `);

    // 재고 부족 품목 수 (10 Box 미만)
    const [lowStock] = await db.query(`
      SELECT COUNT(*) as low_stock_count
      FROM inventory
      WHERE quantity < 10 AND quantity > 0
    `);

    // 재고 없는 품목 수
    const [outOfStock] = await db.query(`
      SELECT COUNT(*) as out_of_stock_count
      FROM inventory
      WHERE quantity = 0
    `);

    // 카테고리별 재고
    const [byCategory] = await db.query(`
      SELECT 
        p.category,
        SUM(i.quantity) as total_quantity,
        SUM(i.weight) as total_weight,
        COUNT(DISTINCT i.product_id) as product_count
      FROM inventory i
      INNER JOIN products p ON i.product_id = p.id
      WHERE i.quantity > 0
      GROUP BY p.category
      ORDER BY total_quantity DESC
    `);

    res.json({
      success: true,
      data: {
        total_inventory_value: totalValue[0].total_inventory_value || 0,
        total_quantity: totalValue[0].total_quantity || 0,
        total_weight: totalValue[0].total_weight || 0,
        low_stock_count: lowStock[0].low_stock_count || 0,
        out_of_stock_count: outOfStock[0].out_of_stock_count || 0,
        by_category: byCategory
      }
    });
  } catch (error) {
    console.error('재고 통계 조회 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// 재고 데이터 전수 재계산 (정합성 복귀용)
router.post('/recalculate', async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    console.log('[Inventory] Starting global stock recalculation...');

    // 1. 모든 집계 재고를 0으로 초기화 (현재 활성 제품 대상)
    await connection.query('UPDATE inventory SET quantity = 0, weight = 0');

    // 2. purchase_inventory(Lot) 기준으로 집계 재고 재생성
    // 각 Lot의 잔량(remaining_quantity)과 해당 품목의 기준 중량을 곱하여 집계
    const syncQuery = `
      INSERT INTO inventory (product_id, quantity, weight, purchase_price)
      SELECT 
        pi.product_id, 
        SUM(pi.remaining_quantity) as total_qty, 
        SUM(pi.remaining_quantity * IFNULL(p.weight, 0)) as total_weight,
        MAX(pi.unit_price) as last_price
      FROM purchase_inventory pi
      JOIN products p ON pi.product_id = p.id
      WHERE pi.status != 'DEPLETED' OR pi.remaining_quantity > 0
      GROUP BY pi.product_id
      ON DUPLICATE KEY UPDATE
        quantity = VALUES(quantity),
        weight = VALUES(weight),
        purchase_price = VALUES(purchase_price)
    `;

    await connection.query(syncQuery);

    await connection.commit();
    res.json({ success: true, message: '전체 재고 정합성 복구가 완료되었습니다.' });
  } catch (error) {
    await connection.rollback();
    console.error('재고 재계산 오류:', error);
    res.status(500).json({ success: false, message: '재고 복구 중 오류가 발생했습니다: ' + error.message });
  } finally {
    connection.release();
  }
});

module.exports = router;
