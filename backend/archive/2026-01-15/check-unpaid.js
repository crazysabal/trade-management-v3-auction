const db = require('./config/database');

async function check() {
  try {
    // 매입 전표 목록 (결제 상태 포함)
    const [trades] = await db.query(`
      SELECT id, trade_number, trade_date, trade_type, total_price, 
             IFNULL(paid_amount, 0) as paid_amount,
             total_price - IFNULL(paid_amount, 0) as unpaid_amount,
             payment_status
      FROM trade_masters 
      WHERE trade_type = 'PURCHASE'
      ORDER BY trade_date DESC
    `);
    console.log('=== 매입 전표 목록 ===');
    console.table(trades);

    // 미결제 전표만 (unpaid_amount > 0)
    const [unpaid] = await db.query(`
      SELECT id, trade_number, trade_date, total_price,
             IFNULL(paid_amount, 0) as paid_amount,
             total_price - IFNULL(paid_amount, 0) as unpaid_amount
      FROM trade_masters 
      WHERE trade_type = 'PURCHASE'
        AND (payment_status IS NULL OR payment_status != 'PAID')
        AND total_price > IFNULL(paid_amount, 0)
      ORDER BY trade_date ASC
    `);
    console.log('\n=== 미결제 매입 전표 ===');
    console.table(unpaid);

    process.exit(0);
  } catch (error) {
    console.error('오류:', error.message);
    process.exit(1);
  }
}

check();












