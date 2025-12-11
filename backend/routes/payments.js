const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// ============================================================
// 헬퍼 함수: 전표 찾기 또는 빈 전표 생성
// 모든 입출금은 전표에 연결되어야 함
// ============================================================
async function findOrCreateTrade(connection, {
  company_id,
  trade_date,
  trade_type, // 'SALE' or 'PURCHASE' (RECEIPT→SALE, PAYMENT→PURCHASE)
}) {
  // 1. 해당 날짜에 해당 거래처의 전표가 있는지 확인
  const [existingTrades] = await connection.query(
    `SELECT id, trade_number, total_price FROM trade_masters 
     WHERE company_id = ? AND trade_date = ? AND trade_type = ? AND status != 'CANCELLED'
     ORDER BY id DESC LIMIT 1`,
    [company_id, trade_date, trade_type]
  );
  
  if (existingTrades.length > 0) {
    // 기존 전표가 있으면 반환
    return {
      tradeId: existingTrades[0].id,
      tradeNumber: existingTrades[0].trade_number,
      isNewTrade: false
    };
  }
  
  // 2. 전표가 없으면 빈 전표 생성
  const prefix = trade_type === 'PURCHASE' ? 'PUR' : 'SAL';
  const dateStr = trade_date.replace(/-/g, '');
  
  const [lastNumber] = await connection.query(
    `SELECT trade_number FROM trade_masters 
     WHERE trade_number LIKE ? 
     ORDER BY trade_number DESC LIMIT 1`,
    [`${prefix}-${dateStr}-%`]
  );
  
  let seqNo = 1;
  if (lastNumber.length > 0) {
    const lastSeq = parseInt(lastNumber[0].trade_number.split('-')[2]);
    seqNo = lastSeq + 1;
  }
  
  const tradeNumber = `${prefix}-${dateStr}-${String(seqNo).padStart(3, '0')}`;
  
  // 빈 전표 생성 (total_price = 0)
  const [result] = await connection.query(
    `INSERT INTO trade_masters (
      trade_number, trade_type, trade_date, company_id,
      total_amount, tax_amount, total_price,
      notes, status, created_by
    ) VALUES (?, ?, ?, ?, 0, 0, 0, '입출금 전용 전표', 'CONFIRMED', 'system')`,
    [tradeNumber, trade_type, trade_date, company_id]
  );
  
  return {
    tradeId: result.insertId,
    tradeNumber: tradeNumber,
    isNewTrade: true
  };
}

