const express = require('express');
const router = express.Router();
const db = require('../config/database');

/**
 * 미매칭 매출 목록 조회
 * GET /api/matching/pending-sales
 */
router.get('/pending-sales', async (req, res) => {
  try {
    const { start_date, end_date, company_id, product_id } = req.query;
    
    let query = `
      SELECT 
        td.id as sale_detail_id,
        td.product_id,
        td.quantity,
        td.unit_price,
        td.supply_amount,
        td.matching_status,
        IFNULL(
          (SELECT SUM(matched_quantity) FROM sale_purchase_matching WHERE sale_detail_id = td.id),
          0
        ) as matched_quantity,
        td.quantity - IFNULL(
          (SELECT SUM(matched_quantity) FROM sale_purchase_matching WHERE sale_detail_id = td.id),
          0
        ) as unmatched_quantity,
        p.product_name,
        p.grade,
        p.weight as product_weight,
        tm.id as trade_master_id,
        tm.trade_number,
        tm.trade_date,
        c.company_name as customer_name
      FROM trade_details td
      JOIN trade_masters tm ON td.trade_master_id = tm.id
      JOIN products p ON td.product_id = p.id
      JOIN companies c ON tm.company_id = c.id
      WHERE tm.trade_type = 'SALE'
        AND td.matching_status != 'MATCHED'
    `;
    const params = [];
    
    if (start_date) {
      query += ' AND tm.trade_date >= ?';
      params.push(start_date);
    }
    
    if (end_date) {
      query += ' AND tm.trade_date <= ?';
      params.push(end_date);
    }
    
    if (company_id) {
      query += ' AND tm.company_id = ?';
      params.push(company_id);
    }
    
    if (product_id) {
      query += ' AND td.product_id = ?';
      params.push(product_id);
    }
    
    query += ' ORDER BY tm.trade_date ASC, tm.id ASC, td.seq_no ASC';
    
    const [rows] = await db.query(query, params);
    
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('미매칭 매출 조회 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

/**
 * 전체 매출 전표 목록 조회 (매칭 상태 포함)
 * GET /api/matching/all-sales
 */
router.get('/all-sales', async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    
    // 기본값: 오늘 날짜
    const today = new Date().toISOString().split('T')[0];
    const filterStartDate = start_date || today;
    const filterEndDate = end_date || today;
    
    // 전표 마스터 + 매칭 상태 요약 + 마진 계산
    const [trades] = await db.query(`
      SELECT 
        tm.id as trade_master_id,
        tm.trade_number,
        tm.trade_date,
        tm.total_amount,
        tm.company_id,
        c.company_name as customer_name,
        COUNT(td.id) as item_count,
        SUM(td.quantity) as total_quantity,
        SUM(CASE WHEN td.matching_status = 'MATCHED' THEN td.quantity ELSE 0 END) as matched_quantity,
        SUM(CASE WHEN td.matching_status = 'PENDING' THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN td.matching_status = 'PARTIAL' THEN 1 ELSE 0 END) as partial_count,
        SUM(CASE WHEN td.matching_status = 'MATCHED' THEN 1 ELSE 0 END) as matched_count,
        SUM(td.supply_amount) as total_sales_amount,
        SUM(IFNULL(td.purchase_price, 0) * td.quantity) as total_purchase_amount,
        SUM(td.supply_amount - IFNULL(td.purchase_price, 0) * td.quantity) as total_margin
      FROM trade_masters tm
      JOIN companies c ON tm.company_id = c.id
      JOIN trade_details td ON td.trade_master_id = tm.id
      WHERE tm.trade_type = 'SALE'
        AND tm.trade_date >= ?
        AND tm.trade_date <= ?
      GROUP BY tm.id, tm.trade_number, tm.trade_date, tm.total_amount, tm.company_id, c.company_name
      ORDER BY tm.trade_date DESC, tm.id DESC
    `, [filterStartDate, filterEndDate]);
    
    // 각 전표의 전체 매칭 상태 계산 + 잔고 조회
    const result = await Promise.all(trades.map(async (trade) => {
      let overall_status = 'PENDING';
      const matchedCount = parseInt(trade.matched_count) || 0;
      const itemCount = parseInt(trade.item_count) || 0;
      const partialCount = parseInt(trade.partial_count) || 0;
      
      if (matchedCount === itemCount && itemCount > 0) {
        overall_status = 'MATCHED';
      } else if (matchedCount > 0 || partialCount > 0) {
        overall_status = 'PARTIAL';
      }
      
      // 해당 날짜 기준 잔고 계산
      const [balanceResult] = await db.query(`
        SELECT 
          IFNULL((
            SELECT SUM(t.total_price) 
            FROM trade_masters t 
            WHERE t.company_id = ? 
              AND t.trade_type = 'SALE' 
              AND t.status != 'CANCELLED'
              AND t.trade_date <= ?
          ), 0) - IFNULL((
            SELECT SUM(p.amount) 
            FROM payment_transactions p 
            WHERE p.company_id = ? 
              AND p.transaction_type = 'RECEIPT'
              AND p.transaction_date <= ?
          ), 0) as balance
      `, [trade.company_id, trade.trade_date, trade.company_id, trade.trade_date]);
      
      const balance = parseFloat(balanceResult[0]?.balance) || 0;
      const totalSales = parseFloat(trade.total_sales_amount) || 0;
      const totalPurchase = parseFloat(trade.total_purchase_amount) || 0;
      const margin = parseFloat(trade.total_margin) || 0;
      const marginRate = totalPurchase > 0 ? (margin / totalPurchase * 100) : 0;
      
      return {
        ...trade,
        overall_status,
        unmatched_quantity: parseFloat(trade.total_quantity) - parseFloat(trade.matched_quantity),
        balance: balance,
        margin: margin,
        margin_rate: marginRate.toFixed(1)
      };
    }));
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('전체 매출 전표 조회 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

/**
 * 매출-매입 매칭 실행
 * POST /api/matching
 * 
 * body: {
 *   sale_detail_id: number,
 *   matchings: [
 *     { purchase_inventory_id: number, quantity: number },
 *     ...
 *   ]
 * }
 */
router.post('/', async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    const { sale_detail_id, matchings } = req.body;
    
    if (!sale_detail_id || !matchings || matchings.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: '매출 상세 ID와 매칭 정보가 필요합니다.' 
      });
    }
    
    await connection.beginTransaction();
    
    // 1. 매출 상세 정보 조회
    const [saleDetails] = await connection.query(`
      SELECT td.*, tm.trade_type 
      FROM trade_details td
      JOIN trade_masters tm ON td.trade_master_id = tm.id
      WHERE td.id = ?
    `, [sale_detail_id]);
    
    if (saleDetails.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: '매출 상세를 찾을 수 없습니다.' });
    }
    
    if (saleDetails[0].trade_type !== 'SALE') {
      await connection.rollback();
      return res.status(400).json({ success: false, message: '매출 전표만 매칭할 수 있습니다.' });
    }
    
    const saleQuantity = parseFloat(saleDetails[0].quantity);
    
    // 2. 기존 매칭 수량 조회
    const [existingMatching] = await connection.query(`
      SELECT IFNULL(SUM(matched_quantity), 0) as total_matched
      FROM sale_purchase_matching
      WHERE sale_detail_id = ?
    `, [sale_detail_id]);
    
    const alreadyMatched = parseFloat(existingMatching[0].total_matched);
    const remainingToMatch = saleQuantity - alreadyMatched;
    
    // 3. 매칭 수량 검증
    let totalMatchingQty = 0;
    for (const match of matchings) {
      totalMatchingQty += parseFloat(match.quantity);
    }
    
    if (totalMatchingQty > remainingToMatch) {
      await connection.rollback();
      return res.status(400).json({ 
        success: false, 
        message: `매칭 수량(${totalMatchingQty})이 미매칭 수량(${remainingToMatch})을 초과합니다.` 
      });
    }
    
    // 4. 각 매입 재고에 대해 매칭 처리
    for (const match of matchings) {
      const { purchase_inventory_id, quantity } = match;
      const matchQty = parseFloat(quantity);
      
      if (matchQty <= 0) continue;
      
      // 매입 재고 확인
      const [inventory] = await connection.query(`
        SELECT * FROM purchase_inventory 
        WHERE id = ? AND status = 'AVAILABLE'
        FOR UPDATE
      `, [purchase_inventory_id]);
      
      if (inventory.length === 0) {
        await connection.rollback();
        return res.status(400).json({ 
          success: false, 
          message: `매입 재고(ID: ${purchase_inventory_id})를 찾을 수 없거나 사용 불가능합니다.` 
        });
      }
      
      const remainingQty = parseFloat(inventory[0].remaining_quantity);
      
      if (matchQty > remainingQty) {
        await connection.rollback();
        return res.status(400).json({ 
          success: false, 
          message: `매입 재고(ID: ${purchase_inventory_id})의 남은 수량(${remainingQty})이 부족합니다.` 
        });
      }
      
      // 품목 일치 확인
      if (inventory[0].product_id !== saleDetails[0].product_id) {
        await connection.rollback();
        return res.status(400).json({ 
          success: false, 
          message: '매출 품목과 매입 품목이 일치하지 않습니다.' 
        });
      }
      
      // 매칭 기록 추가
      await connection.query(`
        INSERT INTO sale_purchase_matching (sale_detail_id, purchase_inventory_id, matched_quantity)
        VALUES (?, ?, ?)
      `, [sale_detail_id, purchase_inventory_id, matchQty]);
      
      // 매입 재고 차감
      const newRemainingQty = remainingQty - matchQty;
      const newStatus = newRemainingQty <= 0 ? 'DEPLETED' : 'AVAILABLE';
      
      await connection.query(`
        UPDATE purchase_inventory 
        SET remaining_quantity = ?, status = ?
        WHERE id = ?
      `, [newRemainingQty, newStatus, purchase_inventory_id]);
    }
    
    // 5. 매출 상세 매칭 상태 업데이트
    const [newMatchingTotal] = await connection.query(`
      SELECT IFNULL(SUM(matched_quantity), 0) as total_matched
      FROM sale_purchase_matching
      WHERE sale_detail_id = ?
    `, [sale_detail_id]);
    
    const totalMatched = parseFloat(newMatchingTotal[0].total_matched);
    let matchingStatus = 'PENDING';
    
    if (totalMatched >= saleQuantity) {
      matchingStatus = 'MATCHED';
    } else if (totalMatched > 0) {
      matchingStatus = 'PARTIAL';
    }
    
    // ★ 매칭된 재고의 가중평균 매입 단가 계산 및 저장
    const [avgPurchasePrice] = await connection.query(`
      SELECT SUM(spm.matched_quantity * pi.unit_price) / SUM(spm.matched_quantity) as weighted_avg_price
      FROM sale_purchase_matching spm
      JOIN purchase_inventory pi ON spm.purchase_inventory_id = pi.id
      WHERE spm.sale_detail_id = ?
    `, [sale_detail_id]);
    
    const purchasePrice = avgPurchasePrice[0]?.weighted_avg_price || null;
    
    await connection.query(`
      UPDATE trade_details SET matching_status = ?, purchase_price = ? WHERE id = ?
    `, [matchingStatus, purchasePrice, sale_detail_id]);
    
    await connection.commit();
    
    res.json({ 
      success: true, 
      message: '매칭이 완료되었습니다.',
      data: {
        sale_detail_id,
        total_matched: totalMatched,
        matching_status: matchingStatus,
        purchase_price: purchasePrice
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('매칭 처리 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  } finally {
    connection.release();
  }
});

/**
 * 자동 매칭 (FIFO 방식)
 * POST /api/matching/auto
 * 
 * body: {
 *   sale_detail_id: number
 * }
 */
router.post('/auto', async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    const { sale_detail_id } = req.body;
    
    if (!sale_detail_id) {
      return res.status(400).json({ success: false, message: '매출 상세 ID가 필요합니다.' });
    }
    
    await connection.beginTransaction();
    
    // 1. 매출 상세 정보 조회
    const [saleDetails] = await connection.query(`
      SELECT td.*, tm.trade_type 
      FROM trade_details td
      JOIN trade_masters tm ON td.trade_master_id = tm.id
      WHERE td.id = ?
    `, [sale_detail_id]);
    
    if (saleDetails.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: '매출 상세를 찾을 수 없습니다.' });
    }
    
    if (saleDetails[0].trade_type !== 'SALE') {
      await connection.rollback();
      return res.status(400).json({ success: false, message: '매출 전표만 매칭할 수 있습니다.' });
    }
    
    const productId = saleDetails[0].product_id;
    const saleQuantity = parseFloat(saleDetails[0].quantity);
    
    // 2. 기존 매칭 수량 조회
    const [existingMatching] = await connection.query(`
      SELECT IFNULL(SUM(matched_quantity), 0) as total_matched
      FROM sale_purchase_matching
      WHERE sale_detail_id = ?
    `, [sale_detail_id]);
    
    let remainingToMatch = saleQuantity - parseFloat(existingMatching[0].total_matched);
    
    if (remainingToMatch <= 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: '이미 모두 매칭되었습니다.' });
    }
    
    // 3. 사용 가능한 매입 재고 조회 (FIFO: 오래된 것부터)
    const [availableInventory] = await connection.query(`
      SELECT * FROM purchase_inventory
      WHERE product_id = ? AND status = 'AVAILABLE' AND remaining_quantity > 0
      ORDER BY purchase_date ASC, id ASC
      FOR UPDATE
    `, [productId]);
    
    if (availableInventory.length === 0) {
      await connection.rollback();
      return res.status(400).json({ 
        success: false, 
        message: '매칭 가능한 매입 재고가 없습니다.' 
      });
    }
    
    // 4. FIFO 방식으로 자동 매칭
    const matchedItems = [];
    
    for (const inventory of availableInventory) {
      if (remainingToMatch <= 0) break;
      
      const availableQty = parseFloat(inventory.remaining_quantity);
      const matchQty = Math.min(availableQty, remainingToMatch);
      
      // 매칭 기록 추가
      await connection.query(`
        INSERT INTO sale_purchase_matching (sale_detail_id, purchase_inventory_id, matched_quantity)
        VALUES (?, ?, ?)
      `, [sale_detail_id, inventory.id, matchQty]);
      
      // 매입 재고 차감
      const newRemainingQty = availableQty - matchQty;
      const newStatus = newRemainingQty <= 0 ? 'DEPLETED' : 'AVAILABLE';
      
      await connection.query(`
        UPDATE purchase_inventory 
        SET remaining_quantity = ?, status = ?
        WHERE id = ?
      `, [newRemainingQty, newStatus, inventory.id]);
      
      matchedItems.push({
        purchase_inventory_id: inventory.id,
        matched_quantity: matchQty
      });
      
      remainingToMatch -= matchQty;
    }
    
    // 5. 매출 상세 매칭 상태 업데이트
    const [newMatchingTotal] = await connection.query(`
      SELECT IFNULL(SUM(matched_quantity), 0) as total_matched
      FROM sale_purchase_matching
      WHERE sale_detail_id = ?
    `, [sale_detail_id]);
    
    const totalMatched = parseFloat(newMatchingTotal[0].total_matched);
    let matchingStatus = 'PENDING';
    
    if (totalMatched >= saleQuantity) {
      matchingStatus = 'MATCHED';
    } else if (totalMatched > 0) {
      matchingStatus = 'PARTIAL';
    }
    
    // ★ 매칭된 재고의 가중평균 매입 단가 계산 및 저장
    const [avgPurchasePrice] = await connection.query(`
      SELECT SUM(spm.matched_quantity * pi.unit_price) / SUM(spm.matched_quantity) as weighted_avg_price
      FROM sale_purchase_matching spm
      JOIN purchase_inventory pi ON spm.purchase_inventory_id = pi.id
      WHERE spm.sale_detail_id = ?
    `, [sale_detail_id]);
    
    const purchasePrice = avgPurchasePrice[0]?.weighted_avg_price || null;
    
    await connection.query(`
      UPDATE trade_details SET matching_status = ?, purchase_price = ? WHERE id = ?
    `, [matchingStatus, purchasePrice, sale_detail_id]);
    
    await connection.commit();
    
    res.json({ 
      success: true, 
      message: remainingToMatch > 0 
        ? `부분 매칭 완료 (미매칭: ${remainingToMatch}개)`
        : '전체 매칭 완료',
      data: {
        sale_detail_id,
        matched_items: matchedItems,
        total_matched: totalMatched,
        unmatched_quantity: remainingToMatch,
        matching_status: matchingStatus
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('자동 매칭 처리 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  } finally {
    connection.release();
  }
});

/**
 * 매칭 취소
 * DELETE /api/matching/:id
 */
router.delete('/:id', async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // 1. 매칭 정보 조회
    const [matchings] = await connection.query(`
      SELECT * FROM sale_purchase_matching WHERE id = ?
    `, [req.params.id]);
    
    if (matchings.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: '매칭 정보를 찾을 수 없습니다.' });
    }
    
    const matching = matchings[0];
    
    // 2. 매입 재고 복원
    await connection.query(`
      UPDATE purchase_inventory 
      SET remaining_quantity = remaining_quantity + ?,
          status = 'AVAILABLE'
      WHERE id = ?
    `, [matching.matched_quantity, matching.purchase_inventory_id]);
    
    // 3. 매칭 기록 삭제
    await connection.query(`
      DELETE FROM sale_purchase_matching WHERE id = ?
    `, [req.params.id]);
    
    // 4. 매출 상세 매칭 상태 업데이트
    const [newMatchingTotal] = await connection.query(`
      SELECT 
        td.quantity as sale_quantity,
        IFNULL(SUM(spm.matched_quantity), 0) as total_matched
      FROM trade_details td
      LEFT JOIN sale_purchase_matching spm ON td.id = spm.sale_detail_id
      WHERE td.id = ?
      GROUP BY td.id
    `, [matching.sale_detail_id]);
    
    let matchingStatus = 'PENDING';
    if (newMatchingTotal.length > 0) {
      const { sale_quantity, total_matched } = newMatchingTotal[0];
      if (parseFloat(total_matched) >= parseFloat(sale_quantity)) {
        matchingStatus = 'MATCHED';
      } else if (parseFloat(total_matched) > 0) {
        matchingStatus = 'PARTIAL';
      }
    }
    
    await connection.query(`
      UPDATE trade_details SET matching_status = ? WHERE id = ?
    `, [matchingStatus, matching.sale_detail_id]);
    
    await connection.commit();
    
    res.json({ success: true, message: '매칭이 취소되었습니다.' });
  } catch (error) {
    await connection.rollback();
    console.error('매칭 취소 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  } finally {
    connection.release();
  }
});

