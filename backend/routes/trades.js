const express = require('express');
const router = express.Router();
const db = require('../config/database');
const TradeController = require('../controllers/tradeController');

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
    const { company_id, trade_date, trade_type } = req.query;

    if (!company_id || !trade_date || !trade_type) {
      return res.status(400).json({ success: false, message: '필수 파라미터가 누락되었습니다.' });
    }

    // 풀(db)을 커넥션처럼 넘겨서 재사용
    const existingTrade = await TradeController.checkDuplicate(db, req.query);

    // 만약 중복된 전표가 있으면 상세 정보까지 포함해서 응답
    if (existingTrade.length > 0) {
      return res.json({
        success: true,
        isDuplicate: true,
        trade: existingTrade[0],
        existingTradeId: existingTrade[0].id
      });
    }

    res.json({ success: true, isDuplicate: false });
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

        spm.purchase_inventory_id as matched_inventory_id,
        spm.matched_quantity,
        pi.remaining_quantity as inventory_remaining, -- 현재 재고 잔량 (검증용)
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
// 거래전표 등록
router.post('/', async (req, res) => {
  try {
    const result = await TradeController.createTrade(req.body);
    res.status(201).json(result);
  } catch (error) {
    if (error.status) {
      // 컨트롤러에서 발생시킨 비즈니스 로직 에러
      res.status(error.status).json({
        success: false,
        message: error.message,
        data: error.data
      });
    } else {
      // 예상치 못한 서버 에러
      console.error('거래전표 등록 오류:', error);
      res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
  }
});

// 거래전표 수정
router.put('/:id', async (req, res) => {
  try {
    const result = await TradeController.updateTrade(req.params.id, req.body);
    res.json(result);
  } catch (error) {
    if (error.status) {
      // 컨트롤러에서 발생시킨 비즈니스 로직 에러
      res.status(error.status).json({
        success: false,
        message: error.message,
        errorType: error.errorType,
        matchingData: error.matchingData,
        existingTradeId: error.data?.existingTradeId,
        existingTradeNumber: error.data?.existingTradeNumber
      });
    } else {
      // 예상치 못한 서버 에러
      console.error('거래전표 수정 오류:', error);
      res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
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
             td.seq_no,
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
           ORDER BY td.seq_no ASC, tm_sale.trade_date DESC`,
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
                seqNo: item.seq_no,
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

      // [NEW] 생산 투입 내역 확인
      const [usedInProduction] = await connection.query(
        `SELECT 
           p.product_name,
           p.grade,
           p.weight as product_weight,
           ipi.used_quantity,
           ip.created_at as production_date,
           ip.id as production_id
         FROM trade_details td
         JOIN purchase_inventory pi ON td.id = pi.trade_detail_id
         JOIN inventory_production_ingredients ipi ON pi.id = ipi.used_inventory_id
         JOIN inventory_productions ip ON ipi.production_id = ip.id
         JOIN products p ON td.product_id = p.id
         WHERE td.trade_master_id = ?`,
        [req.params.id]
      );

      if (usedInProduction.length > 0) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: `이미 생산(재포장)에 사용된 재고가 포함되어 있어 삭제할 수 없습니다. (총 ${usedInProduction.length}건)`
        });
      }

      // [NEW] 실사(Audit) 포함 여부 확인
      const [auditItems] = await connection.query(
        `SELECT ia.id as audit_id, ia.status, iai.id as audit_item_id
         FROM trade_details td
         JOIN purchase_inventory pi ON td.id = pi.trade_detail_id
         JOIN inventory_audit_items iai ON pi.id = iai.inventory_id
         JOIN inventory_audits ia ON iai.audit_id = ia.id
         WHERE td.trade_master_id = ?`,
        [req.params.id]
      );

      // 완료된 실사에 포함된 경우 삭제 불가
      const completedAudits = auditItems.filter(item => item.status === 'COMPLETED');
      if (completedAudits.length > 0) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: `이미 완료된 실사(Audit ID: ${completedAudits[0].audit_id})에 포함된 재고가 있어 삭제할 수 없습니다.`
        });
      }

      // 진행 중인 실사에 포함된 경우 -> 실사 항목을 먼저 삭제 (Smart Cascade)
      if (auditItems.length > 0) {
        const auditItemIds = auditItems.map(item => item.audit_item_id);
        await connection.query(
          `DELETE FROM inventory_audit_items WHERE id IN (?)`,
          [auditItemIds]
        );
      }

      // 3-0. 매입 전표: 연관된 purchase_inventory의 이력(adjustments) 먼저 삭제
      await connection.query(
        `DELETE FROM inventory_adjustments 
         WHERE purchase_inventory_id IN (
            SELECT id FROM purchase_inventory 
            WHERE trade_detail_id IN (SELECT id FROM trade_details WHERE trade_master_id = ?)
         )`,
        [req.params.id]
      );

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