// 거래처별 잔고 현황 조회 (날짜 기반 계산)
router.get('/balances', async (req, res) => {
  try {
    const { company_type, search, has_balance } = req.query;
    
    // 날짜 기반으로 잔고 계산: 매출합계 - 입금합계 = 미수금, 매입합계 - 출금합계 = 미지급금
    let query = `
      SELECT 
        c.id as company_id,
        c.company_code,
        c.company_name,
        c.company_type_flag,
        c.phone,
        c.contact_person,
        IFNULL((
          SELECT SUM(tm.total_price) 
          FROM trade_masters tm 
          WHERE tm.company_id = c.id AND tm.trade_type = 'SALE' AND tm.status != 'CANCELLED'
        ), 0) - IFNULL((
          SELECT SUM(pt.amount) 
          FROM payment_transactions pt 
          WHERE pt.company_id = c.id AND pt.transaction_type = 'RECEIPT'
        ), 0) as receivable,
        IFNULL((
          SELECT SUM(tm.total_price) 
          FROM trade_masters tm 
          WHERE tm.company_id = c.id AND tm.trade_type = 'PURCHASE' AND tm.status != 'CANCELLED'
        ), 0) - IFNULL((
          SELECT SUM(pt.amount) 
          FROM payment_transactions pt 
          WHERE pt.company_id = c.id AND pt.transaction_type = 'PAYMENT'
        ), 0) as payable,
        (SELECT MAX(tm.trade_date) FROM trade_masters tm WHERE tm.company_id = c.id AND tm.status != 'CANCELLED') as last_transaction_date,
        (SELECT COUNT(*) FROM trade_masters tm WHERE tm.company_id = c.id AND tm.trade_type = 'SALE' AND tm.status != 'CANCELLED') as sale_count,
        (SELECT COUNT(*) FROM trade_masters tm WHERE tm.company_id = c.id AND tm.trade_type = 'PURCHASE' AND tm.status != 'CANCELLED') as purchase_count
      FROM companies c
      WHERE c.is_active = 1
    `;
    
    const params = [];
    
    // 거래처 유형 필터
    if (company_type) {
      if (company_type === 'CUSTOMER') {
        query += ` AND c.company_type_flag IN ('CUSTOMER', 'BOTH')`;
      } else if (company_type === 'SUPPLIER') {
        query += ` AND c.company_type_flag IN ('SUPPLIER', 'BOTH')`;
      }
    }
    
    // 검색어 필터
    if (search) {
      query += ` AND (c.company_name LIKE ? OR c.company_code LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }
    
    query += ` ORDER BY c.company_name`;
    
    let [rows] = await pool.query(query, params);
    
    // net_balance 계산 추가
    rows = rows.map(r => ({
      ...r,
      receivable: parseFloat(r.receivable || 0),
      payable: parseFloat(r.payable || 0),
      net_balance: parseFloat(r.receivable || 0) - parseFloat(r.payable || 0)
    }));
    
    // 잔고 있는 거래처만 필터링 (쿼리 후 필터링)
    if (has_balance === 'true') {
      rows = rows.filter(r => r.receivable > 0 || r.payable > 0);
    }
    
    // 합계 계산
    const summary = {
      totalReceivable: rows.reduce((sum, r) => sum + r.receivable, 0),
      totalPayable: rows.reduce((sum, r) => sum + r.payable, 0),
      totalCompanies: rows.length,
      companiesWithBalance: rows.filter(r => r.receivable > 0 || r.payable > 0).length
    };
    
    res.json({ 
      success: true, 
      data: rows,
      summary
    });
  } catch (error) {
    console.error('잔고 현황 조회 오류:', error);
    res.status(500).json({ success: false, message: '잔고 현황 조회에 실패했습니다.' });
  }
});

// 특정 거래처 잔고 상세 조회 (날짜 기반 계산)
router.get('/balances/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;
    
    // 거래처 정보 및 잔고 (날짜 기반 계산)
    const [companyRows] = await pool.query(`
      SELECT 
        c.*,
        IFNULL((
          SELECT SUM(tm.total_price) 
          FROM trade_masters tm 
          WHERE tm.company_id = c.id AND tm.trade_type = 'SALE' AND tm.status != 'CANCELLED'
        ), 0) - IFNULL((
          SELECT SUM(pt.amount) 
          FROM payment_transactions pt 
          WHERE pt.company_id = c.id AND pt.transaction_type = 'RECEIPT'
        ), 0) as receivable,
        IFNULL((
          SELECT SUM(tm.total_price) 
          FROM trade_masters tm 
          WHERE tm.company_id = c.id AND tm.trade_type = 'PURCHASE' AND tm.status != 'CANCELLED'
        ), 0) - IFNULL((
          SELECT SUM(pt.amount) 
          FROM payment_transactions pt 
          WHERE pt.company_id = c.id AND pt.transaction_type = 'PAYMENT'
        ), 0) as payable,
        (SELECT MAX(tm.trade_date) FROM trade_masters tm WHERE tm.company_id = c.id AND tm.status != 'CANCELLED') as last_transaction_date
      FROM companies c
      WHERE c.id = ?
    `, [companyId]);
    
    if (companyRows.length === 0) {
      return res.status(404).json({ success: false, message: '거래처를 찾을 수 없습니다.' });
    }
    
    // 최근 거래 내역 (매출/매입)
    const [tradeRows] = await pool.query(`
      SELECT 
        tm.id,
        tm.trade_number,
        tm.trade_type,
        tm.trade_date,
        tm.total_price,
        tm.status,
        'TRADE' as transaction_category
      FROM trade_masters tm
      WHERE tm.company_id = ? AND tm.status != 'CANCELLED'
      ORDER BY tm.trade_date DESC, tm.id DESC
      LIMIT 20
    `, [companyId]);
    
    // 최근 입금/출금 내역
    const [paymentRows] = await pool.query(`
      SELECT 
        pt.id,
        pt.transaction_number,
        pt.transaction_type,
        pt.transaction_date,
        pt.amount,
        pt.payment_method,
        pt.notes,
        'PAYMENT' as transaction_category
      FROM payment_transactions pt
      WHERE pt.company_id = ?
      ORDER BY pt.transaction_date DESC, pt.id DESC
      LIMIT 20
    `, [companyId]);
    
    res.json({ 
      success: true, 
      data: {
        company: companyRows[0],
        recentTrades: tradeRows,
        recentPayments: paymentRows
      }
    });
  } catch (error) {
    console.error('거래처 잔고 상세 조회 오류:', error);
    res.status(500).json({ success: false, message: '거래처 잔고 상세 조회에 실패했습니다.' });
  }
});

// 입금/출금 내역 조회
router.get('/transactions', async (req, res) => {
  try {
    const { company_id, start_date, end_date, transaction_type } = req.query;
    
    let query = `
      SELECT 
        pt.*,
        c.company_name,
        c.company_code
      FROM payment_transactions pt
      JOIN companies c ON pt.company_id = c.id
      WHERE 1=1
    `;
    
    const params = [];
    
    if (company_id) {
      query += ` AND pt.company_id = ?`;
      params.push(company_id);
    }
    
    if (start_date) {
      query += ` AND pt.transaction_date >= ?`;
      params.push(start_date);
    }
    
    if (end_date) {
      query += ` AND pt.transaction_date <= ?`;
      params.push(end_date);
    }
    
    if (transaction_type) {
      query += ` AND pt.transaction_type = ?`;
      params.push(transaction_type);
    }
    
    query += ` ORDER BY pt.transaction_date DESC, pt.id DESC`;
    
    const [rows] = await pool.query(query, params);
    
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('입금/출금 내역 조회 오류:', error);
    res.status(500).json({ success: false, message: '입금/출금 내역 조회에 실패했습니다.' });
  }
});

// 거래번호 생성 함수
const generateTransactionNumber = async (connection, transactionDate) => {
  const dateStr = transactionDate.replace(/-/g, '').substring(0, 8);
  const prefix = `PAY-${dateStr}`;
  
  const [rows] = await connection.query(
    `SELECT transaction_number FROM payment_transactions 
     WHERE transaction_number LIKE ? 
     ORDER BY transaction_number DESC LIMIT 1`,
    [`${prefix}-%`]
  );
  
  let sequence = 1;
  if (rows.length > 0) {
    const lastNum = rows[0].transaction_number;
    const lastSeq = parseInt(lastNum.split('-').pop());
    sequence = lastSeq + 1;
  }
  
  return `${prefix}-${String(sequence).padStart(3, '0')}`;
};

// 입금/출금 등록 (모든 입출금은 전표에 연결)
router.post('/transactions', async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const {
      transaction_date,
      company_id,
      transaction_type, // 'RECEIPT' 또는 'PAYMENT'
      amount,
      payment_method,
      bank_name,
      account_number,
      reference_number,
      trade_master_id, // 없으면 자동 생성
      notes
    } = req.body;
    
    // 유효성 검사
    if (!transaction_date || !company_id || !transaction_type || !amount) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: '필수 항목을 입력하세요.' });
    }
    
    if (!['RECEIPT', 'PAYMENT'].includes(transaction_type)) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: '유효하지 않은 거래 유형입니다.' });
    }
    
    // ★ 핵심 변경: 전표가 없으면 찾거나 생성
    let linkedTradeId = trade_master_id;
    let linkedTradeNumber = null;
    let isNewTrade = false;
    
    if (!linkedTradeId) {
      const tradeType = transaction_type === 'RECEIPT' ? 'SALE' : 'PURCHASE';
      
      const tradeInfo = await findOrCreateTrade(connection, {
        company_id,
        trade_date: transaction_date,
        trade_type: tradeType
      });
      
      linkedTradeId = tradeInfo.tradeId;
      linkedTradeNumber = tradeInfo.tradeNumber;
      isNewTrade = tradeInfo.isNewTrade;
    }
    
    // 거래번호 생성
    const transactionNumber = await generateTransactionNumber(connection, transaction_date);
    
    // 입금/출금 내역 등록 (★ trade_master_id는 항상 NOT NULL)
    const [result] = await connection.query(
      `INSERT INTO payment_transactions (
        transaction_number, transaction_date, company_id, transaction_type,
        amount, payment_method, bank_name, account_number, reference_number,
        trade_master_id, notes, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        transactionNumber, transaction_date, company_id, transaction_type,
        amount, payment_method || null, bank_name || null, account_number || null,
        reference_number || null, linkedTradeId, notes || null, 'system'
      ]
    );
    
    await connection.commit();
    
    const responseData = {
      id: result.insertId,
      transaction_number: transactionNumber,
      linked_trade_id: linkedTradeId
    };
    
    if (isNewTrade) {
      responseData.new_trade_created = true;
      responseData.new_trade_number = linkedTradeNumber;
    }
    
    res.json({ 
      success: true, 
      message: isNewTrade 
        ? `${transaction_type === 'RECEIPT' ? '입금' : '출금'}이 처리되었습니다. (빈 전표 ${linkedTradeNumber} 생성됨)`
        : `${transaction_type === 'RECEIPT' ? '입금' : '출금'}이 처리되었습니다.`,
      data: responseData
    });
  } catch (error) {
    await connection.rollback();
    console.error('입금/출금 등록 오류:', error);
    res.status(500).json({ success: false, message: '입금/출금 처리에 실패했습니다.' });
  } finally {
    connection.release();
  }
});

