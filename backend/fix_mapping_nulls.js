const db = require('./config/database');

async function fixMappingNulls() {
  try {
    console.log('매핑 데이터의 NULL 값을 빈 문자열로 변환 중...');
    
    // auction_weight NULL -> ''
    const [result1] = await db.query(
      `UPDATE product_mapping SET auction_weight = '' WHERE auction_weight IS NULL`
    );
    console.log(`auction_weight 변환: ${result1.affectedRows}건`);
    
    // auction_grade NULL -> ''
    const [result2] = await db.query(
      `UPDATE product_mapping SET auction_grade = '' WHERE auction_grade IS NULL`
    );
    console.log(`auction_grade 변환: ${result2.affectedRows}건`);
    
    // 컬럼 타입을 VARCHAR로 변경 (DECIMAL -> VARCHAR for weight)
    try {
      await db.query(
        `ALTER TABLE product_mapping MODIFY COLUMN auction_weight VARCHAR(20) NOT NULL DEFAULT ''`
      );
      console.log('auction_weight 컬럼 타입 변경 완료');
    } catch (err) {
      console.log('auction_weight 컬럼 타입 변경 건너뜀:', err.message);
    }
    
    try {
      await db.query(
        `ALTER TABLE product_mapping MODIFY COLUMN auction_grade VARCHAR(50) NOT NULL DEFAULT ''`
      );
      console.log('auction_grade 컬럼 타입 변경 완료');
    } catch (err) {
      console.log('auction_grade 컬럼 타입 변경 건너뜀:', err.message);
    }
    
    console.log('마이그레이션 완료!');
    process.exit(0);
  } catch (error) {
    console.error('마이그레이션 오류:', error);
    process.exit(1);
  }
}

fixMappingNulls();



