/**
 * 전표 단위 수동 매칭
 * POST /api/matching/trade
 * 
 * body: {
 *   trade_master_id: number,
 *   matchings: [
 *     {
 *       sale_detail_id: number,
 *       items: [{ purchase_inventory_id: number, quantity: number }, ...]
 *     },
 *     ...
 *   ]
 * }
 */
router.post('/trade', async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    const { trade_master_id, matchings } = req.body;
    
    if (!trade_master_id) {
      return res.status(400).json({ success: false, message: '전표 ID가 필요합니다.' });
    }
    
    if (!matchings || matchings.length === 0) {
      return res.status(400).json({ success: false, message: '매칭 정보가 필요합니다.' });
    }
    
    await connection.beginTransaction();
    
    // 1. 전표 정보 확인
    const [tradeMaster] = await connection.query(`
      SELECT * FROM trade_masters WHERE id = ? AND trade_type = 'SALE'
    `, [trade_master_id]);
    
    if (tradeMaster.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: '매출 전표를 찾을 수 없습니다.' });
    }
    
    let totalMatchedCount = 0;
    let partialMatchedCount = 0;
    
    // 2. 각 매출 상세에 대해 매칭 처리
    for (const matchData of matchings) {
      const { sale_detail_id, items } = matchData;
      
      if (!items || items.length === 0) continue;
      
      // 매출 상세 정보 조회
      const [saleDetails] = await connection.query(`
        SELECT td.*, tm.trade_type 
        FROM trade_details td
        JOIN trade_masters tm ON td.trade_master_id = tm.id
        WHERE td.id = ? AND tm.id = ?
      `, [sale_detail_id, trade_master_id]);
      
      if (saleDetails.length === 0) {
        await connection.rollback();
        return res.status(404).json({ 
          success: false, 
          message: `매출 상세(ID: ${sale_detail_id})를 찾을 수 없습니다.` 
        });
      }
      
      const saleQuantity = parseFloat(saleDetails[0].quantity);
      const productId = saleDetails[0].product_id;
      
      // 기존 매칭 수량 조회
      const [existingMatching] = await connection.query(`
        SELECT IFNULL(SUM(matched_quantity), 0) as total_matched
        FROM sale_purchase_matching
        WHERE sale_detail_id = ?
      `, [sale_detail_id]);
      
      const alreadyMatched = parseFloat(existingMatching[0].total_matched);
      const remainingToMatch = saleQuantity - alreadyMatched;
      
      // 매칭 수량 검증
      let totalMatchingQty = 0;
      for (const item of items) {
        totalMatchingQty += parseFloat(item.quantity || 0);
      }
      
      if (totalMatchingQty > remainingToMatch) {
        await connection.rollback();
        return res.status(400).json({ 
          success: false, 
          message: `매출 상세(ID: ${sale_detail_id})의 매칭 수량(${totalMatchingQty})이 미매칭 수량(${remainingToMatch})을 초과합니다.` 
        });
      }
      
      // 각 매입 재고에 대해 매칭 처리
      for (const item of items) {
        const { purchase_inventory_id, quantity } = item;
        const matchQty = parseFloat(quantity);
        
        if (matchQty <= 0) continue;
        
        // 매입 재고 확인
        const [inventory] = await connection.query(`
          SELECT * FROM purchase_inventory 
          WHERE id = ? AND status = 'AVAILABLE'
          FOR UPDATE
        `, [purchase_inventory_id]);
        
        if (inventory.length === 0) {
          await connection.rollback();
          return res.status(400).json({ 
            success: false, 
            message: `매입 재고(ID: ${purchase_inventory_id})를 찾을 수 없거나 사용 불가능합니다.` 
          });
        }
        
        const remainingQty = parseFloat(inventory[0].remaining_quantity);
        
        if (matchQty > remainingQty) {
          await connection.rollback();
          return res.status(400).json({ 
            success: false, 
            message: `매입 재고(ID: ${purchase_inventory_id})의 남은 수량(${remainingQty})이 부족합니다.` 
          });
        }
        
        // 품목 일치 확인
        if (inventory[0].product_id !== productId) {
          await connection.rollback();
          return res.status(400).json({ 
            success: false, 
            message: '매출 품목과 매입 품목이 일치하지 않습니다.' 
          });
        }
        
        // 매칭 기록 추가
        await connection.query(`
          INSERT INTO sale_purchase_matching (sale_detail_id, purchase_inventory_id, matched_quantity)
          VALUES (?, ?, ?)
        `, [sale_detail_id, purchase_inventory_id, matchQty]);
        
        // 매입 재고 차감
        const newRemainingQty = remainingQty - matchQty;
        const newStatus = newRemainingQty <= 0 ? 'DEPLETED' : 'AVAILABLE';
        
        await connection.query(`
          UPDATE purchase_inventory 
          SET remaining_quantity = ?, status = ?
          WHERE id = ?
        `, [newRemainingQty, newStatus, purchase_inventory_id]);
      }
      
      // 매출 상세 매칭 상태 업데이트
      const [newMatchingTotal] = await connection.query(`
        SELECT IFNULL(SUM(matched_quantity), 0) as total_matched
        FROM sale_purchase_matching
        WHERE sale_detail_id = ?
      `, [sale_detail_id]);
      
      const totalMatched = parseFloat(newMatchingTotal[0].total_matched);
      let matchingStatus = 'PENDING';
      
      if (totalMatched >= saleQuantity) {
        matchingStatus = 'MATCHED';
        totalMatchedCount++;
      } else if (totalMatched > 0) {
        matchingStatus = 'PARTIAL';
        partialMatchedCount++;
      }
      
      // ★ 매칭된 재고의 가중평균 매입 단가 계산 및 저장
      const [avgPurchasePrice] = await connection.query(`
        SELECT SUM(spm.matched_quantity * pi.unit_price) / SUM(spm.matched_quantity) as weighted_avg_price
        FROM sale_purchase_matching spm
        JOIN purchase_inventory pi ON spm.purchase_inventory_id = pi.id
        WHERE spm.sale_detail_id = ?
      `, [sale_detail_id]);
      
      const purchasePrice = avgPurchasePrice[0]?.weighted_avg_price || null;
      
      await connection.query(`
        UPDATE trade_details SET matching_status = ?, purchase_price = ? WHERE id = ?
      `, [matchingStatus, purchasePrice, sale_detail_id]);
    }
    
    await connection.commit();
    
    res.json({ 
      success: true, 
      message: `매칭이 완료되었습니다. (완료: ${totalMatchedCount}건, 부분: ${partialMatchedCount}건)`,
      data: {
        trade_master_id,
        matched_count: totalMatchedCount,
        partial_count: partialMatchedCount
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('전표 단위 수동 매칭 처리 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  } finally {
    connection.release();
  }
});

/**
 * 전표 상세 품목 및 전체 재고 조회
 * GET /api/matching/trade/:trade_master_id/inventory
 */
router.get('/trade/:trade_master_id/inventory', async (req, res) => {
  try {
    const { trade_master_id } = req.params;
    
    // 1. 전표의 모든 품목 조회 (매칭 완료된 품목 포함)
    const [saleDetails] = await db.query(`
      SELECT 
        td.id as sale_detail_id,
        td.seq_no,
        td.product_id,
        td.quantity,
        td.unit_price,
        td.supply_amount,
        td.notes,
        td.matching_status,
        IFNULL(
          (SELECT SUM(matched_quantity) FROM sale_purchase_matching WHERE sale_detail_id = td.id),
          0
        ) as matched_quantity,
        p.product_name,
        p.grade,
        p.weight as product_weight,
        p.unit
      FROM trade_details td
      JOIN products p ON td.product_id = p.id
      WHERE td.trade_master_id = ?
      ORDER BY td.seq_no ASC
    `, [trade_master_id]);
    
    // 2. 각 품목의 기존 매칭 내역 조회
    const saleDetailIds = saleDetails.map(d => d.sale_detail_id);
    let existingMatchings = [];
    
    if (saleDetailIds.length > 0) {
      const [matchings] = await db.query(`
        SELECT 
          spm.id as matching_id,
          spm.sale_detail_id,
          spm.purchase_inventory_id,
          spm.matched_quantity,
          pi.purchase_date,
          pi.unit_price as purchase_unit_price,
          pi.shipper_location,
          pi.sender,
          p.product_name,
          p.grade,
          p.weight as product_weight,
          c.company_name as purchase_company
        FROM sale_purchase_matching spm
        JOIN purchase_inventory pi ON spm.purchase_inventory_id = pi.id
        JOIN products p ON pi.product_id = p.id
        JOIN trade_details td ON pi.trade_detail_id = td.id
        JOIN trade_masters tm ON td.trade_master_id = tm.id
        JOIN companies c ON tm.company_id = c.id
        WHERE spm.sale_detail_id IN (?)
        ORDER BY spm.id ASC
      `, [saleDetailIds]);
      existingMatchings = matchings;
    }
    
    // 미매칭 수량 계산 + 매칭 내역 첨부
    const items = saleDetails.map(detail => {
      const matchingsForItem = existingMatchings.filter(m => m.sale_detail_id === detail.sale_detail_id);
      return {
        ...detail,
        unmatched_quantity: parseFloat(detail.quantity) - parseFloat(detail.matched_quantity),
        matchings: matchingsForItem  // 기존 매칭 내역
      };
    });
    
    // 3. 전체 사용 가능한 매입 재고 조회
    const [allInventory] = await db.query(`
      SELECT 
        pi.id,
        pi.product_id,
        pi.purchase_date,
        pi.original_quantity,
        pi.remaining_quantity,
        pi.unit_price,
        pi.shipper_location,
        pi.sender,
        p.product_name,
        p.grade,
        p.weight as product_weight,
        tm.trade_number,
        c.company_name
      FROM purchase_inventory pi
      JOIN products p ON pi.product_id = p.id
      JOIN trade_details td ON pi.trade_detail_id = td.id
      JOIN trade_masters tm ON td.trade_master_id = tm.id
      JOIN companies c ON tm.company_id = c.id
      WHERE pi.status = 'AVAILABLE' 
        AND pi.remaining_quantity > 0
      ORDER BY pi.purchase_date ASC, pi.id ASC
    `);
    
    res.json({ 
      success: true, 
      data: {
        items,           // 전표의 미매칭 품목들
        inventory: allInventory  // 전체 사용 가능한 재고
      }
    });
  } catch (error) {
    console.error('전표 품목별 재고 조회 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

/**
 * 매칭 현황 조회
 * GET /api/matching/status
 */
router.get('/status', async (req, res) => {
  try {
    const [summary] = await db.query(`
      SELECT 
        COUNT(CASE WHEN matching_status = 'PENDING' THEN 1 END) as pending_count,
        COUNT(CASE WHEN matching_status = 'PARTIAL' THEN 1 END) as partial_count,
        COUNT(CASE WHEN matching_status = 'MATCHED' THEN 1 END) as matched_count,
        SUM(CASE WHEN matching_status = 'PENDING' THEN quantity ELSE 0 END) as pending_quantity,
        SUM(CASE WHEN matching_status = 'PARTIAL' THEN 
          quantity - IFNULL((SELECT SUM(matched_quantity) FROM sale_purchase_matching WHERE sale_detail_id = td.id), 0)
        ELSE 0 END) as partial_unmatched_quantity
      FROM trade_details td
      JOIN trade_masters tm ON td.trade_master_id = tm.id
      WHERE tm.trade_type = 'SALE'
    `);
    
    res.json({ success: true, data: summary[0] });
  } catch (error) {
    console.error('매칭 현황 조회 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;

