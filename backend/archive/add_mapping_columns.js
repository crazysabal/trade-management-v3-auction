const db = require('./config/database');

async function addMappingColumns() {
  try {
    console.log('product_mapping 테이블에 컬럼 추가 중...');
    
    // auction_weight 컬럼 추가
    try {
      await db.query(`
        ALTER TABLE product_mapping 
        ADD COLUMN auction_weight DECIMAL(10,2) DEFAULT NULL AFTER auction_product_name
      `);
      console.log('auction_weight 컬럼 추가 완료');
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        console.log('auction_weight 컬럼이 이미 존재합니다.');
      } else {
        throw err;
      }
    }
    
    // auction_grade 컬럼 추가
    try {
      await db.query(`
        ALTER TABLE product_mapping 
        ADD COLUMN auction_grade VARCHAR(50) DEFAULT NULL AFTER auction_weight
      `);
      console.log('auction_grade 컬럼 추가 완료');
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        console.log('auction_grade 컬럼이 이미 존재합니다.');
      } else {
        throw err;
      }
    }
    
    // 기존 UNIQUE KEY 삭제 후 새로운 복합 UNIQUE KEY 추가
    try {
      // 기존 unique key 삭제 시도
      await db.query(`
        ALTER TABLE product_mapping 
        DROP INDEX auction_product_name
      `);
      console.log('기존 UNIQUE KEY 삭제 완료');
    } catch (err) {
      console.log('기존 UNIQUE KEY가 없거나 이미 삭제됨');
    }
    
    // 새로운 복합 UNIQUE KEY 추가
    try {
      await db.query(`
        ALTER TABLE product_mapping 
        ADD UNIQUE KEY unique_auction_item (auction_product_name, auction_weight, auction_grade)
      `);
      console.log('새로운 복합 UNIQUE KEY 추가 완료');
    } catch (err) {
      if (err.code === 'ER_DUP_KEYNAME') {
        console.log('복합 UNIQUE KEY가 이미 존재합니다.');
      } else {
        throw err;
      }
    }
    
    console.log('마이그레이션 완료!');
    process.exit(0);
  } catch (error) {
    console.error('마이그레이션 오류:', error);
    process.exit(1);
  }
}

addMappingColumns();

