// payment_allocations 테이블 기준으로 전표의 paid_amount와 payment_status를 재계산하는 스크립트
const pool = require('./config/database');

async function resetPaymentStatus() {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    console.log('전표 결제 상태 재계산 시작...');
    
    // 모든 전표의 paid_amount를 payment_allocations 기준으로 재계산
    const [trades] = await connection.query(`
      SELECT id, total_price FROM trade_masters
    `);
    
    console.log(`총 ${trades.length}개 전표 처리 중...`);
    
    for (const trade of trades) {
      // 해당 전표에 연결된 allocation 합계 조회
      const [allocSum] = await connection.query(`
        SELECT IFNULL(SUM(amount), 0) as total_paid
        FROM payment_allocations
        WHERE trade_master_id = ?
      `, [trade.id]);
      
      const totalPaid = parseFloat(allocSum[0].total_paid) || 0;
      const totalPrice = parseFloat(trade.total_price) || 0;
      
      // payment_status 계산
      let status = 'UNPAID';
      if (totalPaid >= totalPrice && totalPrice > 0) {
        status = 'PAID';
      } else if (totalPaid > 0) {
        status = 'PARTIAL';
      }
      
      // 업데이트
      await connection.query(`
        UPDATE trade_masters 
        SET paid_amount = ?, payment_status = ?
        WHERE id = ?
      `, [totalPaid, status, trade.id]);
      
      console.log(`전표 ID ${trade.id}: paid_amount = ${totalPaid}, status = ${status}`);
    }
    
    await connection.commit();
    console.log('\n완료! 전표 결제 상태가 재계산되었습니다.');
    process.exit(0);
  } catch (error) {
    await connection.rollback();
    console.error('오류 발생:', error);
    process.exit(1);
  } finally {
    connection.release();
  }
}

resetPaymentStatus();












