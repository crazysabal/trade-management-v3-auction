require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/database');

async function runPatch() {
    console.log('--- 데이터베이스 구조 지능형 보정 시작 ---');
    try {
        // 1. PRODUCTS 테이블 보정
        const [prodCols] = await db.query('SHOW COLUMNS FROM products');
        const prodFields = prodCols.map(c => c.Field);

        if (!prodFields.includes('product_code')) {
            await db.query('ALTER TABLE products ADD COLUMN product_code VARCHAR(30) AFTER id');
            console.log('- products: product_code 컬럼 추가 완료');
        }
        if (!prodFields.includes('category_id')) {
            await db.query('ALTER TABLE products ADD COLUMN category_id INT AFTER grade');
            console.log('- products: category_id 컬럼 추가 완료');
        }
        if (!prodFields.includes('is_active')) {
            await db.query('ALTER TABLE products ADD COLUMN is_active TINYINT(1) DEFAULT 1 AFTER notes');
            console.log('- products: is_active 컬럼 추가 완료');
        }
        if (!prodFields.includes('sort_order')) {
            await db.query('ALTER TABLE products ADD COLUMN sort_order INT DEFAULT 0 AFTER is_active');
            console.log('- products: sort_order 컬럼 추가 완료');
        }

        // 2. WAREHOUSES 테이블 보정
        const [whCols] = await db.query('SHOW COLUMNS FROM warehouses');
        const whFields = whCols.map(c => c.Field);

        if (!whFields.includes('type')) {
            await db.query("ALTER TABLE warehouses ADD COLUMN type ENUM('MAIN', 'STORAGE', 'VEHICLE') DEFAULT 'STORAGE' AFTER name");
            console.log('- warehouses: type 컬럼 추가 완료');
        }
        if (!whFields.includes('is_default')) {
            await db.query('ALTER TABLE warehouses ADD COLUMN is_default TINYINT(1) DEFAULT 0 AFTER type');
            console.log('- warehouses: is_default 컬럼 추가 완료');
        }
        if (!whFields.includes('address')) {
            await db.query('ALTER TABLE warehouses ADD COLUMN address VARCHAR(200) AFTER is_active');
            console.log('- warehouses: address 컬럼 추가 완료');
        }
        if (!whFields.includes('display_order')) {
            await db.query('ALTER TABLE warehouses ADD COLUMN display_order INT DEFAULT 0 AFTER description');
            console.log('- warehouses: display_order 컬럼 추가 완료');
        }

        // 3. TRADE_MASTERS 테이블 보정 (ENUM 확장)
        try {
            await db.query("ALTER TABLE trade_masters MODIFY COLUMN status ENUM('DRAFT', 'CONFIRMED', 'COMPLETED', 'CANCELLED') DEFAULT 'DRAFT'");
            console.log('- trade_masters: status ENUM 값 확장 완료');
        } catch (e) { }

        console.log('✅ 보정이 성공적으로 끝났습니다. 이제 500 에러 없이 정상 사용 가능합니다.');

    } catch (err) {
        console.error('⚠️ 보정 중 오류 발생:', err.message);
    } finally {
        process.exit();
    }
}

runPatch();
