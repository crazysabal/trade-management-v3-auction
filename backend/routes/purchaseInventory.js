const express = require('express');
const router = express.Router();
const db = require('../config/database');

/**
 * 매입 건별 재고 목록 조회
 * GET /api/purchase-inventory
 */
router.get('/', async (req, res) => {
  try {
    const { product_id, company_id, warehouse_id, status, start_date, end_date } = req.query;

    let query = `
      SELECT 
        pi.id,
        pi.trade_detail_id,
        pi.product_id,
        pi.company_id,
        pi.warehouse_id,
        w.name as warehouse_name,
        pi.purchase_date,
        pi.original_quantity,
        pi.remaining_quantity,
        pi.unit_price,
        pi.weight_unit,
        pi.total_weight,
        td.shipper_location,
        td.sender,
        pi.status,
        pi.created_at,
        p.product_name,
        p.grade,
        p.sort_order,
        p.weight as product_weight,
        p.weight_unit as product_weight_unit,
        c.company_name,
        c.business_name,
        tm.trade_number,
        tm.id as trade_master_id,
        pi.display_order,
        ip.id as production_id
      FROM purchase_inventory pi
      LEFT JOIN products p ON pi.product_id = p.id
      LEFT JOIN companies c ON pi.company_id = c.id
      LEFT JOIN warehouses w ON pi.warehouse_id = w.id
      LEFT JOIN trade_details td ON pi.trade_detail_id = td.id
      LEFT JOIN trade_masters tm ON td.trade_master_id = tm.id
      LEFT JOIN inventory_productions ip ON ip.output_inventory_id = pi.id
      WHERE 1=1
    `;
    const params = [];

    if (product_id) {
      query += ' AND pi.product_id = ?';
      params.push(product_id);
    }

    if (company_id) {
      query += ' AND pi.company_id = ?';
      params.push(company_id);
    }

    if (warehouse_id) {
      query += ' AND pi.warehouse_id = ?';
      params.push(warehouse_id);
    }

    // 잔여 수량 있는 것만 조회
    if (req.query.has_remaining === 'true') {
      query += ' AND pi.remaining_quantity > 0';
    }

    // status가 'ALL' 또는 빈 문자열이면 모든 상태 조회, 그 외에는 해당 상태만
    if (status && status !== 'ALL' && status !== '') {
      query += ' AND pi.status = ?';
      params.push(status);
    }
    // status가 없거나 'ALL' 또는 ''이면 모든 상태 조회 (필터 없음)

    if (start_date) {
      query += ' AND pi.purchase_date >= ?';
      params.push(start_date);
    }

    if (end_date) {
      query += ' AND pi.purchase_date <= ?';
      params.push(end_date);
    }

    // [CHANGED] 정렬 기준 변경: 1순위 사용자 지정(display_order), 2순위 등록순(id)
    // 품목명 가나다순(product_name) 강제 정렬 제거
    query += ' ORDER BY COALESCE(pi.display_order, 2147483647) ASC, pi.id ASC';

    const [rows] = await db.query(query, params);

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('매입 건별 재고 조회 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

/**
 * 재고 순서 변경
 * PUT /api/purchase-inventory/reorder
 */
router.put('/reorder', async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const { orderedIds } = req.body; // [id1, id2, id3, ...]

    for (let i = 0; i < orderedIds.length; i++) {
      await connection.query('UPDATE purchase_inventory SET display_order = ? WHERE id = ?', [i, orderedIds[i]]);
    }

    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error('재고 순서 변경 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  } finally {
    connection.release();
  }
});

/**
 * 재고 수불부 (입출고 이력)
 * GET /api/purchase-inventory/transactions
 * 
 * ⚠️ 중요: 이 라우트는 /:id 보다 먼저 정의되어야 함
 */
router.get('/transactions', async (req, res) => {
  try {
    const { product_id, start_date, end_date, warehouse_id, transaction_type } = req.query;


    // [REMOVED] 잔고(running_stock) 계산 로직 제거 - 성능 개선 및 혼란스러운 표시 방지

    let params = [];
    let productFilter = '';
    let dateFilter = '';

    if (product_id) {
      productFilter = ' AND pi.product_id = ?';
      params.push(product_id);
    }

    if (start_date) {
      dateFilter += ' AND pi.purchase_date >= ?';
      params.push(start_date);
    }

    if (end_date) {
      dateFilter += ' AND pi.purchase_date <= ?';
      params.push(end_date);
    }

    if (warehouse_id) {
      dateFilter += ' AND pi.warehouse_id = ?';
      params.push(warehouse_id);
    }

    // 입고 내역 (매입 및 생산 입고)
    const inQuery = `
      SELECT 
        CASE WHEN tm.trade_type = 'PRODUCTION' THEN 'PRODUCTION_IN' ELSE 'PURCHASE' END as transaction_type,
        DATE(pi.purchase_date) as transaction_date,
        pi.id as reference_id,
        td.id as trade_detail_id,
        pi.id as lot_id, -- [NEW] Lot ID Added
        pi.product_id,
        p.product_name,
        p.weight as product_weight,
        p.weight_unit as product_weight_unit,
        p.grade,
        pi.original_quantity as quantity,
        pi.unit_price,
        pi.company_id,
        c.company_name,
        td.shipper_location,
        td.sender,
        tm.trade_number,
        tm.id as trade_master_id,
        ip.id as production_id, -- [NEW] Production ID linked to Output Inventory
        COALESCE(ip.memo, tm.notes) as notes, -- [NEW] Production or Trade Master Memo
        pi.created_at as detail_date,
        w.name as warehouse_name
      FROM purchase_inventory pi
      JOIN products p ON pi.product_id = p.id
      JOIN companies c ON pi.company_id = c.id
      JOIN trade_details td ON pi.trade_detail_id = td.id
      JOIN trade_masters tm ON td.trade_master_id = tm.id
      LEFT JOIN warehouses w ON pi.warehouse_id = w.id
      LEFT JOIN inventory_productions ip ON ip.output_inventory_id = pi.id -- [NEW] Join to get Production ID
      WHERE 1=1 ${productFilter} ${dateFilter}
      AND pi.id = (
        SELECT MIN(pi2.id) 
        FROM purchase_inventory pi2 
        WHERE pi2.trade_detail_id = pi.trade_detail_id
      ) -- 같은 전표의 여러 Lot 중 원본(가장 먼저 생성된 것)만 표시
    `;

    // 출고 내역 (매칭)
    let outParams = [];
    let outProductFilter = '';
    let outDateFilter = '';

    if (product_id) {
      outProductFilter = ' AND pi.product_id = ?';
      outParams.push(product_id);
    }

    if (start_date) {
      outDateFilter += ' AND DATE(spm.matched_at) >= ?';
      outParams.push(start_date);
    }

    if (end_date) {
      outDateFilter += ' AND DATE(spm.matched_at) <= ?';
      outParams.push(end_date);
    }

    if (warehouse_id) {
      outDateFilter += ' AND pi.warehouse_id = ?';
      outParams.push(warehouse_id);
    }

    const outQuery = `
      SELECT 
        'SALE' as transaction_type,
        DATE(spm.matched_at) as transaction_date,
        spm.id as reference_id,
        td_sale.id as trade_detail_id,
        pi.id as lot_id, -- [NEW] Lot ID Added
        pi.product_id,
        p.product_name,
        p.weight as product_weight,
        p.weight_unit as product_weight_unit,
        p.grade,
        spm.matched_quantity as quantity,
        td_sale.unit_price,
        tm_sale.company_id,
        c.company_name,
        td_source.shipper_location as shipper_location,
        td_source.sender as sender,
        tm_sale.trade_number,
        tm_sale.trade_number,
        tm_sale.id as trade_master_id,
        NULL as production_id, -- [NEW]
        tm_sale.notes as notes, -- [NEW] Sale Memo
        tm_source.id as source_trade_id,     -- [NEW] Origin Trade ID
        tm_source.trade_number as source_trade_number, -- [NEW] Origin Trade Number
        pi.trade_detail_id as source_trade_detail_id, -- [NEW]
        spm.matched_at as detail_date,
        w.name as warehouse_name
      FROM sale_purchase_matching spm
      JOIN purchase_inventory pi ON spm.purchase_inventory_id = pi.id
      JOIN products p ON pi.product_id = p.id
      JOIN trade_details td_sale ON spm.sale_detail_id = td_sale.id
      JOIN trade_masters tm_sale ON td_sale.trade_master_id = tm_sale.id
      JOIN companies c ON tm_sale.company_id = c.id
      LEFT JOIN trade_details td_source ON pi.trade_detail_id = td_source.id
      LEFT JOIN trade_masters tm_source ON td_source.trade_master_id = tm_source.id
      LEFT JOIN warehouses w ON pi.warehouse_id = w.id
      WHERE 1=1 ${outProductFilter} ${outDateFilter}
    `;

    // [OPTIMIZATION] 모든 쿼리 정의 후 병렬 실행 (성능 개선)

    // [NEW] 생산 투입 내역 (Ingredients Usage)
    let prodParams = [];
    let prodProductFilter = '';
    let prodDateFilter = '';

    if (product_id) {
      prodProductFilter = ' AND pi.product_id = ?';
      prodParams.push(product_id);
    }

    if (start_date) {
      prodDateFilter += ' AND DATE(ip.created_at) >= ?';
      prodParams.push(start_date);
    }

    if (end_date) {
      prodDateFilter += ' AND DATE(ip.created_at) <= ?';
      prodParams.push(end_date);
    }

    if (warehouse_id) {
      prodDateFilter += ' AND pi.warehouse_id = ?';
      prodParams.push(warehouse_id);
    }

    const prodQuery = `
      SELECT 
        'PRODUCTION_OUT' as transaction_type,
        DATE(ip.created_at) as transaction_date,
        ipi.id as reference_id,
        pi.id as lot_id, -- [NEW] Lot ID Added
        pi.product_id,
        p.product_name,
        p.weight as product_weight,
        p.weight_unit as product_weight_unit,
        p.grade,
        ipi.used_quantity as quantity,
        pi.unit_price,
        pi.company_id,
        c.company_name,
        td_source.shipper_location as shipper_location,
        td_source.sender as sender,
        COALESCE(tm_out.trade_number, CONCAT('PROD-', ip.id)) as trade_number,
        NULL as trade_master_id,
        ip.id as production_id, -- [NEW] Production ID
        COALESCE(ip.memo, tm_out.notes) as notes, -- [NEW] Production or Output Trade Memo
        tm_source.id as source_trade_id,     -- [NEW] Source Trade ID
        tm_source.trade_number as source_trade_number, -- [NEW]
        pi.trade_detail_id as source_trade_detail_id, -- [NEW]
        ip.created_at as detail_date,
        w.name as warehouse_name
      FROM inventory_production_ingredients ipi
      JOIN inventory_productions ip ON ipi.production_id = ip.id
      JOIN purchase_inventory pi ON ipi.used_inventory_id = pi.id
      LEFT JOIN products p ON pi.product_id = p.id
      LEFT JOIN companies c ON pi.company_id = c.id
      LEFT JOIN trade_details td_source ON pi.trade_detail_id = td_source.id
      LEFT JOIN trade_masters tm_source ON td_source.trade_master_id = tm_source.id
      LEFT JOIN warehouses w ON pi.warehouse_id = w.id
      -- [NEW] Join to get consistent Trade Number from Output Item
      LEFT JOIN purchase_inventory pi_out ON ip.output_inventory_id = pi_out.id
      LEFT JOIN trade_details td_out ON pi_out.trade_detail_id = td_out.id
      LEFT JOIN trade_masters tm_out ON td_out.trade_master_id = tm_out.id
      WHERE 1=1 ${prodProductFilter} ${prodDateFilter}
    `;

    // 병렬 실행을 위해 뒤로 이동

    // [NEW] 이동 출고 (Transfer Out)
    let transOutParams = [];
    let transOutProductFilter = '';
    let transOutDateFilter = '';

    if (product_id) {
      transOutProductFilter = ' AND wt.product_id = ?';
      transOutParams.push(product_id);
    }

    if (start_date) {
      transOutDateFilter += ' AND wt.transfer_date >= ?';
      transOutParams.push(start_date);
    }

    if (end_date) {
      transOutDateFilter += ' AND wt.transfer_date <= ?';
      transOutParams.push(end_date);
    }

    if (warehouse_id) {
      transOutDateFilter += ' AND wt.from_warehouse_id = ?';
      transOutParams.push(warehouse_id);
    }

    const transOutQuery = `
      SELECT 
        'TRANSFER_OUT' as transaction_type,
        DATE(wt.transfer_date) as transaction_date,
        wt.id as reference_id,
        wt.purchase_inventory_id as lot_id,
        wt.product_id,
        p.product_name,
        p.weight as product_weight,
        p.weight_unit as product_weight_unit,
        p.grade,
        wt.quantity,
        pi.unit_price,
        pi.company_id,
        c.company_name,
        CONCAT('To: ', w_to.name) as shipper_location, -- Destination as Location
        td_source.sender as sender,
        CONCAT('TRANS-', DATE_FORMAT(wt.transfer_date, '%Y%m%d'), '-', wt.id) as trade_number,
        NULL as trade_master_id,
        NULL as production_id, -- [NEW]
        wt.notes as notes, -- [NEW] Transfer Memo
        tm_source.id as source_trade_id,     -- [NEW] Source Trade ID
        tm_source.trade_number as source_trade_number, -- [NEW]
        pi.trade_detail_id as source_trade_detail_id, -- [NEW]
        wt.created_at as detail_date,
        w_from.name as warehouse_name
      FROM warehouse_transfers wt
      JOIN purchase_inventory pi ON wt.purchase_inventory_id = pi.id
      JOIN products p ON wt.product_id = p.id
      JOIN companies c ON pi.company_id = c.id
      JOIN warehouses w_from ON wt.from_warehouse_id = w_from.id
      JOIN warehouses w_to ON wt.to_warehouse_id = w_to.id
      LEFT JOIN trade_details td_source ON pi.trade_detail_id = td_source.id
      LEFT JOIN trade_masters tm_source ON td_source.trade_master_id = tm_source.id
      WHERE wt.purchase_inventory_id IS NOT NULL ${transOutProductFilter} ${transOutDateFilter}
    `;

    // 병렬 실행을 위해 뒤로 이동

    // [NEW] 이동 입고 (Transfer In) - Inverse of Out
    let transInParams = [];
    let transInProductFilter = '';
    let transInDateFilter = '';

    if (product_id) {
      transInProductFilter = ' AND wt.product_id = ?';
      transInParams.push(product_id);
    }

    if (start_date) {
      transInDateFilter += ' AND wt.transfer_date >= ?';
      transInParams.push(start_date);
    }

    if (end_date) {
      transInDateFilter += ' AND wt.transfer_date <= ?';
      transInParams.push(end_date);
    }

    if (warehouse_id) {
      // For IN, we check to_warehouse_id
      transInDateFilter += ' AND wt.to_warehouse_id = ?';
      transInParams.push(warehouse_id);
    }

    const transInQuery = `
        SELECT 
          'TRANSFER_IN' as transaction_type,
          DATE(wt.transfer_date) as transaction_date,
          wt.id as reference_id,
          COALESCE(wt.new_inventory_id, wt.purchase_inventory_id) as lot_id,
          wt.product_id,
        p.product_name,
        p.weight as product_weight,
        p.weight_unit as product_weight_unit,
        p.grade,
        wt.quantity,
        pi.unit_price,
        pi.company_id,
        c.company_name,
        CONCAT('From: ', w_from.name) as shipper_location, -- Source as Location
        td_source.sender as sender,
        CONCAT('TRANS-', DATE_FORMAT(wt.transfer_date, '%Y%m%d'), '-', wt.id) as trade_number,
        NULL as trade_master_id,
        NULL as production_id,
        wt.notes as notes, -- [NEW] Transfer Memo
        tm_source.id as source_trade_id,
        tm_source.trade_number as source_trade_number,
        pi.trade_detail_id as source_trade_detail_id, -- [NEW]
        wt.created_at as detail_date,
        w_to.name as warehouse_name -- Destination Warehouse (Current Location for IN)
      FROM warehouse_transfers wt
      JOIN purchase_inventory pi ON wt.purchase_inventory_id = pi.id
      JOIN products p ON wt.product_id = p.id
      JOIN companies c ON pi.company_id = c.id
      JOIN warehouses w_from ON wt.from_warehouse_id = w_from.id
      JOIN warehouses w_to ON wt.to_warehouse_id = w_to.id
      LEFT JOIN trade_details td_source ON pi.trade_detail_id = td_source.id
      LEFT JOIN trade_masters tm_source ON td_source.trade_master_id = tm_source.id
      WHERE wt.purchase_inventory_id IS NOT NULL ${transInProductFilter} ${transInDateFilter}
    `;

    // 병렬 실행을 위해 뒤로 이동

    // [NEW] 재고 조정 내역 (Adjustments including Audit)
    let adjParams = [];
    let adjProductFilter = '';
    let adjDateFilter = '';

    if (product_id) {
      adjProductFilter = ' AND pi.product_id = ?';
      adjParams.push(product_id);
    }

    if (start_date) {
      adjDateFilter += ' AND DATE(ia.adjusted_at) >= ?';
      adjParams.push(start_date);
    }

    if (end_date) {
      adjDateFilter += ' AND DATE(ia.adjusted_at) <= ?';
      adjParams.push(end_date);
    }

    if (warehouse_id) {
      adjDateFilter += ' AND pi.warehouse_id = ?';
      adjParams.push(warehouse_id);
    }

    const adjQuery = `
      SELECT 
        'ADJUST' as transaction_type,
        DATE(ia.adjusted_at) as transaction_date,
        ia.id as reference_id,
        ia.purchase_inventory_id as lot_id,
        pi.product_id,
        p.product_name,
        p.weight as product_weight,
        p.weight_unit as product_weight_unit,
        p.grade,
        ia.quantity_change as quantity,
        pi.unit_price,
        pi.company_id,
        c.company_name,
        td_source.shipper_location as shipper_location,
        td_source.sender as sender,
        ia.reason as adjustment_reason,
        CONCAT('ADJ-', ia.id) as trade_number,
        NULL as trade_master_id,
        NULL as production_id, -- [NEW]
        tm_source.id as source_trade_id,
        tm_source.trade_number as source_trade_number,
        pi.trade_detail_id as source_trade_detail_id, -- [NEW]
        ia.adjusted_at as detail_date,
        w.name as warehouse_name
      FROM inventory_adjustments ia
      JOIN purchase_inventory pi ON ia.purchase_inventory_id = pi.id
      JOIN products p ON pi.product_id = p.id
      JOIN companies c ON pi.company_id = c.id
      LEFT JOIN trade_details td_source ON pi.trade_detail_id = td_source.id
      LEFT JOIN trade_masters tm_source ON td_source.trade_master_id = tm_source.id
      LEFT JOIN warehouses w ON pi.warehouse_id = w.id
      WHERE 1=1 ${adjProductFilter} ${adjDateFilter}
    `;

    // 병렬 실행을 위해 뒤로 이동

    // [NEW] 매입반환 내역 (Vendor Return)
    let returnParams = [];
    let returnProductFilter = '';
    let returnDateFilter = '';
    if (product_id) {
      returnProductFilter = ' AND td.product_id = ?';
      returnParams.push(product_id);
    }
    if (start_date) {
      returnDateFilter += ' AND tm.trade_date >= ?';
      returnParams.push(start_date);
    }
    if (end_date) {
      returnDateFilter += ' AND tm.trade_date <= ?';
      returnParams.push(end_date);
    }
    if (warehouse_id) {
      returnDateFilter += ' AND pi.warehouse_id = ?';
      returnParams.push(warehouse_id);
    }

    const returnQuery = `
      SELECT 
        'VENDOR_RETURN' as transaction_type,
        DATE(tm.trade_date) as transaction_date,
        td.id as reference_id,
        td.id as trade_detail_id,
        pi.id as lot_id,
        pi.product_id,
        p.product_name,
        p.weight as product_weight,
        p.weight_unit as product_weight_unit,
        p.grade,
        ABS(td.quantity) as quantity,
        td.unit_price,
        tm.company_id,
        c.company_name,
        td.shipper_location,
        td.sender,
        tm.trade_number,
        tm.id as trade_master_id,
        NULL as production_id,
        CONCAT('(반출) ', tm.notes) as notes,
        tm_source.id as source_trade_id,
        tm_source.trade_number as source_trade_number,
        pi.trade_detail_id as source_trade_detail_id,
        td.created_at as detail_date,
        w.name as warehouse_name
      FROM trade_details td
      JOIN trade_masters tm ON td.trade_master_id = tm.id
      JOIN purchase_inventory pi ON td.parent_detail_id = pi.trade_detail_id
      JOIN products p ON pi.product_id = p.id
      JOIN companies c ON tm.company_id = c.id
      LEFT JOIN trade_details td_source ON pi.trade_detail_id = td_source.id
      LEFT JOIN trade_masters tm_source ON td_source.trade_master_id = tm_source.id
      LEFT JOIN warehouses w ON pi.warehouse_id = w.id
      WHERE tm.trade_type = 'PURCHASE' AND td.parent_detail_id IS NOT NULL ${returnProductFilter} ${returnDateFilter}
    `;
    // [OPTIMIZATION] Promise.all로 7개 쿼리 병렬 실행 (3~5배 성능 개선)
    const [
      [inRows],
      [outRows],
      [prodRows],
      [transOutRows],
      [transInRows],
      [adjRows],
      [returnRows]
    ] = await Promise.all([
      db.query(inQuery, params),
      db.query(outQuery, outParams),
      db.query(prodQuery, prodParams),
      db.query(transOutQuery, transOutParams),
      db.query(transInQuery, transInParams),
      db.query(adjQuery, adjParams),
      db.query(returnQuery, returnParams)
    ]);



    let allRows = [...inRows, ...outRows, ...prodRows, ...transOutRows, ...transInRows, ...adjRows, ...returnRows];

    // [REMOVED] 창고 이동과 무관하게 매입 입고 이력을 항상 표시하도록 변경
    // 이전에는 TRANSFER_IN 수량만큼 PURCHASE quantity를 차감하고 0 이하면 필터링했으나,
    // 사용자 요청에 따라 원본 매입 입고 이력을 항상 보여주도록 변경

    // 합치고 정렬 - [IMPROVED] Robust Sorting for Running Balance
    allRows.sort((a, b) => {
      // 1. Transaction Date (Ascending)
      const dateA = new Date(a.transaction_date);
      const dateB = new Date(b.transaction_date);
      if (dateA.getTime() !== dateB.getTime()) {
        return dateA - dateB;
      }

      // 2. Detail Date / Timestamp (Ascending)
      const timeA = new Date(a.detail_date).getTime();
      const timeB = new Date(b.detail_date).getTime();
      if (timeA !== timeB) return timeA - timeB;

      // 3. Transaction Type Priority (Genesis events first)
      // PURCHASE/IN/PRODUCTION_IN should happen before OUT/SALE/TRANSFER
      const getPriority = (type) => {
        if (['PURCHASE', 'IN', 'PRODUCTION_IN'].includes(type)) return 0;
        if (['TRANSFER_OUT'].includes(type)) return 1; // Out before In (Ship then Receive)
        if (['TRANSFER_IN', 'ADJUST'].includes(type)) return 2;
        return 5;
      };

      // Let's stick to a simpler logic: IN types < OUT types for same timestamp to avoid negative dips if possible?
      // No, strictly chronological is best. If times are equal, Purchase must remain first.
      const pA = getPriority(a.transaction_type);
      const pB = getPriority(b.transaction_type);

      if (pA !== pB) {
        return pA - pB;
      }

      // However, we want strict stability.
      // If we rely on Reference ID, Purchase (low ID) vs Transfer (high ID) works.

      // 4. Reference ID / Tie-breaker (Ascending)
      // This ensures TRANS-174 comes before TRANS-175
      if (a.reference_id !== b.reference_id) {
        return (a.reference_id || 0) - (b.reference_id || 0);
      }

      return (a.trade_number || '').localeCompare(b.trade_number || '');
    });

    // transaction_type 필터링 (메모리 상에서 처리 - 간편함)
    // SQL에서 처리하려면 각 쿼리마다 조건 넣어야 하는데 복잡함
    let filteredRows = allRows;
    if (transaction_type) {
      if (transaction_type === 'IN') {
        filteredRows = allRows.filter(r => ['IN', 'PURCHASE', 'PRODUCTION_IN'].includes(r.transaction_type));
      } else if (transaction_type === 'OUT') {
        filteredRows = allRows.filter(r => ['OUT', 'SALE', 'PRODUCTION_OUT', 'TRANSFER_OUT', 'VENDOR_RETURN'].includes(r.transaction_type));
      } else {
        filteredRows = allRows.filter(r => r.transaction_type === transaction_type);
      }
    }

    // [REMOVED] 잔고 계산 생략 - filteredRows 직접 반환
    res.json({ success: true, data: filteredRows });
  } catch (error) {
    console.error('재고 수불부 조회 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

/**
 * 품목별 재고 요약 (기존 inventory 대체)
 * GET /api/purchase-inventory/summary/by-product
 * 
 * ⚠️ 중요: 이 라우트는 /:id 보다 먼저 정의되어야 함
 */
router.get('/summary/by-product', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        pi.product_id,
        p.product_name,
        p.grade,
        p.weight as product_weight,
        p.weight_unit as product_weight_unit,
        p.sort_order,
        SUM(pi.remaining_quantity) as total_quantity,
        SUM(pi.total_weight * (pi.remaining_quantity / pi.original_quantity)) as total_weight,
        COUNT(*) as lot_count,
        MIN(pi.purchase_date) as oldest_purchase_date,
        MAX(pi.purchase_date) as newest_purchase_date,
        AVG(pi.unit_price) as avg_unit_price
      FROM purchase_inventory pi
      JOIN products p ON pi.product_id = p.id
      WHERE pi.status = 'AVAILABLE' AND pi.remaining_quantity > 0
      GROUP BY pi.product_id, p.product_name, p.grade, p.weight, p.sort_order
      ORDER BY p.product_name ASC, p.sort_order ASC
    `);

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('품목별 재고 요약 조회 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

/**
 * 특정 품목의 사용 가능한 재고 목록 (매칭용)
 * GET /api/purchase-inventory/available/:productId
 * 
 * ⚠️ 중요: 이 라우트는 /:id 보다 먼저 정의되어야 함
 */
router.get('/available/:productId', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        pi.id,
        pi.trade_detail_id,
        pi.purchase_date,
        pi.original_quantity,
        pi.remaining_quantity,
        pi.unit_price,
        td.shipper_location,
        td.sender,
        c.company_name,
        tm.trade_number
      FROM purchase_inventory pi
      JOIN companies c ON pi.company_id = c.id
      JOIN trade_details td ON pi.trade_detail_id = td.id
      JOIN trade_masters tm ON td.trade_master_id = tm.id
      WHERE pi.product_id = ? 
        AND pi.status = 'AVAILABLE' 
        AND pi.remaining_quantity > 0
      ORDER BY pi.purchase_date ASC
    `, [req.params.productId]);

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('사용 가능한 재고 조회 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

/**
 * 재고 무결성 검증
 * GET /api/purchase-inventory/integrity-check
 * 
 * remaining_quantity가 expected(original - matched - adjustments - transfers 등)와 
 * 일치하지 않는 재고를 검출합니다.
 * 
 * ⚠️ 중요: 이 라우트는 /:id 보다 먼저 정의되어야 함
 */
router.get('/integrity-check', async (req, res) => {
  try {
    // 종합 무결성 검증: remaining vs (original - matched - transfer_out + transfer_in - ...)
    const [discrepancies] = await db.query(`
      SELECT 
        pi.id,
        p.product_name,
        p.grade,
        p.weight,
        p.weight_unit,
        pi.original_quantity,
        pi.remaining_quantity,
        COALESCE(matched.total, 0) as total_matched,
        COALESCE(trans_out.total, 0) as total_transfer_out,
        COALESCE(trans_in.total, 0) as total_transfer_in,
        COALESCE(prod_out.total, 0) as total_production_out,
        COALESCE(adjust.total, 0) as total_adjustments,
        COALESCE(vendor_return.total, 0) as total_vendor_return,
        (pi.original_quantity 
          - COALESCE(matched.total, 0) 
          - COALESCE(trans_out.total, 0) 
          + COALESCE(trans_in.total, 0)
          - COALESCE(prod_out.total, 0) 
          + COALESCE(adjust.total, 0)
          - COALESCE(vendor_return.total, 0)
        ) as expected_remaining,
        pi.remaining_quantity - (pi.original_quantity 
          - COALESCE(matched.total, 0) 
          - COALESCE(trans_out.total, 0) 
          + COALESCE(trans_in.total, 0)
          - COALESCE(prod_out.total, 0) 
          + COALESCE(adjust.total, 0)
          - COALESCE(vendor_return.total, 0)
        ) as discrepancy,
        pi.status,
        pi.updated_at,
        w.name as warehouse_name
      FROM purchase_inventory pi
      JOIN products p ON pi.product_id = p.id
      LEFT JOIN warehouses w ON pi.warehouse_id = w.id
      -- 1. 매칭 출고
      LEFT JOIN (
        SELECT purchase_inventory_id, SUM(matched_quantity) as total
        FROM sale_purchase_matching GROUP BY purchase_inventory_id
      ) matched ON pi.id = matched.purchase_inventory_id
      -- 2. 창고 이동 출고
      LEFT JOIN (
        SELECT purchase_inventory_id, SUM(quantity) as total
        FROM warehouse_transfers WHERE purchase_inventory_id IS NOT NULL
        GROUP BY purchase_inventory_id
      ) trans_out ON pi.id = trans_out.purchase_inventory_id
      -- 3. 창고 이동 입고 (이동으로 인한 증가) - 중요!
      -- 주의: new_inventory_id로 들어온 양은 '이미 original_quantity'에 포함된 것으로 간주되는지 여부에 따라 다름.
      -- 우리의 새로운 정책: 병합된 양은 original에 포함되지 않으므로, 여기서 더해줘야 함.
      -- 하지만 '생성(Creator)'된 양은 original에 이미 있으므로 더하면 안 됨.
      -- 이것을 쿼리로 구분하기 어려우므로, 여기서는 '단순 이동 합계'만 가져오고, 
      -- 어플리케이션 레벨에서 original 보정 후 비교하거나, 
      -- 일단은 '이동 입고'는 original에 반영되지 않았다고 가정하고 더하는 로직을 사용 (우리가 original을 깎았으므로!)
      LEFT JOIN (
        SELECT new_inventory_id, SUM(quantity) as total
        FROM warehouse_transfers WHERE new_inventory_id IS NOT NULL AND purchase_inventory_id IS NOT NULL
        GROUP BY new_inventory_id
      ) trans_in ON pi.id = trans_in.new_inventory_id
      -- 4. 생산 투입 출고
      LEFT JOIN (
        SELECT used_inventory_id, SUM(used_quantity) as total
        FROM inventory_production_ingredients GROUP BY used_inventory_id
      ) prod_out ON pi.id = prod_out.used_inventory_id
      -- 5. 재고 조정
      LEFT JOIN (
        SELECT purchase_inventory_id, SUM(quantity_change) as total
        FROM inventory_adjustments GROUP BY purchase_inventory_id
      ) adjust ON pi.id = adjust.purchase_inventory_id
      -- 6. 매입 반품
      LEFT JOIN (
        SELECT pi_inner.id as inventory_id, SUM(ABS(td.quantity)) as total
        FROM trade_details td
        JOIN trade_masters tm ON td.trade_master_id = tm.id
        JOIN purchase_inventory pi_inner ON td.parent_detail_id = pi_inner.trade_detail_id
        WHERE tm.trade_type = 'PURCHASE' AND td.parent_detail_id IS NOT NULL
        GROUP BY pi_inner.id
      ) vendor_return ON pi.id = vendor_return.inventory_id
      WHERE pi.status != 'CANCELLED'
      HAVING ABS(discrepancy) > 0.001
      ORDER BY ABS(discrepancy) DESC
      LIMIT 100
    `);

    // 음수 재고 검출 (가장 중요한 무결성 문제)
    const [negativeInventory] = await db.query(`
      SELECT 
        pi.id,
        p.product_name,
        p.grade,
        p.weight,
        p.weight_unit,
        pi.original_quantity,
        pi.remaining_quantity,
        pi.status,
        w.name as warehouse_name,
        pi.updated_at
      FROM purchase_inventory pi
      JOIN products p ON pi.product_id = p.id
      LEFT JOIN warehouses w ON pi.warehouse_id = w.id
      WHERE pi.remaining_quantity < 0
      ORDER BY pi.remaining_quantity ASC
      LIMIT 50
    `);

    // 상태 불일치 (remaining > 0인데 DEPLETED, 또는 remaining <= 0인데 AVAILABLE)
    const [statusMismatch] = await db.query(`
      SELECT 
        pi.id,
        p.product_name,
        p.grade,
        pi.original_quantity,
        pi.remaining_quantity,
        pi.status,
        CASE 
          WHEN pi.remaining_quantity > 0 THEN 'AVAILABLE'
          ELSE 'DEPLETED'
        END as expected_status,
        w.name as warehouse_name
      FROM purchase_inventory pi
      JOIN products p ON pi.product_id = p.id
      LEFT JOIN warehouses w ON pi.warehouse_id = w.id
      WHERE pi.status != 'CANCELLED'
        AND (
          (pi.remaining_quantity > 0 AND pi.status = 'DEPLETED')
          OR (pi.remaining_quantity <= 0 AND pi.status = 'AVAILABLE')
        )
      LIMIT 50
    `);

    res.json({
      success: true,
      data: {
        discrepancies,
        negativeInventory,
        statusMismatch,
        summary: {
          totalDiscrepancies: discrepancies.length,
          totalNegative: negativeInventory.length,
          totalStatusMismatch: statusMismatch.length,
          checkedAt: new Date().toISOString()
        }
      }
    });
  } catch (error) {
    console.error('재고 무결성 검증 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

/**
 * 재고 무결성 복원
 * POST /api/purchase-inventory/integrity-fix
 * 
 * 불일치 재고의 remaining_quantity를 올바른 값으로 복원합니다.
 * 
 * Body: { ids: [1, 2, 3] } - 복원할 재고 ID 목록 (생략 시 모두 복원)
 */
router.post('/integrity-fix', async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const { ids } = req.body;

    let query = `
      SELECT 
        pi.id,
        pi.original_quantity,
        pi.remaining_quantity,
        COALESCE(matched.total, 0) as total_matched,
        (pi.original_quantity 
          - COALESCE(matched.total, 0) 
          - COALESCE(trans_out.total, 0) 
          + COALESCE(trans_in.total, 0)
          - COALESCE(prod_out.total, 0) 
          + COALESCE(adjust.total, 0)
          - COALESCE(vendor_return.total, 0)
        ) as expected_remaining
      FROM purchase_inventory pi
      LEFT JOIN (SELECT purchase_inventory_id, SUM(matched_quantity) as total FROM sale_purchase_matching GROUP BY purchase_inventory_id) matched ON pi.id = matched.purchase_inventory_id
      LEFT JOIN (SELECT purchase_inventory_id, SUM(quantity) as total FROM warehouse_transfers WHERE purchase_inventory_id IS NOT NULL GROUP BY purchase_inventory_id) trans_out ON pi.id = trans_out.purchase_inventory_id
      LEFT JOIN (SELECT new_inventory_id, SUM(quantity) as total FROM warehouse_transfers WHERE new_inventory_id IS NOT NULL AND purchase_inventory_id IS NOT NULL GROUP BY new_inventory_id) trans_in ON pi.id = trans_in.new_inventory_id
      LEFT JOIN (SELECT used_inventory_id, SUM(used_quantity) as total FROM inventory_production_ingredients GROUP BY used_inventory_id) prod_out ON pi.id = prod_out.used_inventory_id
      LEFT JOIN (SELECT purchase_inventory_id, SUM(quantity_change) as total FROM inventory_adjustments GROUP BY purchase_inventory_id) adjust ON pi.id = adjust.purchase_inventory_id
      LEFT JOIN (
        SELECT pi_inner.id as inventory_id, SUM(ABS(td.quantity)) as total
        FROM trade_details td
        JOIN trade_masters tm ON td.trade_master_id = tm.id
        JOIN purchase_inventory pi_inner ON td.parent_detail_id = pi_inner.trade_detail_id
        WHERE tm.trade_type = 'PURCHASE' AND td.parent_detail_id IS NOT NULL
        GROUP BY pi_inner.id
      ) vendor_return ON pi.id = vendor_return.inventory_id
      WHERE pi.status != 'CANCELLED'
    `;
    const params = [];

    if (ids && ids.length > 0) {
      query += ' AND pi.id IN (?)';
      params.push(ids);
    }

    query += `
      GROUP BY pi.id
      HAVING ABS(pi.remaining_quantity - expected_remaining) > 0.001
    `;

    const [toFix] = await connection.query(query, params);

    let fixedCount = 0;
    const fixedItems = [];

    for (const item of toFix) {
      const newRemaining = parseFloat(item.expected_remaining);
      const newStatus = newRemaining <= 0 ? 'DEPLETED' : 'AVAILABLE';

      await connection.query(
        `UPDATE purchase_inventory SET remaining_quantity = ?, status = ? WHERE id = ?`,
        [newRemaining, newStatus, item.id]
      );

      fixedItems.push({
        id: item.id,
        oldRemaining: parseFloat(item.remaining_quantity),
        newRemaining,
        matched: parseFloat(item.total_matched)
      });
      fixedCount++;
    }

    await connection.commit();

    res.json({
      success: true,
      message: `${fixedCount}건의 재고가 복원되었습니다.`,
      data: {
        fixedCount,
        fixedItems
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('재고 무결성 복원 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  } finally {
    connection.release();
  }
});

/**
 * 상태 불일치 수정
 * POST /api/purchase-inventory/status-fix
 * 
 * remaining_quantity에 맞게 status를 올바르게 설정합니다.
 */
router.post('/status-fix', async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // remaining > 0인데 DEPLETED인 것 → AVAILABLE로 변경
    const [fixToAvailable] = await connection.query(`
      UPDATE purchase_inventory 
      SET status = 'AVAILABLE' 
      WHERE remaining_quantity > 0 AND status = 'DEPLETED'
    `);

    // remaining <= 0인데 AVAILABLE인 것 → DEPLETED로 변경
    const [fixToDepleted] = await connection.query(`
      UPDATE purchase_inventory 
      SET status = 'DEPLETED' 
      WHERE remaining_quantity <= 0 AND status = 'AVAILABLE'
    `);

    await connection.commit();

    res.json({
      success: true,
      message: `${fixToAvailable.affectedRows + fixToDepleted.affectedRows}건의 상태가 수정되었습니다.`,
      data: {
        fixedToAvailable: fixToAvailable.affectedRows,
        fixedToDepleted: fixToDepleted.affectedRows
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('상태 불일치 수정 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  } finally {
    connection.release();
  }
});

/**
 * 매입 건별 재고 상세 조회
 * GET /api/purchase-inventory/:id
 * 
 * ⚠️ 중요: 이 라우트는 맨 마지막에 정의되어야 함 (동적 라우트)
 */
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        pi.*,
        p.product_name,
        p.grade,
        p.sort_order,
        p.weight as product_weight,
        p.weight_unit as product_weight_unit,
        c.company_name,
        tm.trade_number,
        tm.trade_date,
        tm.id as trade_master_id,
        w.name as warehouse_name
      FROM purchase_inventory pi
      JOIN products p ON pi.product_id = p.id
      JOIN companies c ON pi.company_id = c.id
      JOIN trade_details td ON pi.trade_detail_id = td.id
      JOIN trade_masters tm ON td.trade_master_id = tm.id
      LEFT JOIN warehouses w ON pi.warehouse_id = w.id
      WHERE pi.id = ?
    `, [req.params.id]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: '재고를 찾을 수 없습니다.' });
    }

    // 매칭 이력 조회
    const [matchings] = await db.query(`
      SELECT 
        spm.*,
        td.quantity as sale_quantity,
        td.unit_price as sale_unit_price,
        tm.id as sale_trade_master_id,
        tm.trade_number as sale_trade_number,
        tm.trade_date as sale_date,
        c.company_name as customer_name
      FROM sale_purchase_matching spm
      JOIN trade_details td ON spm.sale_detail_id = td.id
      JOIN trade_masters tm ON td.trade_master_id = tm.id
      JOIN companies c ON tm.company_id = c.id
      WHERE spm.purchase_inventory_id = ?
      ORDER BY spm.matched_at DESC
    `, [req.params.id]);

    res.json({
      success: true,
      data: {
        inventory: rows[0],
        matchings: matchings
      }
    });
  } catch (error) {
    console.error('매입 건별 재고 상세 조회 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
