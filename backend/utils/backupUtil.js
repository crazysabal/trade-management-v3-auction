const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
require('dotenv').config();

/**
 * 백업 압축 파일(ZIP)을 생성하는 유틸리티
 */
const backupUtil = {
    /**
     * DB 덤프 및 설정 파일을 포함한 ZIP 생성
     * @returns {Promise<string>} 생성된 ZIP 파일의 절대 경로
     */
    generateBackupZip: async () => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupDir = path.join(__dirname, '../../backups');
        const tempDir = path.join(__dirname, '../../temp_backup');

        // 폴더 생성
        if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        const sqlFilename = `db_dump_${timestamp}.sql`;
        const sqlPath = path.join(tempDir, sqlFilename);
        const zipFilename = `HongdaBiz_Backup_${timestamp}.zip`;
        const zipPath = path.join(backupDir, zipFilename);

        // 1. MySQL Dump 실행
        await new Promise((resolve, reject) => {
            const dumpPath = process.env.MYSQLDUMP_PATH || 'mysqldump';
            const cmd = `"${dumpPath}" -h ${process.env.DB_HOST} -u ${process.env.DB_USER} -p${process.env.DB_PASSWORD} ${process.env.DB_NAME} > "${sqlPath}"`;

            exec(cmd, (error, stdout, stderr) => {
                if (error) {
                    console.error('MySQL Dump Error:', stderr);
                    return reject(new Error('데이터베이스 덤프 생성 중 오류가 발생했습니다.'));
                }
                resolve();
            });
        });

        // 2. ZIP 압축
        await new Promise((resolve, reject) => {
            const output = fs.createWriteStream(zipPath);
            const archive = archiver('zip', { zlib: { level: 9 } });

            output.on('close', () => resolve());
            archive.on('error', (err) => reject(err));

            archive.pipe(output);

            // 파일 추가
            archive.file(sqlPath, { name: sqlFilename });

            const envPath = path.join(__dirname, '../.env');
            if (fs.existsSync(envPath)) {
                archive.file(envPath, { name: '.env' });
            }

            const versionPath = path.join(__dirname, '../../version.json');
            if (fs.existsSync(versionPath)) {
                archive.file(versionPath, { name: 'version.json' });
            }

            // 업로드 폴더 추가 (존재할 경우)
            const uploadsPath = path.join(__dirname, '../uploads');
            if (fs.existsSync(uploadsPath) && fs.readdirSync(uploadsPath).length > 0) {
                archive.directory(uploadsPath, 'uploads');
            }

            archive.finalize();
        });

        // 3. 임시 파일 삭제
        if (fs.existsSync(sqlPath)) fs.unlinkSync(sqlPath);

        return {
            filePath: zipPath,
            fileName: zipFilename
        };
    }
};

module.exports = backupUtil;