// 입금/출금 삭제 (취소)
router.delete('/transactions/:id', async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { id } = req.params;
    
    // 기존 거래 조회
    const [rows] = await connection.query(
      `SELECT * FROM payment_transactions WHERE id = ?`,
      [id]
    );
    
    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: '거래를 찾을 수 없습니다.' });
    }
    
    const transaction = rows[0];
    
    // 배분 내역 조회 및 전표 업데이트
    const [allocations] = await connection.query(
      `SELECT * FROM payment_allocations WHERE payment_id = ?`,
      [id]
    );
    
    // 각 전표의 paid_amount 차감 및 payment_status 재계산
    for (const alloc of allocations) {
      // paid_amount 차감
      await connection.query(
        `UPDATE trade_masters SET paid_amount = paid_amount - ? WHERE id = ?`,
        [alloc.amount, alloc.trade_master_id]
      );
      
      // payment_status 재계산
      const [tradeRows] = await connection.query(
        `SELECT total_price, paid_amount FROM trade_masters WHERE id = ?`,
        [alloc.trade_master_id]
      );
      
      if (tradeRows.length > 0) {
        const trade = tradeRows[0];
        const newPaidAmount = parseFloat(trade.paid_amount) || 0;
        const totalPrice = parseFloat(trade.total_price) || 0;
        
        let newStatus = 'UNPAID';
        if (newPaidAmount >= totalPrice) {
          newStatus = 'PAID';
        } else if (newPaidAmount > 0) {
          newStatus = 'PARTIAL';
        }
        
        await connection.query(
          `UPDATE trade_masters SET payment_status = ? WHERE id = ?`,
          [newStatus, alloc.trade_master_id]
        );
      }
    }
    
    // 배분 내역 삭제
    await connection.query(
      `DELETE FROM payment_allocations WHERE payment_id = ?`,
      [id]
    );
    
    // 거래 삭제
    await connection.query(`DELETE FROM payment_transactions WHERE id = ?`, [id]);
    
    await connection.commit();
    
    res.json({ 
      success: true, 
      message: `${transaction.transaction_type === 'RECEIPT' ? '입금' : '출금'}이 취소되었습니다.`
    });
  } catch (error) {
    await connection.rollback();
    console.error('입금/출금 삭제 오류:', error);
    res.status(500).json({ success: false, message: '입금/출금 취소에 실패했습니다.' });
  } finally {
    connection.release();
  }
});

