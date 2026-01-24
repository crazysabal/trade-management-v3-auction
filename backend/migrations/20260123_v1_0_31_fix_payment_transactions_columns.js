/**
 * v1.0.31 - payment_transactions 테이블 컬럼 보정 패치
 * 증상: "Unknown column 'created_by' in 'field list'" 에러 해결
 * 추가항목: bank_name, account_number, reference_number, created_by
 */
module.exports = async (db) => {
    console.log('--- [v1.0.31 Migration] payment_transactions 컬럼 보정 시작 ---');

    const columnsToAdd = [
        { name: 'bank_name', type: 'VARCHAR(50) NULL AFTER payment_method' },
        { name: 'account_number', type: 'VARCHAR(50) NULL AFTER bank_name' },
        { name: 'reference_number', type: 'VARCHAR(50) NULL AFTER account_number' },
        { name: 'created_by', type: "VARCHAR(50) DEFAULT 'system' AFTER notes" }
    ];

    try {
        for (const col of columnsToAdd) {
            const [rows] = await db.query(`SHOW COLUMNS FROM payment_transactions LIKE '${col.name}'`);
            if (rows.length === 0) {
                console.log(`[Migration] ${col.name} 컬럼이 없어 추가합니다.`);
                await db.query(`ALTER TABLE payment_transactions ADD COLUMN ${col.name} ${col.type}`);
            } else {
                console.log(`[Migration] ${col.name} 컬럼이 이미 존재합니다.`);
            }
        }

        console.log('✅ [v1.0.31 Migration] 완료');
    } catch (err) {
        console.error('❌ [v1.0.31 Migration] 실패:', err.message);
        throw err;
    }
};
