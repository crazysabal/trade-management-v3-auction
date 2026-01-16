const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * 홍다 비즈 (Hongda Biz) 배포 패키지 제작 도구
 * 
 * 용도: 다른 PC로 복사하기 전, 용량만 차지하는 node_modules와 불필요한 로그/임시 파일을 제외하고
 *       설치에 꼭 필요한 핵심 소스 코드만 모아 압축 패키지를 생성합니다.
 */

const SOURCE_DIR = __dirname;
const DIST_DIR = path.join(SOURCE_DIR, 'dist_package_temp');
const PACKAGE_NAME = 'HongdaBiz_Package.zip';

// 1. 배포 필수 포함 파일/폴더 목록
const INCLUDE_LIST = [
    'backend',
    'frontend',
    'hongda-biz-launcher',
    'Initial_Setup.bat',
    'Installation_Guide.html',
    'Installation_Guide.txt',
    'Run Launcher.bat',
    'Update_System.bat',      // 업데이트용 배치파일
    'database_schema.sql',
    'master_setup.js',
    'package.json',
    'version.json',          // 버젼 정보 파일
    'scripts'                // 업데이트 매니저 포함
];

// 2. 제외 규칙 (폴더명/파일명)
const EXCLUDE_LIST = [
    'node_modules',
    '.git',
    '.gitignore',
    '.antigravityrules',
    'archive',
    'dist',
    'package-lock.json',
    '.env',             // 보안을 위해 제외 (setup에서 자동 생성됨)
    'cookies',          // 경매 세션 정보 유출 방지
    'puppeteer_data',   // 브라우저 프로필 유출 방지
    'logs',             // 시스템 로그 제외
    'temp_update'       // 업데이트 임시 폴더 제외
];

function deleteFolderRecursive(directoryPath) {
    if (fs.existsSync(directoryPath)) {
        fs.readdirSync(directoryPath).forEach((file) => {
            const curPath = path.join(directoryPath, file);
            if (fs.lstatSync(curPath).isDirectory()) {
                deleteFolderRecursive(curPath);
            } else {
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(directoryPath);
    }
}

function copyFolderRecursiveSync(source, target) {
    const name = path.basename(source);
    if (EXCLUDE_LIST.includes(name)) return;

    if (!fs.existsSync(target)) {
        fs.mkdirSync(target, { recursive: true });
    }

    if (fs.lstatSync(source).isDirectory()) {
        const files = fs.readdirSync(source);
        files.forEach((file) => {
            const curSource = path.join(source, file);
            if (fs.lstatSync(curSource).isDirectory()) {
                copyFolderRecursiveSync(curSource, path.join(target, file));
            } else {
                if (!EXCLUDE_LIST.includes(file)) {
                    fs.copyFileSync(curSource, path.join(target, file));
                }
            }
        });
    }
}

async function createPackage() {
    console.log('\n================================================');
    console.log('   홍다 비즈 (Hongda Biz) 배포 패키지 제작기');
    console.log('================================================\n');

    // 기존 작업 폴더 삭제
    if (fs.existsSync(DIST_DIR)) {
        console.log('! 이전 작업 폴더 정리 중...');
        // [PRE-CHECK] 실행 중인 런처 프로세스 종료 (EBUSY 오류 방지)
        try {
            if (process.platform === 'win32') {
                execSync('taskkill /f /im HongdaBiz.exe /t /fi "status eq running"', { stdio: 'ignore' });
                // [중요] 프로세스 종료 후 윈도우가 파일 잠금을 해제할 때까지 잠시 대기 (2초)
                console.log('! 파일 잠금 해제를 대기 중입니다 (2초)...');
                execSync('powershell -Command "Start-Sleep -Seconds 2"');
            }
        } catch (e) { /* ignore */ }
        deleteFolderRecursive(DIST_DIR);
    }
    fs.mkdirSync(DIST_DIR);

    // 파일 복사
    console.log('--- [1/2] 필수 파일 수집 및 클린화 작업 중 ---');
    for (const item of INCLUDE_LIST) {
        const sourcePath = path.join(SOURCE_DIR, item);
        const targetPath = path.join(DIST_DIR, item);

        if (fs.existsSync(sourcePath)) {
            if (fs.lstatSync(sourcePath).isDirectory()) {
                console.log(`> 폴더 복사: ${item}`);
                copyFolderRecursiveSync(sourcePath, targetPath);
            } else {
                console.log(`> 파일 복사: ${item}`);
                fs.copyFileSync(sourcePath, targetPath);
            }
        }
    }

    // 압축 작업 (Windows PowerShell 활용)
    console.log('\n--- [2/2] 패키지 압축 중 (ZIP) ---');
    const zipPath = path.join(SOURCE_DIR, PACKAGE_NAME);
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

    const psCommand = `Compress-Archive -Path "${DIST_DIR}\\*" -DestinationPath "${zipPath}" -Force`;

    try {
        execSync(`powershell -Command "${psCommand}"`);
        console.log(`\n✅ 배포 패키지 제작 완료!`);
        console.log(`📍 파일 경로: ${zipPath}`);
    } catch (error) {
        console.error('\n❌ 압축 실패 (PowerShell 오류):', error.message);
    }

    // 작업 폴더 정리
    console.log('\n! 작업 임시 폴더 삭제 중...');
    deleteFolderRecursive(DIST_DIR);

    console.log('\n================================================');
    console.log('   이제 생성된 ZIP 파일을 다른 PC로 전달하면 됩니다.');
    console.log('================================================\n');
}

createPackage();
