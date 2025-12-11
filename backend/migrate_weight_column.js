const db = require('./config/database');

async function migrate() {
  try {
    console.log('🔄 컬럼명 변경 및 sort_order 컬럼 추가 시작...');

    // 1. box_weight → weight 컬럼명 변경
    console.log('1. box_weight → weight 컬럼명 변경...');
    try {
      await db.query(`ALTER TABLE products CHANGE COLUMN box_weight weight DECIMAL(10,2) NULL`);
      console.log('   ✓ box_weight → weight 변경 완료');
    } catch (err) {
      if (err.code === 'ER_BAD_FIELD_ERROR') {
        console.log('   ℹ️ box_weight 컬럼이 없습니다. weight 컬럼 확인...');
        // weight 컬럼이 이미 있는지 확인
        const [columns] = await db.query(`SHOW COLUMNS FROM products LIKE 'weight'`);
        if (columns.length > 0) {
          console.log('   ✓ weight 컬럼이 이미 존재합니다.');
        } else {
          await db.query(`ALTER TABLE products ADD COLUMN weight DECIMAL(10,2) NULL`);
          console.log('   ✓ weight 컬럼 추가 완료');
        }
      } else {
        throw err;
      }
    }

    // 2. sort_order 컬럼 추가
    console.log('2. sort_order 컬럼 추가...');
    try {
      await db.query(`ALTER TABLE products ADD COLUMN sort_order INT DEFAULT 0`);
      console.log('   ✓ sort_order 컬럼 추가 완료');
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        console.log('   ℹ️ sort_order 컬럼이 이미 존재합니다.');
      } else {
        throw err;
      }
    }

    // 3. 기존 데이터에 sort_order 초기값 설정 (id 순서대로)
    console.log('3. 기존 데이터 sort_order 초기화...');
    await db.query(`
      UPDATE products p
      JOIN (
        SELECT id, ROW_NUMBER() OVER (ORDER BY product_name, grade) as rn
        FROM products
      ) t ON p.id = t.id
      SET p.sort_order = t.rn
    `);
    console.log('   ✓ sort_order 초기화 완료');

    console.log('\n✅ 마이그레이션 완료!');
    process.exit(0);
  } catch (error) {
    console.error('❌ 마이그레이션 오류:', error);
    process.exit(1);
  }
}

migrate();





















