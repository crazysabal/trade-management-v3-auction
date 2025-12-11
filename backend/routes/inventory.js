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
        p.product_code,
        p.product_name,
        p.grade,
        p.unit,
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
        p.product_code,
        p.product_name,
        p.grade,
        p.unit,
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

// 재고 수불부 조회
router.get('/transactions', async (req, res) => {
  try {
    const { start_date, end_date, product_id, transaction_type } = req.query;
    
    let query = `
      SELECT 
        it.*,
        p.product_code,
        p.product_name,
        p.grade,
        p.unit,
        p.category,
        td.shipper_location,
        td.sender,
        c.company_name
      FROM inventory_transactions it
      INNER JOIN products p ON it.product_id = p.id
      LEFT JOIN trade_details td ON it.trade_detail_id = td.id
      LEFT JOIN trade_masters tm ON td.trade_master_id = tm.id
      LEFT JOIN companies c ON tm.company_id = c.id
      WHERE 1=1
    `;
    const params = [];
    
    if (start_date) {
      query += ' AND it.transaction_date >= ?';
      params.push(start_date);
    }
    
    if (end_date) {
      query += ' AND it.transaction_date <= ?';
      params.push(end_date);
    }
    
    if (product_id) {
      query += ' AND it.product_id = ?';
      params.push(product_id);
    }
    
    if (transaction_type) {
      query += ' AND it.transaction_type = ?';
      params.push(transaction_type);
    }
    
    query += ' ORDER BY it.transaction_date DESC, it.id DESC';
    
    const [rows] = await db.query(query, params);
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

module.exports = router;
