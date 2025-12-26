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
        pi.total_weight,
        pi.shipper_location,
        pi.sender,
        pi.status,
        pi.created_at,
        p.product_name,
        p.grade,
        p.sort_order,
        p.weight as product_weight,
        c.company_name,
        tm.trade_number,
        tm.id as trade_master_id
      FROM purchase_inventory pi
      JOIN products p ON pi.product_id = p.id
      JOIN companies c ON pi.company_id = c.id
      JOIN warehouses w ON pi.warehouse_id = w.id
      JOIN trade_details td ON pi.trade_detail_id = td.id
      JOIN trade_masters tm ON td.trade_master_id = tm.id
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

    query += ' ORDER BY pi.display_order ASC, p.product_name ASC, pi.purchase_date ASC';

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
    console.log(`[DEBUG] GET /transactions params:`, { product_id, start_date, end_date, warehouse_id, transaction_type });

    // [NEW] 초기 이월 재고 계산 (start_date 이전의 모든 입출고 합산)
    const initialStocks = {};
    if (start_date) {
      // 1. 이전 입고 합계
      let prevInQuery = `
        SELECT pi.product_id, SUM(pi.original_quantity) as total_in
        FROM purchase_inventory pi
        WHERE pi.purchase_date < ?
      `;
      const prevInParams = [start_date];
      if (product_id) {
        prevInQuery += ' AND pi.product_id = ?';
        prevInParams.push(product_id);
      }
      if (warehouse_id) {
        prevInQuery += ' AND pi.warehouse_id = ?';
        prevInParams.push(warehouse_id);
      }
      prevInQuery += ' GROUP BY pi.product_id';
      const [prevInRows] = await db.query(prevInQuery, prevInParams);

      // 2. 이전 출고(매칭) 합계
      let prevOutQuery = `
        SELECT pi.product_id, SUM(spm.matched_quantity) as total_out
        FROM sale_purchase_matching spm
        JOIN purchase_inventory pi ON spm.purchase_inventory_id = pi.id
        WHERE DATE(spm.matched_at) < ?
      `;
      const prevOutParams = [start_date];
      if (product_id) {
        prevOutQuery += ' AND pi.product_id = ?';
        prevOutParams.push(product_id);
      }
      if (warehouse_id) {
        prevOutQuery += ' AND pi.warehouse_id = ?';
        prevOutParams.push(warehouse_id);
      }
      prevOutQuery += ' GROUP BY pi.product_id';
      const [prevOutRows] = await db.query(prevOutQuery, prevOutParams);

      // 3. 이전 생산투입 합계
      let prevProdQuery = `
        SELECT pi.product_id, SUM(ipi.used_quantity) as total_used
        FROM inventory_production_ingredients ipi
        JOIN purchase_inventory pi ON ipi.used_inventory_id = pi.id
        JOIN inventory_productions ip ON ipi.production_id = ip.id
        WHERE DATE(ip.created_at) < ?
      `;
      const prevProdParams = [start_date];
      if (product_id) {
        prevProdQuery += ' AND pi.product_id = ?';
        prevProdParams.push(product_id);
      }
      if (warehouse_id) {
        prevProdQuery += ' AND pi.warehouse_id = ?';
        prevProdParams.push(warehouse_id);
      }
      prevProdQuery += ' GROUP BY pi.product_id';
      const [prevProdRows] = await db.query(prevProdQuery, prevProdParams);

      // 합산
      prevInRows.forEach(row => {
        if (!initialStocks[row.product_id]) initialStocks[row.product_id] = 0;
        initialStocks[row.product_id] += parseFloat(row.total_in || 0);
      });
      prevOutRows.forEach(row => {
        if (!initialStocks[row.product_id]) initialStocks[row.product_id] = 0;
        initialStocks[row.product_id] -= parseFloat(row.total_out || 0);
      });
      prevProdRows.forEach(row => {
        if (!initialStocks[row.product_id]) initialStocks[row.product_id] = 0;
        initialStocks[row.product_id] -= parseFloat(row.total_used || 0);
      });
    }

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
        pi.purchase_date as transaction_date,
        pi.id as reference_id,
        pi.product_id,
        p.product_name,
        p.weight as product_weight,
        p.grade,
        pi.original_quantity as quantity,
        pi.unit_price,
        pi.company_id,
        c.company_name,
        pi.shipper_location,
        pi.sender,
        tm.trade_number,
        tm.id as trade_master_id,
        tm.trade_number,
        tm.id as trade_master_id,
        pi.created_at as detail_date,
        w.name as warehouse_name
      FROM purchase_inventory pi
      JOIN products p ON pi.product_id = p.id
      JOIN companies c ON pi.company_id = c.id
      JOIN trade_details td ON pi.trade_detail_id = td.id
      JOIN trade_masters tm ON td.trade_master_id = tm.id
      LEFT JOIN warehouses w ON pi.warehouse_id = w.id
      WHERE 1=1 ${productFilter} ${dateFilter}
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
        pi.product_id,
        p.product_name,
        p.weight as product_weight,
        p.grade,
        spm.matched_quantity as quantity,
        td_sale.unit_price,
        tm_sale.company_id,
        c.company_name,
        '' as shipper_location,
        '' as sender,
        tm_sale.trade_number,
        tm_sale.id as trade_master_id,
        tm_sale.trade_number,
        tm_sale.id as trade_master_id,
        spm.matched_at as detail_date,
        w.name as warehouse_name
      FROM sale_purchase_matching spm
      JOIN purchase_inventory pi ON spm.purchase_inventory_id = pi.id
      JOIN products p ON pi.product_id = p.id
      JOIN trade_details td_sale ON spm.sale_detail_id = td_sale.id
      JOIN trade_masters tm_sale ON td_sale.trade_master_id = tm_sale.id
      JOIN companies c ON tm_sale.company_id = c.id
      LEFT JOIN warehouses w ON pi.warehouse_id = w.id
      WHERE 1=1 ${outProductFilter} ${outDateFilter}
    `;

    const [inRows] = await db.query(inQuery, params);
    const [outRows] = await db.query(outQuery, outParams);

    // [NEW] 생산 투입 내역 (Ingredients Usage)
    let prodParams = [];
    let prodProductFilter = '';
    let prodDateFilter = '';

    if (product_id) {
      prodProductFilter = ' AND pi.product_id = ?';
      prodParams.push(product_id);
    }

    if (start_date) {
      prodDateFilter += ' AND ip.created_at >= ?';
      prodParams.push(start_date);
    }

    if (end_date) {
      prodDateFilter += ' AND ip.created_at <= ?';
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
        pi.product_id,
        p.product_name,
        p.weight as product_weight,
        p.grade,
        ipi.used_quantity as quantity,
        pi.unit_price,
        pi.company_id,
        c.company_name,
        '생산투입' as shipper_location,
        'SYSTEM' as sender,
        CONCAT('PROD-', ip.id) as trade_number,
        NULL as trade_master_id,
        CONCAT('PROD-', ip.id) as trade_number,
        NULL as trade_master_id,
        ip.created_at as detail_date,
        w.name as warehouse_name
      FROM inventory_production_ingredients ipi
      JOIN inventory_productions ip ON ipi.production_id = ip.id
      JOIN purchase_inventory pi ON ipi.used_inventory_id = pi.id
      JOIN products p ON pi.product_id = p.id
      JOIN companies c ON pi.company_id = c.id
      LEFT JOIN warehouses w ON pi.warehouse_id = w.id
      WHERE 1=1 ${prodProductFilter} ${prodDateFilter}
    `;

    const [prodRows] = await db.query(prodQuery, prodParams);

    console.log(`[DEBUG] Transaction Counts: In=${inRows.length}, Out=${outRows.length}, Prod=${prodRows.length}`);

    // 합치고 정렬
    const allRows = [...inRows, ...outRows, ...prodRows].sort((a, b) => {
      // 날짜 기준 정렬, 같으면 상세 시간 기준
      const dateA = new Date(a.transaction_date);
      const dateB = new Date(b.transaction_date);
      if (dateA.getTime() !== dateB.getTime()) {
        return dateA - dateB;
      }
      const timeDiff = new Date(a.detail_date) - new Date(b.detail_date);
      if (timeDiff !== 0) return timeDiff;

      return (a.trade_number || '').localeCompare(b.trade_number || '');
    });

    // transaction_type 필터링 (메모리 상에서 처리 - 간편함)
    // SQL에서 처리하려면 각 쿼리마다 조건 넣어야 하는데 복잡함
    let filteredRows = allRows;
    if (transaction_type) {
      if (transaction_type === 'IN') {
        filteredRows = allRows.filter(r => ['IN', 'PURCHASE', 'PRODUCTION_IN'].includes(r.transaction_type));
      } else if (transaction_type === 'OUT') {
        filteredRows = allRows.filter(r => ['OUT', 'SALE', 'PRODUCTION_OUT'].includes(r.transaction_type));
      } else {
        filteredRows = allRows.filter(r => r.transaction_type === transaction_type);
      }
    }

    // 누적 재고 계산 (품목별)
    const stockByProduct = { ...initialStocks };
    const result = filteredRows.map(row => {
      const key = row.product_id;
      if (stockByProduct[key] === undefined) {
        stockByProduct[key] = 0;
      }

      const qty = parseFloat(row.quantity);
      if (['IN', 'PURCHASE', 'PRODUCTION_IN'].includes(row.transaction_type)) {
        stockByProduct[key] += qty;
      } else {
        stockByProduct[key] -= qty;
      }

      return {
        ...row,
        running_stock: stockByProduct[key]
      };
    });

    res.json({ success: true, data: result });
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
        pi.shipper_location,
        pi.sender,
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
        c.company_name,
        tm.trade_number,
        tm.trade_date,
        tm.id as trade_master_id
      FROM purchase_inventory pi
      JOIN products p ON pi.product_id = p.id
      JOIN companies c ON pi.company_id = c.id
      JOIN trade_details td ON pi.trade_detail_id = td.id
      JOIN trade_masters tm ON td.trade_master_id = tm.id
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
