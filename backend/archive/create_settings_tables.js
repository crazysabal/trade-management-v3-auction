const db = require('./config/database');

async function createSettingsTables() {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();
        console.log('Starting migration: Create settings tables...');

        // 1. payment_methods 테이블 생성
        console.log('Creating payment_methods table...');
        await connection.query(`
      CREATE TABLE IF NOT EXISTS payment_methods (
        id INT AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(50) NOT NULL UNIQUE,
        name VARCHAR(50) NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

        // 2. system_settings 테이블 생성
        console.log('Creating system_settings table...');
        await connection.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        setting_key VARCHAR(100) PRIMARY KEY,
        setting_value TEXT,
        description VARCHAR(255),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

        // 3. 초기 결제 방법 데이터 삽입 (기존 데이터가 없을 경우에만)
        console.log('Checking for existing payment methods...');
        const [existingMethods] = await connection.query('SELECT COUNT(*) as count FROM payment_methods');

        if (existingMethods[0].count === 0) {
            console.log('Inserting default payment methods...');
            const defaultMethods = [
                ['CASH', '현금', 1, 10],
                ['BANK', '계좌이체', 1, 20],
                ['CARD', '카드', 1, 30],
                ['NOTE', '어음', 1, 40],
                ['OFFSET', '상계(차감)', 1, 50]
            ];

            await connection.query(
                'INSERT INTO payment_methods (code, name, is_active, sort_order) VALUES ?',
                [defaultMethods]
            );
        } else {
            console.log('Payment methods already exist. Skipping insertion.');
        }

        await connection.commit();
        console.log('Migration completed successfully.');

    } catch (error) {
        await connection.rollback();
        console.error('Migration failed:', error);
        process.exit(1);
    } finally {
        connection.release();
        process.exit(0);
    }
}

createSettingsTables();