// 거래처별 미결제 전표 목록 조회
router.get('/unpaid-trades/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;
    const { trade_type } = req.query; // 'SALE' 또는 'PURCHASE'
    
    let query = `
      SELECT 
        tm.id,
        tm.trade_number,
        tm.trade_type,
        tm.trade_date,
        tm.total_price,
        IFNULL(tm.paid_amount, 0) as paid_amount,
        (tm.total_price - IFNULL(tm.paid_amount, 0)) as unpaid_amount,
        tm.payment_status,
        tm.notes
      FROM trade_masters tm
      WHERE tm.company_id = ? 
        AND tm.status != 'CANCELLED'
        AND tm.payment_status != 'PAID'
    `;
    
    const params = [companyId];
    
    if (trade_type) {
      query += ` AND tm.trade_type = ?`;
      params.push(trade_type);
    }
    
    query += ` ORDER BY tm.trade_date ASC, tm.id ASC`;
    
    const [rows] = await pool.query(query, params);
    
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('미결제 전표 조회 오류:', error);
    res.status(500).json({ success: false, message: '미결제 전표 조회에 실패했습니다.' });
  }
});

// 전표 연결 입금/출금 등록 (모든 입출금은 전표에 연결)
router.post('/transactions-with-allocation', async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const {
      transaction_date,
      company_id,
      transaction_type, // 'RECEIPT' 또는 'PAYMENT'
      amount,
      payment_method,
      notes,
      allocations, // [{ trade_master_id, amount }, ...]
      source_trade_id // 이 입출금이 발생한 원본 전표 ID (없으면 자동 생성)
    } = req.body;
    
    // 유효성 검사
    if (!transaction_date || !company_id || !transaction_type || !amount) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: '필수 항목을 입력하세요.' });
    }
    
    if (!['RECEIPT', 'PAYMENT'].includes(transaction_type)) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: '유효하지 않은 거래 유형입니다.' });
    }
    
    // ★ 핵심 변경: 전표가 없으면 찾거나 생성
    let linkedTradeId = source_trade_id;
    let linkedTradeNumber = null;
    let isNewTrade = false;
    
    if (!linkedTradeId) {
      // 입금(RECEIPT)은 매출(SALE) 전표, 출금(PAYMENT)은 매입(PURCHASE) 전표에 연결
      const tradeType = transaction_type === 'RECEIPT' ? 'SALE' : 'PURCHASE';
      
      const tradeInfo = await findOrCreateTrade(connection, {
        company_id,
        trade_date: transaction_date,
        trade_type: tradeType
      });
      
      linkedTradeId = tradeInfo.tradeId;
      linkedTradeNumber = tradeInfo.tradeNumber;
      isNewTrade = tradeInfo.isNewTrade;
    }
    
    // 배분 금액 합계 검증
    const allocatedTotal = allocations ? allocations.reduce((sum, a) => sum + parseFloat(a.amount || 0), 0) : 0;
    if (allocations && allocations.length > 0 && Math.abs(allocatedTotal - parseFloat(amount)) > 0.01) {
      await connection.rollback();
      return res.status(400).json({ 
        success: false, 
        message: `배분 금액 합계(${allocatedTotal})가 입금 금액(${amount})과 일치하지 않습니다.` 
      });
    }
    
    // 거래번호 생성
    const transactionNumber = await generateTransactionNumber(connection, transaction_date);
    
    // 입금/출금 내역 등록 (★ trade_master_id는 항상 NOT NULL)
    const [result] = await connection.query(
      `INSERT INTO payment_transactions (
        transaction_number, transaction_date, company_id, transaction_type,
        amount, payment_method, trade_master_id, notes, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        transactionNumber, transaction_date, company_id, transaction_type,
        amount, payment_method || null, linkedTradeId, notes || null, 'system'
      ]
    );
    
    const paymentId = result.insertId;
    
    // 전표 배분 처리
    if (allocations && allocations.length > 0) {
      for (const allocation of allocations) {
        if (allocation.amount > 0) {
          // payment_allocations에 배분 내역 저장
          await connection.query(
            `INSERT INTO payment_allocations (payment_id, trade_master_id, amount) VALUES (?, ?, ?)`,
            [paymentId, allocation.trade_master_id, allocation.amount]
          );
          
          // 전표의 paid_amount 업데이트
          await connection.query(
            `UPDATE trade_masters 
             SET paid_amount = IFNULL(paid_amount, 0) + ?,
                 payment_status = CASE 
                   WHEN IFNULL(paid_amount, 0) + ? >= total_price THEN 'PAID'
                   ELSE 'PARTIAL'
                 END
             WHERE id = ?`,
            [allocation.amount, allocation.amount, allocation.trade_master_id]
          );
        }
      }
    }
    
    await connection.commit();
    
    const responseData = {
      id: paymentId,
      transaction_number: transactionNumber,
      allocations_count: allocations ? allocations.length : 0,
      linked_trade_id: linkedTradeId
    };
    
    if (isNewTrade) {
      responseData.new_trade_created = true;
      responseData.new_trade_number = linkedTradeNumber;
    }
    
    res.json({ 
      success: true, 
      message: isNewTrade 
        ? `${transaction_type === 'RECEIPT' ? '입금' : '출금'}이 처리되었습니다. (빈 전표 ${linkedTradeNumber} 생성됨)`
        : `${transaction_type === 'RECEIPT' ? '입금' : '출금'}이 처리되었습니다.`,
      data: responseData
    });
  } catch (error) {
    await connection.rollback();
    console.error('입금/출금 등록 오류:', error);
    res.status(500).json({ success: false, message: '입금/출금 처리에 실패했습니다.' });
  } finally {
    connection.release();
  }
});

// 거래처별 오늘 거래 현황 (전표 등록 화면용)
router.get('/company-today-summary/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;
    const { trade_type, trade_date } = req.query; // 'SALE' 또는 'PURCHASE', 날짜
    
    const targetDate = trade_date || new Date().toISOString().split('T')[0];
    
    // 거래처 정보
    const [companyRows] = await pool.query(
      `SELECT * FROM companies WHERE id = ?`,
      [companyId]
    );
    
    if (companyRows.length === 0) {
      return res.status(404).json({ success: false, message: '거래처를 찾을 수 없습니다.' });
    }
    
    const company = companyRows[0];
    
    // ★ 수정: 날짜 기반 전잔고 계산 (해당 날짜 이전의 모든 거래 기반)
    const paymentType = trade_type === 'SALE' ? 'RECEIPT' : 'PAYMENT';
    
    // 해당 날짜 이전의 거래 합계 (전잔고 계산용)
    const [beforeTradesRows] = await pool.query(
      `SELECT IFNULL(SUM(total_price), 0) as before_total
       FROM trade_masters 
       WHERE company_id = ? 
         AND trade_date < ? 
         AND trade_type = ?
         AND status != 'CANCELLED'`,
      [companyId, targetDate, trade_type]
    );
    const beforeTradeTotal = parseFloat(beforeTradesRows[0].before_total || 0);
    
    // 해당 날짜 이전의 입금/출금 합계
    const [beforePaymentsRows] = await pool.query(
      `SELECT IFNULL(SUM(amount), 0) as before_payment
       FROM payment_transactions 
       WHERE company_id = ? 
         AND transaction_date < ? 
         AND transaction_type = ?`,
      [companyId, targetDate, paymentType]
    );
    const beforePaymentTotal = parseFloat(beforePaymentsRows[0].before_payment || 0);
    
    // 전잔고 = 이전 거래 합계 - 이전 입금 합계
    const previousBalance = beforeTradeTotal - beforePaymentTotal;
    
    // 오늘 거래 합계 (해당 trade_type만)
    const [todayTradesRows] = await pool.query(
      `SELECT IFNULL(SUM(total_price), 0) as today_total
       FROM trade_masters 
       WHERE company_id = ? 
         AND trade_date = ? 
         AND trade_type = ?
         AND status != 'CANCELLED'`,
      [companyId, targetDate, trade_type]
    );
    const todayTotal = parseFloat(todayTradesRows[0].today_total || 0);
    
    // 오늘 입금/출금 합계 (결제방법별)
    const [todayPaymentsRows] = await pool.query(
      `SELECT 
         IFNULL(SUM(amount), 0) as today_payment,
         IFNULL(SUM(CASE WHEN payment_method = '현금' THEN amount ELSE 0 END), 0) as cash_payment,
         IFNULL(SUM(CASE WHEN payment_method = '계좌이체' OR payment_method = '통장' OR payment_method IS NULL THEN amount ELSE 0 END), 0) as bank_payment
       FROM payment_transactions 
       WHERE company_id = ? 
         AND transaction_date = ? 
         AND transaction_type = ?`,
      [companyId, targetDate, paymentType]
    );
    const todayPayment = parseFloat(todayPaymentsRows[0].today_payment || 0);
    const cashPayment = parseFloat(todayPaymentsRows[0].cash_payment || 0);
    const bankPayment = parseFloat(todayPaymentsRows[0].bank_payment || 0);
    
    // 금일 합계 + 전 잔고
    const totalBeforePayment = todayTotal + previousBalance;
    
    // 최종 잔고 (금일 합계 + 전잔고 - 입금)
    const finalBalance = totalBeforePayment - todayPayment;
    
    res.json({ 
      success: true, 
      data: {
        company_id: companyId,
        company_name: company.company_name,
        trade_date: targetDate,
        trade_type: trade_type,
        // 전잔고 (오늘 거래 전)
        previous_balance: previousBalance,
        // 금일 합계
        today_total: todayTotal,
        // 금일합계 + 전잔고
        subtotal: totalBeforePayment,
        // 입금(매출) 또는 출금(매입)
        today_payment: todayPayment,
        // 현금 입금/출금
        cash_payment: cashPayment,
        // 통장 입금/출금
        bank_payment: bankPayment,
        // 최종 잔고
        final_balance: finalBalance
      }
    });
  } catch (error) {
    console.error('거래처 오늘 현황 조회 오류:', error);
    res.status(500).json({ success: false, message: '거래처 현황 조회에 실패했습니다.' });
  }
});

// 거래처별 거래 내역 (매출/매입 + 입금/출금 통합)
router.get('/ledger/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;
    const { start_date, end_date } = req.query;
    
    let dateFilter = '';
    const params = [companyId];
    
    if (start_date) {
      dateFilter += ' AND date >= ?';
      params.push(start_date);
    }
    if (end_date) {
      dateFilter += ' AND date <= ?';
      params.push(end_date);
    }
    
    // 매출/매입과 입금/출금을 합쳐서 조회
    const query = `
      SELECT * FROM (
        -- 매출/매입 거래
        SELECT 
          tm.trade_date as date,
          tm.trade_number as reference,
          CASE tm.trade_type 
            WHEN 'SALE' THEN '매출'
            WHEN 'PURCHASE' THEN '매입'
          END as type,
          CASE tm.trade_type 
            WHEN 'SALE' THEN tm.total_price
            ELSE 0
          END as debit,
          CASE tm.trade_type 
            WHEN 'PURCHASE' THEN tm.total_price
            ELSE 0
          END as credit,
          tm.notes as description,
          tm.created_at
        FROM trade_masters tm
        WHERE tm.company_id = ? AND tm.status != 'CANCELLED' ${dateFilter.replace(/date/g, 'tm.trade_date')}
        
        UNION ALL
        
        -- 입금/출금 거래
        SELECT 
          pt.transaction_date as date,
          pt.transaction_number as reference,
          CASE pt.transaction_type 
            WHEN 'RECEIPT' THEN '입금'
            WHEN 'PAYMENT' THEN '출금'
          END as type,
          CASE pt.transaction_type 
            WHEN 'PAYMENT' THEN pt.amount
            ELSE 0
          END as debit,
          CASE pt.transaction_type 
            WHEN 'RECEIPT' THEN pt.amount
            ELSE 0
          END as credit,
          CONCAT(IFNULL(pt.payment_method, ''), ' ', IFNULL(pt.notes, '')) as description,
          pt.created_at
        FROM payment_transactions pt
        WHERE pt.company_id = ? ${dateFilter.replace(/date/g, 'pt.transaction_date')}
      ) combined
      ORDER BY date DESC, created_at DESC
    `;
    
    // companyId를 두 번 사용하므로 params에 추가
    const fullParams = [...params, companyId, ...(start_date ? [start_date] : []), ...(end_date ? [end_date] : [])];
    
    const [rows] = await pool.query(query, fullParams);
    
    // 거래처 정보
    const [companyRows] = await pool.query(
      `SELECT * FROM companies WHERE id = ?`,
      [companyId]
    );
    
    res.json({ 
      success: true, 
      data: {
        company: companyRows[0],
        transactions: rows
      }
    });
  } catch (error) {
    console.error('거래처 원장 조회 오류:', error);
    res.status(500).json({ success: false, message: '거래처 원장 조회에 실패했습니다.' });
  }
});

// 전표와 연결된 입출금 조회 (직접 연결 + 배분된 입출금만)
router.get('/by-trade/:tradeId', async (req, res) => {
  try {
    const { tradeId } = req.params;
    
    // 전표 존재 여부 확인
    const [tradeInfo] = await pool.query(
      `SELECT id FROM trade_masters WHERE id = ?`,
      [tradeId]
    );
    
    if (tradeInfo.length === 0) {
      return res.json({ success: true, data: [] });
    }
    
    // 1. 전표 등록 시 직접 연결된 입출금 (source_trade_id)
    const [directPayments] = await pool.query(
      `SELECT 
        pt.id,
        pt.transaction_number,
        pt.transaction_date,
        pt.transaction_type,
        pt.amount,
        pt.payment_method,
        pt.notes,
        pt.created_at,
        c.company_name,
        'direct' as link_type,
        pt.amount as allocated_amount
       FROM payment_transactions pt
       JOIN companies c ON pt.company_id = c.id
       WHERE pt.trade_master_id = ?`,
      [tradeId]
    );
    
    // 참고: 배분된 입출금(allocated)과 거래처의 기타 입출금(general)은 표시하지 않음
    //       전표 화면에는 해당 전표에서 직접 등록한 입출금만 표시
    //       거래처 전체 입출금 현황은 수금/지급 관리에서 확인
    
    const allPayments = directPayments
      .sort((a, b) => new Date(b.transaction_date) - new Date(a.transaction_date));
    
    res.json({ success: true, data: allPayments });
  } catch (error) {
    console.error('전표 연결 입출금 조회 오류:', error);
    res.status(500).json({ success: false, message: '조회에 실패했습니다.' });
  }
});

// 입출금 수정 (금액, 결제방법, 비고)
router.put('/transaction/:id', async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { id } = req.params;
    const { amount, payment_method, notes } = req.body;
    
    // 기존 거래 조회
    const [existing] = await connection.query(
      `SELECT * FROM payment_transactions WHERE id = ?`,
      [id]
    );
    
    if (existing.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: '입출금 내역을 찾을 수 없습니다.' });
    }
    
    const oldTransaction = existing[0];
    const amountDiff = parseFloat(amount) - parseFloat(oldTransaction.amount);
    
    // 금액이 변경된 경우 배분 재조정 필요
    if (amountDiff !== 0 && amountDiff < 0) {
      // 금액 감소 시 기존 배분 삭제
      await connection.query(
        `DELETE FROM payment_allocations WHERE payment_id = ?`,
        [id]
      );
    }
    
    // 거래 수정
    await connection.query(
      `UPDATE payment_transactions 
       SET amount = ?, payment_method = ?, notes = ?
       WHERE id = ?`,
      [amount, payment_method, notes, id]
    );
    
    await connection.commit();
    
    res.json({ success: true, message: '입출금 내역이 수정되었습니다.' });
  } catch (error) {
    await connection.rollback();
    console.error('입출금 수정 오류:', error);
    res.status(500).json({ success: false, message: '수정에 실패했습니다.' });
  } finally {
    connection.release();
  }
});

// 입출금 삭제 (잔고 복원 포함)
router.delete('/transaction/:id', async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { id } = req.params;
    
    // 기존 거래 조회
    const [existing] = await connection.query(
      `SELECT * FROM payment_transactions WHERE id = ?`,
      [id]
    );
    
    if (existing.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: '입출금 내역을 찾을 수 없습니다.' });
    }
    
    const transaction = existing[0];
    
    // 배분 삭제
    await connection.query(
      `DELETE FROM payment_allocations WHERE payment_id = ?`,
      [id]
    );
    
    // 거래 삭제
    await connection.query(
      `DELETE FROM payment_transactions WHERE id = ?`,
      [id]
    );
    
    await connection.commit();
    
    res.json({ success: true, message: '입출금 내역이 삭제되었습니다.' });
  } catch (error) {
    await connection.rollback();
    console.error('입출금 삭제 오류:', error);
    res.status(500).json({ success: false, message: '삭제에 실패했습니다.' });
  } finally {
    connection.release();
  }
});

module.exports = router;

