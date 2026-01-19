const backupUtil = require('./utils/backupUtil');

async function test() {
    try {
        console.log('백업 생성을 시작합니다...');
        const result = await backupUtil.generateBackupZip();
        console.log('백업 생성 성공:', result);
    } catch (error) {
        console.error('백업 실패:', error);
    }
}

test();
