const fs = require('fs');
const path = require('path');
const db = require('../config/database');

/**
 * MigrationRunner
 * 증분 DB 마이그레이션을 관리하고 실행합니다.
 */
class MigrationRunner {
    constructor() {
        this.migrationsDir = path.join(__dirname, '../migrations');
        if (!fs.existsSync(this.migrationsDir)) {
            fs.mkdirSync(this.migrationsDir, { recursive: true });
        }
    }

    async init() {
        console.log('[Migration] 초기화 중...');
        // 마이그레이션 이력 테이블 생성
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS _migrations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                filename VARCHAR(255) NOT NULL UNIQUE,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB;
        `;
        await db.query(createTableQuery);
    }

    async run() {
        await this.init();

        const files = fs.readdirSync(this.migrationsDir)
            .filter(f => f.endsWith('.sql') || f.endsWith('.js'))
            .sort();

        // 이미 적용된 마이그레이션 확인
        const [rows] = await db.query('SELECT filename FROM _migrations');
        const appliedFiles = new Set(rows.map(r => r.filename));

        let count = 0;
        for (const file of files) {
            if (!appliedFiles.has(file)) {
                console.log(`[Migration] 적용 중: ${file}`);
                try {
                    if (file.endsWith('.sql')) {
                        await this.runSqlFile(file);
                    } else if (file.endsWith('.js')) {
                        await this.runJsFile(file);
                    }

                    // 이력 기록
                    await db.query('INSERT INTO _migrations (filename) VALUES (?)', [file]);
                    count++;
                } catch (error) {
                    console.error(`❌ [Migration] 실패 (${file}):`, error.message);
                    throw error; // 마이그레이션 실패 시 중단
                }
            }
        }

        if (count > 0) {
            console.log(`✅ [Migration] 총 ${count}개의 변경 사항을 적용했습니다.`);
        } else {
            console.log('[Migration] 이미 최신 상태입니다.');
        }
    }

    async runSqlFile(filename) {
        const filePath = path.join(this.migrationsDir, filename);
        const sql = fs.readFileSync(filePath, 'utf8');

        // 쿼리별로 분리하여 실행 (DELIMITER 고려 X, 간단한 쿼리 중심)
        const queries = sql.split(';').map(q => q.trim()).filter(q => q.length > 0);
        for (let query of queries) {
            try {
                await db.query(query);
            } catch (error) {
                // 이미 존재하는 컬럼/인덱스 오류는 무시하고 진행 (이력은 기록됨)
                if (error.code === 'ER_DUP_FIELDNAME' || error.message.includes('Duplicate column name') || error.message.includes('Duplicate key name')) {
                    console.warn(`[Migration] 경고 (무시됨): ${filename} - ${error.message.split('\n')[0]}`);
                } else {
                    throw error;
                }
            }
        }
    }

    async runJsFile(filename) {
        const filePath = path.join(this.migrationsDir, filename);
        const migration = require(filePath);
        if (typeof migration === 'function') {
            await migration(db);
        } else if (migration.up && typeof migration.up === 'function') {
            await migration.up(db);
        }
    }
}

module.exports = new MigrationRunner();
