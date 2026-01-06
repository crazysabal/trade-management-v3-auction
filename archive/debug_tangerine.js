const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'backend', '.env') });
const db = require('./backend/config/database');

async function debugProducts() {
    try {
        console.log('--- 천혜향 관련 품목 분석 ---');
        const [rows] = await db.query("SELECT id, product_name, category, grade, weight FROM products WHERE product_name LIKE '%천혜향%'");
        console.log(`발견된 품목 수: ${rows.length}`);
        rows.forEach(row => {
            console.log(`ID: ${row.id} | 품목명: [${row.product_name}] | 카테고리: [${row.category}] | 등급: [${row.grade}] | 중량: [${row.weight}]`);
        });
    } catch (e) {
        console.error('분석 오류:', e);
    } finally {
        process.exit();
    }
}

debugProducts();
