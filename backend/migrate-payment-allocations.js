// 전표-입금 연결 테이블 마이그레이션 스크립트
const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrate() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'trade_management',
    port: process.env.DB_PORT || 3306,
    multipleStatements: true
  });

  console.log('✓ 데이터베이스 연결 성공');

  try {
    // 1. payment_allocations 테이블 생성 (입금/출금과 전표 연결)
    console.log('1. payment_allocations 테이블 생성...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS payment_allocations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        payment_id INT NOT NULL COMMENT '입금/출금 거래 ID',
        trade_master_id INT NOT NULL COMMENT '연결된 전표 ID',
        amount DECIMAL(15,2) NOT NULL COMMENT '이 전표에 배분된 금액',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (payment_id) REFERENCES payment_transactions(id) ON DELETE CASCADE,
        FOREIGN KEY (trade_master_id) REFERENCES trade_masters(id) ON DELETE CASCADE,
        INDEX idx_payment_id (payment_id),
        INDEX idx_trade_master_id (trade_master_id),
        UNIQUE KEY unique_payment_trade (payment_id, trade_master_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('   ✓ payment_allocations 테이블 생성 완료');

    // 2. trade_masters 테이블에 결제 관련 컬럼 추가
    console.log('2. trade_masters 테이블에 결제 컬럼 추가...');
    
    // paid_amount 컬럼 존재 여부 확인
    const [columns] = await connection.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'trade_masters' AND COLUMN_NAME = 'paid_amount'
    `, [process.env.DB_NAME || 'trade_management']);

    if (columns.length === 0) {
      await connection.query(`
        ALTER TABLE trade_masters 
        ADD COLUMN paid_amount DECIMAL(15,2) DEFAULT 0 COMMENT '결제된 금액',
        ADD COLUMN payment_status ENUM('UNPAID', 'PARTIAL', 'PAID') DEFAULT 'UNPAID' COMMENT '결제 상태'
      `);
      console.log('   ✓ paid_amount, payment_status 컬럼 추가 완료');
    } else {
      console.log('   - 컬럼이 이미 존재합니다. 건너뜀.');
    }

    // 3. 기존 전표들의 결제 상태를 UNPAID로 설정
    console.log('3. 기존 전표 결제 상태 초기화...');
    await connection.query(`
      UPDATE trade_masters 
      SET paid_amount = 0, payment_status = 'UNPAID'
      WHERE paid_amount IS NULL OR payment_status IS NULL
    `);
    console.log('   ✓ 기존 전표 결제 상태 초기화 완료');

    // 결과 확인
    const [unpaidTrades] = await connection.query(`
      SELECT 
        trade_type,
        COUNT(*) as count,
        SUM(total_price) as total_amount
      FROM trade_masters
      WHERE payment_status = 'UNPAID' AND status != 'CANCELLED'
      GROUP BY trade_type
    `);

    console.log('\n========================================');
    console.log('✅ 마이그레이션 완료!');
    console.log('========================================');
    console.log('\n미결제 전표 현황:');
    unpaidTrades.forEach(t => {
      const type = t.trade_type === 'SALE' ? '매출' : '매입';
      console.log(`   - ${type}: ${t.count}건, ${Number(t.total_amount).toLocaleString()}원`);
    });

  } catch (error) {
    console.error('마이그레이션 실패:', error.message);
    throw error;
  } finally {
    await connection.end();
  }
}

migrate()
  .then(() => {
    console.log('\n프로그램을 종료합니다.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('오류 발생:', err);
    process.exit(1);
  });













