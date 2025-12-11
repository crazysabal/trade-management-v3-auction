const db = require('./config/database');

async function check() {
  try {
    const [details] = await db.query(`
      SELECT 
        td.id, 
        td.seq_no, 
        td.quantity, 
        td.matching_status, 
        tm.trade_number,
        tm.id as trade_master_id
      FROM trade_details td 
      JOIN trade_masters tm ON td.trade_master_id = tm.id 
      WHERE tm.trade_type = 'SALE' 
      ORDER BY tm.id, td.seq_no
    `);
    
    console.log('=== 매출 품목 목록 ===');
    console.log('품목 수:', details.length);
    details.forEach(d => console.log(d));
    
    // API와 동일한 쿼리로 확인
    const [trades] = await db.query(`
      SELECT 
        tm.id as trade_master_id,
        tm.trade_number,
        COUNT(td.id) as item_count,
        SUM(CASE WHEN td.matching_status = 'PENDING' THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN td.matching_status = 'PARTIAL' THEN 1 ELSE 0 END) as partial_count,
        SUM(CASE WHEN td.matching_status = 'MATCHED' THEN 1 ELSE 0 END) as matched_count
      FROM trade_masters tm
      JOIN trade_details td ON td.trade_master_id = tm.id
      WHERE tm.trade_type = 'SALE'
      GROUP BY tm.id, tm.trade_number
    `);
    
    console.log('\n=== 전표별 품목 수 ===');
    trades.forEach(t => console.log(t));
    
    process.exit(0);
  } catch (error) {
    console.error('오류:', error.message);
    process.exit(1);
  }
}

check();















