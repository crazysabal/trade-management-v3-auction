const db = require('./config/database');

async function clearAuctionNotes() {
  try {
    console.log('낙찰 매입 전표의 비고란 정리 중...');
    
    // 입하번호 패턴이 있는 trade_details의 notes 비우기
    const [result] = await db.query(`
      UPDATE trade_details 
      SET notes = '' 
      WHERE notes LIKE '%입하번호:%'
    `);
    
    console.log(`정리된 행 수: ${result.affectedRows}건`);
    
    // 확인
    const [remaining] = await db.query(`
      SELECT COUNT(*) as cnt FROM trade_details WHERE notes LIKE '%입하번호:%'
    `);
    console.log(`남은 입하번호 패턴 비고: ${remaining[0].cnt}건`);
    
    console.log('완료!');
    process.exit(0);
  } catch (error) {
    console.error('오류:', error.message);
    process.exit(1);
  }
}

clearAuctionNotes();
















