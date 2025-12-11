// 전표 상태 확인 스크립트
const pool = require('./config/database');

async function checkTrades() {
  try {
    console.log('전표 상태 확인...');
    
    const [rows] = await pool.query(`
      SELECT id, trade_number, company_id, total_price, 
             IFNULL(paid_amount, 0) as paid_amount, 
             payment_status
      FROM trade_masters
      WHERE company_id = 7
      ORDER BY id
    `);
    
    console.log('\n=== 리치마트(company_id=7) 전표 목록 ===');
    for (const trade of rows) {
      console.log(`ID: ${trade.id}, ${trade.trade_number}, total: ${trade.total_price}, paid: ${trade.paid_amount}, status: ${trade.payment_status}`);
    }
    
    // payment_allocations 확인
    const [allocs] = await pool.query(`SELECT * FROM payment_allocations`);
    console.log('\n=== payment_allocations 테이블 ===');
    console.log(allocs);
    
    process.exit(0);
  } catch (error) {
    console.error('오류 발생:', error);
    process.exit(1);
  }
}

checkTrades();












