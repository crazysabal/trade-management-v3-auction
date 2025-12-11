const db = require('./config/database');

async function runMigration() {
  try {
    console.log('마이그레이션 시작...');
    
    // address2 컬럼이 이미 있는지 확인
    const [columns] = await db.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = 'trade_management' 
        AND TABLE_NAME = 'company_info' 
        AND COLUMN_NAME = 'address2'
    `);
    
    if (columns.length > 0) {
      console.log('address2 컬럼이 이미 존재합니다.');
    } else {
      await db.query(`
        ALTER TABLE company_info 
        ADD COLUMN address2 VARCHAR(200) NULL AFTER address
      `);
      console.log('✅ address2 컬럼 추가 완료!');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('마이그레이션 오류:', error);
    process.exit(1);
  }
}

runMigration();










