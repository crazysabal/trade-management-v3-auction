const express = require('express');
const router = express.Router();
const db = require('../config/database');

// 거래전표 목록 조회
router.get('/', async (req, res) => {
  try {
    const { trade_type, start_date, end_date, company_id, status, search } = req.query;
    
    let query = `
      SELECT 
        tm.*,
        c.company_name,
        c.company_code,
        IFNULL((
          SELECT SUM(t.total_price) 
          FROM trade_masters t 
          WHERE t.company_id = tm.company_id 
            AND t.trade_type = 'SALE' 
            AND t.status != 'CANCELLED'
            AND t.trade_date <= tm.trade_date
        ), 0) - IFNULL((
          SELECT SUM(p.amount) 
          FROM payment_transactions p 
          WHERE p.company_id = tm.company_id 
            AND p.transaction_type = 'RECEIPT'
            AND p.transaction_date <= tm.trade_date
        ), 0) as receivable,
        IFNULL((
          SELECT SUM(t.total_price) 
          FROM trade_masters t 
          WHERE t.company_id = tm.company_id 
            AND t.trade_type = 'PURCHASE' 
            AND t.status != 'CANCELLED'
            AND t.trade_date <= tm.trade_date
        ), 0) - IFNULL((
          SELECT SUM(p.amount) 
          FROM payment_transactions p 
          WHERE p.company_id = tm.company_id 
            AND p.transaction_type = 'PAYMENT'
            AND p.transaction_date <= tm.trade_date
        ), 0) as payable,
        IFNULL((
          SELECT SUM(p.amount) 
          FROM payment_transactions p 
          WHERE p.company_id = tm.company_id 
            AND p.transaction_type = 'RECEIPT'
            AND DATE(p.transaction_date) = DATE(tm.trade_date)
        ), 0) as daily_receipt,
        IFNULL((
          SELECT SUM(p.amount) 
          FROM payment_transactions p 
          WHERE p.company_id = tm.company_id 
            AND p.transaction_type = 'PAYMENT'
            AND DATE(p.transaction_date) = DATE(tm.trade_date)
        ), 0) as daily_payment
      FROM trade_masters tm
      LEFT JOIN companies c ON tm.company_id = c.id
      WHERE 1=1
    `;
    const params = [];
    
    if (trade_type) {
      query += ' AND tm.trade_type = ?';
      params.push(trade_type);
    }
    
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
    
    if (status) {
      query += ' AND tm.status = ?';
      params.push(status);
    }
    
    if (search) {
      query += ' AND (tm.trade_number LIKE ? OR c.company_name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    
    query += ' ORDER BY tm.trade_date DESC, tm.id DESC';
    
    const [rows] = await db.query(query, params);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('거래전표 조회 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// 동일 거래처/날짜/전표유형 중복 체크
router.get('/check-duplicate', async (req, res) => {
  try {
    const { company_id, trade_date, trade_type, exclude_trade_id } = req.query;
    
    if (!company_id || !trade_date || !trade_type) {
      return res.json({ success: true, isDuplicate: false });
    }
    
    let query = `
      SELECT id, trade_number FROM trade_masters
      WHERE company_id = ? AND trade_date = ? AND trade_type = ? AND status != 'CANCELLED'
    `;
    const params = [company_id, trade_date, trade_type];
    
    if (exclude_trade_id) {
      query += ' AND id != ?';
      params.push(exclude_trade_id);
    }
    
    const [rows] = await db.query(query, params);
    
    res.json({
      success: true,
      isDuplicate: rows.length > 0,
      existingTradeNumber: rows.length > 0 ? rows[0].trade_number : null,
      existingTradeId: rows.length > 0 ? rows[0].id : null
    });
  } catch (error) {
    console.error('중복 체크 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// 거래전표 상세 조회 (상세 내역 포함)
router.get('/:id', async (req, res) => {
  try {
    // 마스터 조회
    const [master] = await db.query(
      `SELECT 
        tm.*,
        c.company_name,
        c.company_code,
        c.business_number,
        c.ceo_name,
        c.address,
        c.company_type,
        c.company_category
      FROM trade_masters tm
      LEFT JOIN companies c ON tm.company_id = c.id
      WHERE tm.id = ?`,
      [req.params.id]
    );
    
    if (master.length === 0) {
      return res.status(404).json({ success: false, message: '거래전표를 찾을 수 없습니다.' });
    }
    
    // 상세 내역 조회 (매칭 정보 및 매입 단가 포함)
    // ★ td.purchase_price 우선, 없으면 매칭 통해 조회
    const [details] = await db.query(
      `SELECT 
        td.*,
        td.sender as sender_name,
        p.product_code,
        p.product_name,
        p.grade,
        p.weight as product_weight,
        p.unit,
        spm.purchase_inventory_id as matched_inventory_id,
        spm.matched_quantity,
        COALESCE(td.purchase_price, pi.unit_price) as purchase_price
      FROM trade_details td
      LEFT JOIN products p ON td.product_id = p.id
      LEFT JOIN sale_purchase_matching spm ON td.id = spm.sale_detail_id
      LEFT JOIN purchase_inventory pi ON spm.purchase_inventory_id = pi.id
      WHERE td.trade_master_id = ?
      ORDER BY td.seq_no`,
      [req.params.id]
    );
    
    res.json({
      success: true,
      data: {
        master: master[0],
        details: details
      }
    });
  } catch (error) {
    console.error('거래전표 상세 조회 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// 거래전표 등록
router.post('/', async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { master, details } = req.body;
    
    // 동일 거래처 + 동일 날짜 + 동일 전표유형 중복 검사
    const [existingTrade] = await connection.query(
      `SELECT id, trade_number FROM trade_masters 
       WHERE company_id = ? AND trade_date = ? AND trade_type = ? AND status != 'CANCELLED'`,
      [master.company_id, master.trade_date, master.trade_type]
    );
    
    if (existingTrade.length > 0) {
      await connection.rollback();
      const tradeTypeName = master.trade_type === 'PURCHASE' ? '매입' : '매출';
      return res.status(400).json({ 
        success: false, 
        message: `해당 거래처에 동일 날짜의 ${tradeTypeName} 전표가 이미 존재합니다.\n\n기존 전표번호: ${existingTrade[0].trade_number}\n\n기존 전표를 수정하거나 다른 날짜를 선택해주세요.`,
        existingTradeId: existingTrade[0].id,
        existingTradeNumber: existingTrade[0].trade_number
      });
    }
    
    // 전표번호 생성 (형식: PUR-YYYYMMDD-001 또는 SAL-YYYYMMDD-001)
    const prefix = master.trade_type === 'PURCHASE' ? 'PUR' : 'SAL';
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    
    const [lastNumber] = await connection.query(
      `SELECT trade_number FROM trade_masters 
       WHERE trade_number LIKE ? 
       ORDER BY trade_number DESC LIMIT 1`,
      [`${prefix}-${today}-%`]
    );
    
    let seqNo = 1;
    if (lastNumber.length > 0) {
      const lastSeq = parseInt(lastNumber[0].trade_number.split('-')[2]);
      seqNo = lastSeq + 1;
    }
    
    const tradeNumber = `${prefix}-${today}-${String(seqNo).padStart(3, '0')}`;
    
    // 마스터 등록
    const [masterResult] = await connection.query(
      `INSERT INTO trade_masters (
        trade_number, trade_type, trade_date, company_id,
        total_amount, tax_amount, total_price,
        payment_method, notes, status, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tradeNumber,
        master.trade_type,
        master.trade_date,
        master.company_id,
        master.total_amount || 0,
        master.tax_amount || 0,
        master.total_price || 0,
        master.payment_method,
        master.notes,
        master.status || 'DRAFT',
        master.created_by || 'admin'
      ]
    );
    
    const masterId = masterResult.insertId;
    
    // 상세 등록
    if (details && details.length > 0) {
      for (let i = 0; i < details.length; i++) {
        const detail = details[i];
        await connection.query(
          `INSERT INTO trade_details (
            trade_master_id, seq_no, product_id,
            quantity, total_weight, unit_price, supply_amount, tax_amount, total_amount, auction_price, notes,
            shipper_location, sender, purchase_price
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            masterId,
            i + 1,
            detail.product_id,
            detail.quantity,
            detail.total_weight || 0,
            detail.unit_price,
            detail.supply_amount || 0,
            detail.tax_amount || 0,
            detail.total_amount || detail.supply_amount || 0,
            detail.auction_price || detail.unit_price || 0,
            detail.notes || '',
            detail.shipper_location || null,
            detail.sender_name || detail.sender || null,
            detail.purchase_price || null
          ]
        );
      }
    }
    
    await connection.commit();
    
    res.status(201).json({
      success: true,
      message: '거래전표가 등록되었습니다.',
      data: { id: masterId, trade_number: tradeNumber }
    });
  } catch (error) {
    await connection.rollback();
    console.error('거래전표 등록 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  } finally {
    connection.release();
  }
});

// 거래전표 수정
router.put('/:id', async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { master, details } = req.body;
    
    // 1. 전표 정보 조회 (잔고 조정을 위해 total_price도 조회)
    const [masters] = await connection.query(
      'SELECT trade_type, company_id, trade_date, total_price FROM trade_masters WHERE id = ?',
      [req.params.id]
    );
    
    if (masters.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: '거래전표를 찾을 수 없습니다.' });
    }
    
    const tradeType = masters[0].trade_type;
    const currentCompanyId = masters[0].company_id;
    const currentTradeDate = masters[0].trade_date;
    const currentTotalPrice = parseFloat(masters[0].total_price) || 0;
    
    // 거래처 또는 날짜가 변경된 경우 중복 검사
    const newCompanyId = master.company_id;
    const newTradeDate = master.trade_date;
    
    // 날짜 비교를 위한 정규화 (YYYY-MM-DD 형식으로)
    const normalizedCurrentDate = currentTradeDate instanceof Date 
      ? currentTradeDate.toISOString().slice(0, 10) 
      : String(currentTradeDate).slice(0, 10);
    const normalizedNewDate = String(newTradeDate).slice(0, 10);
    
    if (String(newCompanyId) !== String(currentCompanyId) || normalizedNewDate !== normalizedCurrentDate) {
      // 새로운 거래처+날짜 조합에 다른 전표가 있는지 확인
      const [existingTrade] = await connection.query(
        `SELECT id, trade_number FROM trade_masters 
         WHERE company_id = ? AND trade_date = ? AND trade_type = ? AND status != 'CANCELLED' AND id != ?`,
        [newCompanyId, newTradeDate, tradeType, req.params.id]
      );
      
      if (existingTrade.length > 0) {
        await connection.rollback();
        const tradeTypeName = tradeType === 'PURCHASE' ? '매입' : '매출';
        return res.status(400).json({ 
          success: false, 
          message: `해당 거래처에 동일 날짜의 ${tradeTypeName} 전표가 이미 존재합니다.\n\n기존 전표번호: ${existingTrade[0].trade_number}\n\n기존 전표를 수정하거나 다른 날짜를 선택해주세요.`,
          existingTradeId: existingTrade[0].id,
          existingTradeNumber: existingTrade[0].trade_number
        });
      }
    }
    
    // 2. 매입 전표인 경우: 매칭된 내역이 있는지 확인
    if (tradeType === 'PURCHASE') {
      const [matchedItems] = await connection.query(
        `SELECT 
           p.product_name, 
           p.grade,
           p.weight as product_weight,
           spm.matched_quantity,
           tm_sale.trade_number as sale_trade_number,
           tm_sale.trade_date as sale_date,
           c.company_name as customer_name
         FROM trade_details td
         JOIN purchase_inventory pi ON td.id = pi.trade_detail_id
         JOIN sale_purchase_matching spm ON pi.id = spm.purchase_inventory_id
         JOIN products p ON td.product_id = p.id
         JOIN trade_details td_sale ON spm.sale_detail_id = td_sale.id
         JOIN trade_masters tm_sale ON td_sale.trade_master_id = tm_sale.id
         JOIN companies c ON tm_sale.company_id = c.id
         WHERE td.trade_master_id = ?
         ORDER BY tm_sale.trade_date DESC, tm_sale.trade_number`,
        [req.params.id]
      );
      
      if (matchedItems.length > 0) {
        const totalMatchedQty = matchedItems.reduce((sum, item) => sum + parseFloat(item.matched_quantity), 0);
        
        await connection.rollback();
        return res.status(400).json({ 
          success: false,
          errorType: 'MATCHING_EXISTS',
          message: '이미 매출과 매칭된 내역이 있어 수정할 수 없습니다.',
          matchingData: {
            totalCount: matchedItems.length,
            totalQuantity: totalMatchedQty,
            items: matchedItems.map(item => {
              // 중량 포맷: 정수면 소수점 없이, 소수면 소수점 표시
              let weightStr = '';
              if (item.product_weight) {
                const weight = parseFloat(item.product_weight);
                weightStr = ` ${Number.isInteger(weight) ? Math.floor(weight) : weight}kg`;
              }
              return {
                productName: `${item.product_name}${weightStr}${item.grade ? ` (${item.grade})` : ''}`,
                saleTradeNumber: item.sale_trade_number,
                saleDate: item.sale_date ? item.sale_date.toString().split('T')[0] : '-',
                customerName: item.customer_name,
                matchedQuantity: parseFloat(item.matched_quantity)
              };
            })
          }
        });
      }
      
      // 매칭되지 않은 경우: 기존 purchase_inventory 삭제
      await connection.query(
        `DELETE FROM purchase_inventory 
         WHERE trade_detail_id IN (SELECT id FROM trade_details WHERE trade_master_id = ?)`,
        [req.params.id]
      );
    }
    
    // 3. 매출 전표인 경우: 매칭 확인 및 차단
    if (tradeType === 'SALE') {
      // 매칭된 내역이 있는지 확인
      const [matchedItems] = await connection.query(
        `SELECT 
           p.product_name, 
           p.grade,
           p.weight as product_weight,
           spm.matched_quantity,
           pi.id as inventory_id,
           c_supplier.company_name as supplier_name
         FROM trade_details td
         JOIN sale_purchase_matching spm ON td.id = spm.sale_detail_id
         JOIN purchase_inventory pi ON spm.purchase_inventory_id = pi.id
         JOIN products p ON td.product_id = p.id
         JOIN trade_details td_purchase ON pi.trade_detail_id = td_purchase.id
         JOIN trade_masters tm_purchase ON td_purchase.trade_master_id = tm_purchase.id
         JOIN companies c_supplier ON tm_purchase.company_id = c_supplier.id
         WHERE td.trade_master_id = ?
         ORDER BY p.product_name`,
        [req.params.id]
      );
      
      if (matchedItems.length > 0) {
        const totalMatchedQty = matchedItems.reduce((sum, item) => sum + parseFloat(item.matched_quantity), 0);
        
        await connection.rollback();
        return res.status(400).json({ 
          success: false,
          errorType: 'MATCHING_EXISTS',
          message: '이미 매입과 매칭된 내역이 있어 수정할 수 없습니다.',
          matchingData: {
            totalCount: matchedItems.length,
            totalQuantity: totalMatchedQty,
            items: matchedItems.map(item => {
              let weightStr = '';
              if (item.product_weight) {
                const weight = parseFloat(item.product_weight);
                weightStr = ` ${Number.isInteger(weight) ? Math.floor(weight) : weight}kg`;
              }
              return {
                productName: `${item.product_name}${weightStr}${item.grade ? ` (${item.grade})` : ''}`,
                supplierName: item.supplier_name,
                matchedQuantity: parseFloat(item.matched_quantity)
              };
            })
          }
        });
      }
    }
    
    // 4. 매출 전표 기존 로직 (매칭 없는 경우만 실행)
    let unmatchedItems = []; // 재매칭이 필요한 품목 목록
    let existingMap = new Map(); // 기존 품목 맵 (블록 밖에서 선언)
    
    if (tradeType === 'SALE') {
      // 기존 품목별 매칭 정보 조회 (매칭 없는 경우에만 여기까지 옴)
      const [existingDetails] = await connection.query(
        `SELECT td.id, td.product_id, td.quantity, td.unit_price,
                COALESCE(SUM(spm.matched_quantity), 0) as matched_quantity,
                GROUP_CONCAT(spm.id) as matching_ids,
                GROUP_CONCAT(spm.purchase_inventory_id) as inventory_ids,
                GROUP_CONCAT(spm.matched_quantity) as matched_quantities
         FROM trade_details td
         LEFT JOIN sale_purchase_matching spm ON td.id = spm.sale_detail_id
         WHERE td.trade_master_id = ?
         GROUP BY td.id, td.product_id, td.quantity, td.unit_price`,
        [req.params.id]
      );
      
      // 기존 품목 맵 채우기
      existingDetails.forEach(d => {
        existingMap.set(d.product_id, d);
      });
      
      // 새 품목 목록과 비교
      for (const newDetail of details) {
        const existing = existingMap.get(newDetail.product_id);
        
        if (!existing) {
          // 새로 추가된 품목 - 매칭 필요
          unmatchedItems.push({
            product_id: newDetail.product_id,
            quantity: newDetail.quantity,
            reason: 'NEW'
          });
        } else if (parseFloat(existing.quantity) !== parseFloat(newDetail.quantity)) {
          // 수량이 변경된 품목 - 매칭 해제 필요
          if (parseFloat(existing.matched_quantity) > 0) {
            // 기존 매칭 해제 및 재고 복원
            const matchingIds = existing.matching_ids ? existing.matching_ids.split(',') : [];
            const inventoryIds = existing.inventory_ids ? existing.inventory_ids.split(',') : [];
            const matchedQtys = existing.matched_quantities ? existing.matched_quantities.split(',') : [];
            
            for (let i = 0; i < matchingIds.length; i++) {
              // 재고 복원
              await connection.query(
                `UPDATE purchase_inventory 
                 SET remaining_quantity = remaining_quantity + ?
                 WHERE id = ?`,
                [parseFloat(matchedQtys[i]), parseInt(inventoryIds[i])]
              );
              // 매칭 삭제
              await connection.query(
                `DELETE FROM sale_purchase_matching WHERE id = ?`,
                [parseInt(matchingIds[i])]
              );
            }
            
            unmatchedItems.push({
              product_id: newDetail.product_id,
              quantity: newDetail.quantity,
              reason: 'QUANTITY_CHANGED',
              oldQuantity: existing.quantity
            });
          }
        }
        // 단가/비고만 변경된 경우: 매칭 유지 (아무것도 안함)
      }
      
      // 삭제된 품목 처리 (기존에 있었는데 새 목록에 없는 것)
      const newProductIds = new Set(details.map(d => d.product_id));
      for (const [productId, existing] of existingMap) {
        if (!newProductIds.has(productId) && parseFloat(existing.matched_quantity) > 0) {
          // 삭제되는 품목의 매칭 해제 및 재고 복원
          const matchingIds = existing.matching_ids ? existing.matching_ids.split(',') : [];
          const inventoryIds = existing.inventory_ids ? existing.inventory_ids.split(',') : [];
          const matchedQtys = existing.matched_quantities ? existing.matched_quantities.split(',') : [];
          
          for (let i = 0; i < matchingIds.length; i++) {
            await connection.query(
              `UPDATE purchase_inventory 
               SET remaining_quantity = remaining_quantity + ?
               WHERE id = ?`,
              [parseFloat(matchedQtys[i]), parseInt(inventoryIds[i])]
            );
            await connection.query(
              `DELETE FROM sale_purchase_matching WHERE id = ?`,
              [parseInt(matchingIds[i])]
            );
          }
        }
      }
    }
    
    // 마스터 수정
    await connection.query(
      `UPDATE trade_masters SET
        trade_date = ?, company_id = ?,
        total_amount = ?, tax_amount = ?, total_price = ?,
        payment_method = ?, notes = ?, status = ?
      WHERE id = ?`,
      [
        master.trade_date,
        master.company_id,
        master.total_amount,
        master.tax_amount,
        master.total_price,
        master.payment_method,
        master.notes,
        master.status,
        req.params.id
      ]
    );
    
    // ★ 변경이 없는 품목의 매칭 정보 보존을 위한 맵 생성
    // (product_id + quantity가 같은 경우 기존 매칭 정보 재사용)
    const preservedMatchings = new Map();
    if (tradeType === 'SALE') {
      for (const [productId, existing] of existingMap) {
        const newDetail = details.find(d => 
          String(d.product_id) === String(productId) && 
          parseFloat(d.quantity) === parseFloat(existing.quantity)
        );
        
        // 같은 품목 + 같은 수량인 경우 매칭 정보 보존
        if (newDetail && parseFloat(existing.matched_quantity) > 0) {
          preservedMatchings.set(String(productId), {
            matchingIds: existing.matching_ids ? existing.matching_ids.split(',') : [],
            inventoryIds: existing.inventory_ids ? existing.inventory_ids.split(',') : [],
            matchedQtys: existing.matched_quantities ? existing.matched_quantities.split(',') : []
          });
        }
      }
    }
    
    // ★ 보존할 매칭 정보 백업
    // (trade_details 삭제 시 before_trade_detail_delete 트리거가 재고를 자동 복원함)
    const matchingsToRestore = [];
    if (tradeType === 'SALE') {
      const [allMatchings] = await connection.query(
        `SELECT spm.*, td.product_id, td.quantity as detail_quantity
         FROM sale_purchase_matching spm
         JOIN trade_details td ON spm.sale_detail_id = td.id
         WHERE td.trade_master_id = ?`,
        [req.params.id]
      );
      
      for (const matching of allMatchings) {
        const preserved = preservedMatchings.get(String(matching.product_id));
        
        if (preserved) {
          matchingsToRestore.push({
            product_id: matching.product_id,
            purchase_inventory_id: matching.purchase_inventory_id,
            matched_quantity: matching.matched_quantity
          });
          // ★ 재고 임시 복원은 하지 않음 - 트리거가 처리함
        }
      }
    }
    
    await connection.query('DELETE FROM trade_details WHERE trade_master_id = ?', [req.params.id]);
    
    // 상세 재등록
    if (details && details.length > 0) {
      for (let i = 0; i < details.length; i++) {
        const detail = details[i];
        const [detailResult] = await connection.query(
          `INSERT INTO trade_details (
            trade_master_id, seq_no, product_id,
            quantity, total_weight, unit_price, supply_amount, tax_amount, total_amount, auction_price, notes,
            shipper_location, sender, purchase_price
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            req.params.id,
            i + 1,
            detail.product_id,
            detail.quantity,
            detail.total_weight || 0,
            detail.unit_price,
            detail.supply_amount || 0,
            detail.tax_amount || 0,
            detail.total_amount || detail.supply_amount || 0,
            detail.auction_price || detail.unit_price || 0,
            detail.notes || '',
            detail.shipper_location || null,
            detail.sender_name || detail.sender || null,
            detail.purchase_price || null
          ]
        );
        
        const trade_detail_id = detailResult.insertId;
        
        // ★ 매출 전표 매칭 처리
        if (tradeType === 'SALE') {
          // 1. 보존된 매칭 정보 확인 (변경 없는 품목 - 우선 처리)
          const restoredMatchings = matchingsToRestore.filter(m => 
            String(m.product_id) === String(detail.product_id)
          );
          
          if (restoredMatchings.length > 0) {
            // 보존된 매칭 복원
            let totalMatched = 0;
            for (const restored of restoredMatchings) {
              await connection.query(
                `INSERT INTO sale_purchase_matching (
                  sale_detail_id, purchase_inventory_id, matched_quantity
                ) VALUES (?, ?, ?)`,
                [trade_detail_id, restored.purchase_inventory_id, restored.matched_quantity]
              );
              
              // ★ 재고 차감 (트리거가 복원한 것을 다시 차감) + 상태 업데이트
              const [invRes] = await connection.query(
                `SELECT remaining_quantity FROM purchase_inventory WHERE id = ?`,
                [restored.purchase_inventory_id]
              );
              const curQty = parseFloat(invRes[0]?.remaining_quantity || 0);
              const updatedQty = curQty - parseFloat(restored.matched_quantity);
              const updatedStatus = updatedQty <= 0 ? 'DEPLETED' : 'AVAILABLE';
              
              await connection.query(
                `UPDATE purchase_inventory 
                 SET remaining_quantity = ?, status = ?
                 WHERE id = ?`,
                [updatedQty, updatedStatus, restored.purchase_inventory_id]
              );
              
              totalMatched += parseFloat(restored.matched_quantity);
              
              // 이미 복원한 매칭은 목록에서 제거 (중복 방지)
              const idx = matchingsToRestore.findIndex(m => 
                m.product_id === restored.product_id && 
                m.purchase_inventory_id === restored.purchase_inventory_id
              );
              if (idx > -1) matchingsToRestore.splice(idx, 1);
            }
            
            // ★ matching_status 업데이트
            const matchingStatus = totalMatched >= parseFloat(detail.quantity) ? 'MATCHED' : 'PARTIAL';
            await connection.query(
              `UPDATE trade_details SET matching_status = ? WHERE id = ?`,
              [matchingStatus, trade_detail_id]
            );
          }
          // 2. 새로운 품목: inventory_id로 매칭 생성 (재고 기반 매출)
          else if (detail.inventory_id) {
            await connection.query(
              `INSERT INTO sale_purchase_matching (
                sale_detail_id, purchase_inventory_id, matched_quantity
              ) VALUES (?, ?, ?)`,
              [trade_detail_id, detail.inventory_id, detail.quantity]
            );
            
            // 현재 재고 수량 조회 후 상태 업데이트
            const [invResult] = await connection.query(
              `SELECT remaining_quantity FROM purchase_inventory WHERE id = ?`,
              [detail.inventory_id]
            );
            const currentQty = parseFloat(invResult[0]?.remaining_quantity || 0);
            const newQty = currentQty - parseFloat(detail.quantity);
            const newStatus = newQty <= 0 ? 'DEPLETED' : 'AVAILABLE';
            
            await connection.query(
              `UPDATE purchase_inventory 
               SET remaining_quantity = ?, status = ?
               WHERE id = ?`,
              [newQty, newStatus, detail.inventory_id]
            );
            
            // ★ matching_status 업데이트 (전량 매칭이므로 MATCHED)
            await connection.query(
              `UPDATE trade_details SET matching_status = 'MATCHED' WHERE id = ?`,
              [trade_detail_id]
            );
          }
        }
      }
    }
    
    await connection.commit();
    
    // 응답에 재매칭 필요 정보 포함
    const response = { 
      success: true, 
      message: '거래전표가 수정되었습니다.'
    };
    
    if (unmatchedItems.length > 0) {
      response.needsRematching = true;
      response.unmatchedItems = unmatchedItems;
      response.message += `\n\n⚠️ ${unmatchedItems.length}개 품목의 재매칭이 필요합니다.`;
    }
    
    res.json(response);
  } catch (error) {
    await connection.rollback();
    console.error('거래전표 수정 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  } finally {
    connection.release();
  }
});

// 거래전표 삭제
router.delete('/:id', async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // 1. 전표 정보 조회 (잔고 복원을 위해 company_id, total_price도 조회)
    const [masters] = await connection.query(
      'SELECT trade_type, company_id, total_price FROM trade_masters WHERE id = ?',
      [req.params.id]
    );
    
    if (masters.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: '거래전표를 찾을 수 없습니다.' });
    }
    
    const tradeType = masters[0].trade_type;
    const companyId = masters[0].company_id;
    const totalPrice = parseFloat(masters[0].total_price) || 0;
    
    // 2. 매입 전표인 경우: 매출과 매칭된 내역이 있는지 확인
    if (tradeType === 'PURCHASE') {
      const [matchedItems] = await connection.query(
        `SELECT 
           p.product_name, 
           p.grade,
           p.weight as product_weight,
           spm.matched_quantity,
           tm_sale.trade_number as sale_trade_number,
           tm_sale.trade_date as sale_date,
           c.company_name as customer_name
         FROM trade_details td
         JOIN purchase_inventory pi ON td.id = pi.trade_detail_id
         JOIN sale_purchase_matching spm ON pi.id = spm.purchase_inventory_id
         JOIN products p ON td.product_id = p.id
         JOIN trade_details td_sale ON spm.sale_detail_id = td_sale.id
         JOIN trade_masters tm_sale ON td_sale.trade_master_id = tm_sale.id
         JOIN companies c ON tm_sale.company_id = c.id
         WHERE td.trade_master_id = ?
         ORDER BY tm_sale.trade_date DESC, tm_sale.trade_number`,
        [req.params.id]
      );
      
      if (matchedItems.length > 0) {
        const totalMatchedQty = matchedItems.reduce((sum, item) => sum + parseFloat(item.matched_quantity), 0);
        
        await connection.rollback();
        return res.status(400).json({ 
          success: false, 
          errorType: 'MATCHING_EXISTS',
          message: '이미 매출과 매칭된 내역이 있어 삭제할 수 없습니다.',
          matchingData: {
            totalCount: matchedItems.length,
            totalQuantity: totalMatchedQty,
            items: matchedItems.map(item => {
              // 중량 포맷: 정수면 소수점 없이, 소수면 소수점 표시
              let weightStr = '';
              if (item.product_weight) {
                const weight = parseFloat(item.product_weight);
                weightStr = ` ${Number.isInteger(weight) ? Math.floor(weight) : weight}kg`;
              }
              return {
                productName: `${item.product_name}${weightStr}${item.grade ? ` (${item.grade})` : ''}`,
                saleTradeNumber: item.sale_trade_number,
                saleDate: item.sale_date ? item.sale_date.toString().split('T')[0] : '-',
                customerName: item.customer_name,
                matchedQuantity: parseFloat(item.matched_quantity)
              };
            })
          }
        });
      }
      
      // 3. 매입 전표: 연관된 purchase_inventory 먼저 삭제
      await connection.query(
        `DELETE FROM purchase_inventory 
         WHERE trade_detail_id IN (SELECT id FROM trade_details WHERE trade_master_id = ?)`,
        [req.params.id]
      );
    }
    
    // 4. 매출 전표인 경우: 연관된 sale_purchase_matching 삭제 및 재고 복원
    if (tradeType === 'SALE') {
      // 매칭된 내역 조회
      const [matchings] = await connection.query(
        `SELECT spm.id, spm.purchase_inventory_id, spm.matched_quantity
         FROM sale_purchase_matching spm
         JOIN trade_details td ON spm.sale_detail_id = td.id
         WHERE td.trade_master_id = ?`,
        [req.params.id]
      );
      
      // 각 매칭에 대해 재고 복원
      for (const matching of matchings) {
        await connection.query(
          `UPDATE purchase_inventory 
           SET remaining_quantity = remaining_quantity + ?,
               status = 'AVAILABLE'
           WHERE id = ?`,
          [matching.matched_quantity, matching.purchase_inventory_id]
        );
      }
      
      // 매칭 기록 삭제
      await connection.query(
        `DELETE FROM sale_purchase_matching 
         WHERE sale_detail_id IN (SELECT id FROM trade_details WHERE trade_master_id = ?)`,
        [req.params.id]
      );
    }
    
    // 5. 연결된 입출금 기록 삭제 (trade_master_id로 연결된 payment_transactions)
    // 5-1. 먼저 해당 payment_transactions의 ID 조회
    const [linkedPayments] = await connection.query(
      `SELECT id, transaction_type, amount, company_id FROM payment_transactions WHERE trade_master_id = ?`,
      [req.params.id]
    );
    
    // 5-2. 연결된 입출금이 있으면 삭제
    for (const payment of linkedPayments) {
      // payment_allocations 삭제
      await connection.query(
        `DELETE FROM payment_allocations WHERE payment_id = ?`,
        [payment.id]
      );
      
      // payment_transactions 삭제
      await connection.query(
        `DELETE FROM payment_transactions WHERE id = ?`,
        [payment.id]
      );
    }
    
    // 6. 전표 삭제 (trade_details는 ON DELETE CASCADE로 자동 삭제)
    const [result] = await connection.query('DELETE FROM trade_masters WHERE id = ?', [req.params.id]);
    
    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: '거래전표를 찾을 수 없습니다.' });
    }
    
    await connection.commit();
    
    const deletedPaymentsCount = linkedPayments.length;
    const message = deletedPaymentsCount > 0 
      ? `거래전표가 삭제되었습니다. (연결된 입출금 ${deletedPaymentsCount}건도 함께 삭제됨)`
      : '거래전표가 삭제되었습니다.';
    res.json({ success: true, message });
  } catch (error) {
    await connection.rollback();
    console.error('거래전표 삭제 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  } finally {
    connection.release();
  }
});

// 통계 - 거래처별 집계
router.get('/stats/by-company', async (req, res) => {
  try {
    const { trade_type, start_date, end_date } = req.query;
    
    let query = `
      SELECT 
        c.id,
        c.company_code,
        c.company_name,
        COUNT(tm.id) as trade_count,
        SUM(tm.total_amount) as total_amount,
        SUM(tm.tax_amount) as tax_amount,
        SUM(tm.total_price) as total_price
      FROM companies c
      LEFT JOIN trade_masters tm ON c.id = tm.company_id
      WHERE 1=1
    `;
    const params = [];
    
    if (trade_type) {
      query += ' AND tm.trade_type = ?';
      params.push(trade_type);
    }
    
    if (start_date) {
      query += ' AND tm.trade_date >= ?';
      params.push(start_date);
    }
    
    if (end_date) {
      query += ' AND tm.trade_date <= ?';
      params.push(end_date);
    }
    
    query += ' GROUP BY c.id HAVING trade_count > 0 ORDER BY total_price DESC';
    
    const [rows] = await db.query(query, params);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('통계 조회 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// 재고 기반 매출 전표 생성 (자동 매칭)
router.post('/sale-from-inventory', async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { master, details } = req.body;
    
    // 동일 거래처 + 동일 날짜 중복 검사
    const [existingTrade] = await connection.query(
      `SELECT id, trade_number FROM trade_masters 
       WHERE company_id = ? AND trade_date = ? AND trade_type = 'SALE' AND status != 'CANCELLED'`,
      [master.company_id, master.trade_date]
    );
    
    if (existingTrade.length > 0) {
      await connection.rollback();
      return res.status(400).json({ 
        success: false, 
        message: `해당 거래처에 동일 날짜의 매출 전표가 이미 존재합니다.\n\n기존 전표번호: ${existingTrade[0].trade_number}\n\n기존 전표를 수정하거나 다른 날짜를 선택해주세요.`,
        existingTradeId: existingTrade[0].id,
        existingTradeNumber: existingTrade[0].trade_number
      });
    }
    
    // 전표번호 생성 (형식: SAL-YYYYMMDD-001 - 일반 전표와 동일)
    const today = master.trade_date.replace(/-/g, '');
    
    const [lastNumber] = await connection.query(
      `SELECT trade_number FROM trade_masters 
       WHERE trade_number LIKE ? 
       ORDER BY trade_number DESC LIMIT 1`,
      [`SAL-${today}-%`]
    );
    
    let seqNo = 1;
    if (lastNumber.length > 0) {
      const lastSeq = parseInt(lastNumber[0].trade_number.split('-')[2]);
      seqNo = lastSeq + 1;
    }
    
    const trade_number = `SAL-${today}-${String(seqNo).padStart(3, '0')}`;
    
    // 합계 계산
    let total_amount = 0;
    for (const detail of details) {
      total_amount += parseFloat(detail.supply_amount) || 0;
    }
    
    // trade_masters 등록
    const [masterResult] = await connection.query(
      `INSERT INTO trade_masters (
        trade_number, trade_date, company_id, trade_type,
        total_amount, tax_amount, total_price, notes, status
      ) VALUES (?, ?, ?, 'SALE', ?, 0, ?, ?, 'CONFIRMED')`,
      [trade_number, master.trade_date, master.company_id, total_amount, total_amount, master.notes || '']
    );
    
    const trade_master_id = masterResult.insertId;
    
    // trade_details 등록 및 매칭 처리
    for (let i = 0; i < details.length; i++) {
      const detail = details[i];
      
      // trade_details 등록 (purchase_price 포함)
      const [detailResult] = await connection.query(
        `INSERT INTO trade_details (
          trade_master_id, seq_no, product_id,
          quantity, total_weight, unit_price, supply_amount, tax_amount, total_amount, auction_price, notes,
          shipper_location, sender, purchase_price
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
        [
          trade_master_id,
          i + 1,
          detail.product_id,
          detail.quantity,
          0,  // total_weight
          detail.unit_price,
          detail.supply_amount,
          detail.supply_amount,  // total_amount
          detail.unit_price,  // auction_price
          detail.notes || '',
          detail.shipper_location || null,
          detail.shipper_name || null,
          detail.purchase_price || null
        ]
      );
      
      const trade_detail_id = detailResult.insertId;
      
      // 재고와 매칭 (inventory_id가 있는 경우)
      if (detail.inventory_id) {
        // sale_purchase_matching 등록
        await connection.query(
          `INSERT INTO sale_purchase_matching (
            sale_detail_id, purchase_inventory_id, matched_quantity
          ) VALUES (?, ?, ?)`,
          [trade_detail_id, detail.inventory_id, detail.quantity]
        );
        
        // purchase_inventory remaining_quantity 감소 및 상태 업데이트
        const [invResult] = await connection.query(
          `SELECT remaining_quantity FROM purchase_inventory WHERE id = ?`,
          [detail.inventory_id]
        );
        const currentQty = parseFloat(invResult[0]?.remaining_quantity || 0);
        const newQty = currentQty - parseFloat(detail.quantity);
        const newStatus = newQty <= 0 ? 'DEPLETED' : 'AVAILABLE';
        
        await connection.query(
          `UPDATE purchase_inventory 
           SET remaining_quantity = ?, status = ?
           WHERE id = ?`,
          [newQty, newStatus, detail.inventory_id]
        );
        
        // ★ matching_status 업데이트 (전량 매칭이므로 MATCHED)
        await connection.query(
          `UPDATE trade_details SET matching_status = 'MATCHED' WHERE id = ?`,
          [trade_detail_id]
        );
      }
    }
    
    await connection.commit();
    
    res.status(201).json({
      success: true,
      message: '매출 전표가 생성되었습니다.',
      data: { id: trade_master_id, trade_number }
    });
    
  } catch (error) {
    await connection.rollback();
    console.error('재고 기반 매출 전표 생성 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  } finally {
    connection.release();
  }
});

module.exports = router;
