/**
 * v1.0.27 - inventory_transactions 테이블에 notes 컬럼 누락 방지 패치
 * 증상: "Unknown column 'notes' in 'field list'" 에러 해결
 */
module.exports = async (db) => {
    console.log('--- [v1.0.27 Migration] inventory_transactions 컬럼 보정 시작 ---');

    try {
        const [columns] = await db.query("SHOW COLUMNS FROM inventory_transactions LIKE 'notes'");

        if (columns.length === 0) {
            console.log('[Migration] notes 컬럼이 없어 추가합니다.');
            await db.query("ALTER TABLE inventory_transactions ADD COLUMN notes TEXT NULL AFTER created_by");
        } else {
            console.log('[Migration] notes 컬럼이 이미 존재합니다.');
        }

        console.log('✅ [v1.0.27 Migration] 완료');
    } catch (err) {
        console.error('❌ [v1.0.27 Migration] 실패:', err.message);
        throw err;
    }
};
