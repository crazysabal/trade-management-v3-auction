const db = require('./config/database');

async function migrateCompanySortOrder() {
  let connection;
  try {
    connection = await db.getConnection();
    console.log('🔄 companies 테이블에 sort_order 컬럼 추가 시작...');

    // 1. sort_order 컬럼이 이미 존재하는지 확인
    const [columns] = await connection.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'companies' 
      AND COLUMN_NAME = 'sort_order'
    `);

    if (columns.length > 0) {
      console.log('   ℹ sort_order 컬럼이 이미 존재합니다.');
    } else {
      // 2. sort_order 컬럼 추가
      await connection.query(
        `ALTER TABLE companies ADD COLUMN sort_order INT NULL DEFAULT NULL`
      );
      console.log('   ✓ sort_order 컬럼 추가 완료');
    }

    // 3. 기존 데이터 sort_order 초기화
    console.log('2. 기존 데이터 sort_order 초기화...');
    const [companies] = await connection.query(`SELECT id FROM companies ORDER BY company_code`);
    let sortOrder = 1;
    for (const company of companies) {
      await connection.query(
        `UPDATE companies SET sort_order = ? WHERE id = ?`,
        [sortOrder, company.id]
      );
      sortOrder++;
    }
    console.log(`   ✓ ${companies.length}개 거래처 sort_order 초기화 완료`);

    console.log('\n✅ 마이그레이션 완료!');
  } catch (error) {
    console.error('❌ 마이그레이션 오류:', error);
  } finally {
    if (connection) connection.release();
    process.exit();
  }
}

migrateCompanySortOrder();






















