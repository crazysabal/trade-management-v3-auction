const db = require('./backend/config/database');

async function migrate() {
    try {
        console.log('마이그레이션 시작: trade_details 테이블에 parent_detail_id 추가...');

        // 1. 컬럼 추가
        await db.query(`
            ALTER TABLE trade_details 
            ADD COLUMN parent_detail_id INT NULL 
            AFTER product_id;
        `);
        console.log('- parent_detail_id 컬럼 추가 완료');

        // 2. 외래키 추가 (자기 참조)
        await db.query(`
            ALTER TABLE trade_details 
            ADD CONSTRAINT fk_trade_details_parent 
            FOREIGN KEY (parent_detail_id) REFERENCES trade_details(id) 
            ON DELETE SET NULL;
        `);
        console.log('- parent_detail_id 외래키 제약 조건 추가 완료');

        console.log('마이그레이션 성공!');
        process.exit(0);
    } catch (error) {
        console.error('마이그레이션 실패:', error.message);
        process.exit(1);
    }
}

migrate();
