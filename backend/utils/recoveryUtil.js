const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const backupUtil = require('./backupUtil');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

/**
 * 백업 파일을 통한 시스템 복원 유틸리티
 */
const recoveryUtil = {
    /**
     * ZIP 파일을 통해 데이터베이스 복원
     * @param {string} zipPath 업로드된 ZIP 파일 경로
     */
    restoreFromZip: async (zipPath) => {
        const tempExtractDir = path.join(__dirname, '../../temp_restore_' + Date.now());

        try {
            // 1. 압축 해제
            if (!fs.existsSync(tempExtractDir)) fs.mkdirSync(tempExtractDir, { recursive: true });
            const zip = new AdmZip(zipPath);
            zip.extractAllTo(tempExtractDir, true);

            // 2. 버전 및 내용 검증
            const files = fs.readdirSync(tempExtractDir);
            const sqlFile = files.find(f => f.endsWith('.sql'));
            const versionFile = files.find(f => f === 'version.json');

            if (!sqlFile) {
                throw new Error('백업 파일 내에 데이터베이스 덤프(.sql)가 존재하지 않습니다.');
            }

            // 버전 체크 (선택 사항 - 필요 시 구현)
            if (versionFile) {
                const backupVersion = JSON.parse(fs.readFileSync(path.join(tempExtractDir, versionFile), 'utf8'));
                const currentVersion = JSON.parse(fs.readFileSync(path.join(__dirname, '../../version.json'), 'utf8'));

                console.log(`Backup Version: ${backupVersion.version}, Current Version: ${currentVersion.version}`);
                // 버전이 너무 차이 나면 경고하거나 중단하는 로직 추가 가능
            }

            // 3. 안전 장치: 현재 상태 자동 백업
            console.log('Safety backup before restoration...');
            await backupUtil.generateBackupZip();

            // 4. 데이터베이스 복원 실행 (mysql cli 사용)
            const mysqlPath = process.env.MYSQL_PATH || 'mysql';
            const sqlPath = path.join(tempExtractDir, sqlFile);

            await new Promise((resolve, reject) => {
                // -e "source path/to/file.sql" 대신 표준 입력을 사용하는 것이 공백 포함 경로에 더 안전함
                const cmd = `"${mysqlPath}" -h ${process.env.DB_HOST} -u ${process.env.DB_USER} -p${process.env.DB_PASSWORD} ${process.env.DB_NAME} < "${sqlPath}"`;

                exec(cmd, (error, stdout, stderr) => {
                    if (error) {
                        const maskedCmd = cmd.replace(/-p.*?\s/, '-p******** ');
                        console.error('MySQL Restore Error:', stderr);
                        console.error('Executed Command:', maskedCmd);
                        return reject(new Error(`데이터베이스 복원 중 오류가 발생했습니다. (경로 확인: ${mysqlPath})`));
                    }
                    resolve();
                });
            });

            // 5. 서버 측 파일 복사 (필요 시 .env나 uploads 복구)
            // 주의: .env는 현재 접속 정보를 담고 있으므로 복구 시 신중해야 함

            return { success: true, message: '데이터베이스가 성공적으로 복원되었습니다.' };

        } catch (error) {
            console.error('Recovery Error:', error);
            throw error;
        } finally {
            // 임시 폴더 삭제
            if (fs.existsSync(tempExtractDir)) {
                fs.rmSync(tempExtractDir, { recursive: true, force: true });
            }
        }
    }
};

module.exports = recoveryUtil;
