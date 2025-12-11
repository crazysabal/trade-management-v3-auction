const db = require('./config/database');

async function fix() {
  try {
    console.log('=== 날짜 수정 ===');
    
    // 전표번호에 20251207이 포함된 전표의 날짜를 2025-12-07로 수정
    const [result] = await db.query(
      "UPDATE trade_masters SET trade_date = '2025-12-07' WHERE trade_number LIKE '%20251207%'"
    );
    console.log('수정된 레코드:', result.affectedRows);
    
    // 수정 후 확인
    const [trades] = await db.query('SELECT trade_number, trade_date FROM trade_masters');
    console.log('수정 후:', trades);
    
    process.exit(0);
  } catch (error) {
    console.error('오류:', error.message);
    process.exit(1);
  }
}

fix();
















