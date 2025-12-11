const db = require('./config/database');

async function fix() {
  try {
    // payment_status 재계산
    const [result] = await db.query(`
      UPDATE trade_masters 
      SET payment_status = CASE 
        WHEN IFNULL(paid_amount, 0) >= total_price THEN 'PAID'
        WHEN IFNULL(paid_amount, 0) > 0 THEN 'PARTIAL'
        ELSE NULL
      END
    `);
    
    console.log(`payment_status 정리 완료: ${result.affectedRows}건 업데이트`);
    
    // 결과 확인
    const [trades] = await db.query(`
      SELECT id, trade_number, total_price, 
             IFNULL(paid_amount, 0) as paid_amount,
             total_price - IFNULL(paid_amount, 0) as unpaid_amount,
             payment_status
      FROM trade_masters 
      ORDER BY id DESC LIMIT 5
    `);
    console.log('\n=== 정리 후 전표 상태 ===');
    console.table(trades);
    
    process.exit(0);
  } catch (error) {
    console.error('오류:', error.message);
    process.exit(1);
  }
}

fix();
