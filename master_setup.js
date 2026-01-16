const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const os = require('os');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function runCommand(command, cwd) {
    console.log(`\n> [명령 실행] ${command} (위치: ${cwd || 'root'})`);
    try {
        execSync(command, { cwd, stdio: 'inherit' });
        return true;
    } catch (error) {
        console.error(`\n❌ 명령 실행 실패: ${command}`);
        return false;
    }
}

async function createDesktopShortcut() {
    let desktopPath = path.join(os.homedir(), 'Desktop');

    // OneDrive 바탕화면 경로 체크
    const onedriveDesktop = path.join(os.homedir(), 'OneDrive', 'Desktop');
    if (!fs.existsSync(desktopPath) && fs.existsSync(onedriveDesktop)) {
        desktopPath = onedriveDesktop;
    }

    const targetPath = path.join(__dirname, 'hongda-biz-launcher', 'dist', 'HongdaBiz-win32-x64', 'HongdaBiz.exe');
    const shortcutPath = path.join(desktopPath, '홍다 비즈 (Hongda Biz).lnk');

    if (!fs.existsSync(targetPath)) {
        console.log('\n[INFO] 실행 파일을 찾을 수 없어 바로가기를 생성하지 않습니다.');
        console.log(`(기대 경로: ${targetPath})`);
        return;
    }

    console.log('\n--- 바탕화면 바로가기 생성 중... ---');

    // PowerShell을 사용하여 바로가기 생성 (백틱과 따옴표 이스케이프 수정)
    const psCommand = `
        $WshShell = New-Object -ComObject WScript.Shell;
        $Shortcut = $WshShell.CreateShortcut('${shortcutPath}');
        $Shortcut.TargetPath = '${targetPath}';
        $Shortcut.WorkingDirectory = '${path.dirname(targetPath)}';
        $Shortcut.IconLocation = '${targetPath},0';
        $Shortcut.Description = '홍다 비즈 (Hongda Biz) 통합 시스템';
        $Shortcut.Save();
    `.replace(/\n/g, ' ').trim();

    try {
        execSync(`powershell -Command "${psCommand.replace(/"/g, '\\"')}"`);
        console.log(`✅ 바탕화면 바로가기가 생성되었습니다: ${shortcutPath}`);
    } catch (error) {
        console.log('⚠️ 바로가기 생성 실패 (권한 문제일 수 있습니다):', error.message);
    }
}

async function setup() {
    console.log('\n================================================');
    console.log('   홍다 비즈 (Hongda Biz) 통합 자동 설정 마스터');
    console.log('================================================\n');

    // 1. 디렉토리 확인
    const dirs = ['backend', 'frontend', 'hongda-biz-launcher'];
    for (const dir of dirs) {
        if (!fs.existsSync(path.join(__dirname, dir))) {
            console.error(`❌ 오류: '${dir}' 폴더를 찾을 수 없습니다. 소스 코드 위치를 확인해주세요.`);
            process.exit(1);
        }
    }

    // 2. 의존성 설치
    console.log('\n--- [1/5] 필요한 라이브러리 설치 (node_modules) ---');
    for (const dir of dirs) {
        console.log(`\n[${dir}] 설치 중... (잠시만 기다려주세요)`);
        if (!await runCommand('npm install', path.join(__dirname, dir))) {
            console.log(`${dir} 설치 중 경고가 발생했으나 계속 진행합니다...`);
        }
    }

    // 3. 환경 변수 설정
    console.log('\n--- [2/5] 서버 환경 설정 및 DB 검증 ---');
    const envPath = path.join(__dirname, 'backend', '.env');
    const backendNodeModules = path.join(__dirname, 'backend', 'node_modules');

    if (fs.existsSync(backendNodeModules)) {
        module.paths.push(backendNodeModules);
    }

    let mysql;
    try {
        mysql = require('mysql2/promise');
    } catch (e) {
        console.error('❌ mysql2 모듈을 로드할 수 없습니다. npm install이 정상적으로 완료되었는지 확인해주세요.');
        process.exit(1);
    }

    let currentPassword = '';
    if (fs.existsSync(envPath)) {
        require('dotenv').config({ path: envPath });
        currentPassword = process.env.DB_PASSWORD;
        console.log('! 기존 .env 파일을 발견했습니다. 정합성을 확인합니다.');
    }

    let isConnected = false;
    let dbPassword = currentPassword;

    while (!isConnected) {
        try {
            const connection = await mysql.createConnection({
                host: process.env.DB_HOST || 'localhost',
                user: process.env.DB_USER || 'root',
                password: dbPassword,
                port: parseInt(process.env.DB_PORT) || 3306
            });
            await connection.end();
            isConnected = true;
            console.log('✅ DB 접속 확인 완료!');
        } catch (error) {
            console.log('\n❌ DB 접속 실패:', error.message);
            if (error.code === 'ER_ACCESS_DENIED_ERROR') {
                console.log('! 비밀번호가 틀렸거나 root 계정 접근 권한이 없습니다.');
            } else {
                console.log('! MySQL 서버가 실행 중인지 확인해주세요.');
            }

            dbPassword = await new Promise(resolve => {
                rl.question('! 사용할 MySQL root 비밀번호를 다시 입력해주세요: ', resolve);
            });
        }
    }

    // 성공한 비밀번호로 .env 파일 저장/업데이트
    const envTemplate = `
# Database Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=${dbPassword}
DB_NAME=trade_management
DB_PORT=3306

# Server Configuration
PORT=5000
NODE_ENV=development
JWT_SECRET=hongda-biz-secret-key
ENCRYPTION_KEY=secure-auction-key-v1-super-secret
`;
    fs.writeFileSync(envPath, envTemplate.trim());
    console.log('✅ .env 파일 설정 완료');

    // 4. 데이터베이스 초기화
    console.log('\n--- [3/5] 데이터베이스 초기 구축 ---');
    console.log('! database_schema.sql 파일로 DB를 구축합니다.');

    try {
        require('dotenv').config({ path: envPath });

        // [STEP A] 데이터베이스 자체 생성
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD,
            port: parseInt(process.env.DB_PORT) || 3306
        });

        const dbName = process.env.DB_NAME || 'trade_management';
        await connection.query(`CREATE DATABASE IF NOT EXISTS ${dbName};`);
        console.log(`✅ 데이터베이스 '${dbName}' 확인/생성 완료.`);
        await connection.query(`USE ${dbName};`);

        // [STEP B] 스키마 파일 실행
        const sql = fs.readFileSync(path.join(__dirname, 'database_schema.sql'), 'utf8');

        // SQL 파싱 로직 개선 (Trigger의 DELIMITER 처리)
        const queries = [];
        let currentQuery = '';
        let delimiter = ';';
        const lines = sql.split('\n');

        for (let line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine || trimmedLine.startsWith('--') || trimmedLine.startsWith('/*')) continue;

            // DELIMITER 명령 처리
            if (trimmedLine.toUpperCase().startsWith('DELIMITER')) {
                const parts = trimmedLine.split(/\s+/);
                if (parts.length > 1) {
                    delimiter = parts[1];
                }
                continue;
            }

            currentQuery += line + '\n';

            // 현재 설정된 구분자로 쿼리가 끝났는지 확인
            if (trimmedLine.endsWith(delimiter)) {
                let queryToExecute = currentQuery.trim();
                // 끝에 붙은 구분자 제거
                if (queryToExecute.endsWith(delimiter)) {
                    queryToExecute = queryToExecute.substring(0, queryToExecute.length - delimiter.length).trim();
                }

                if (queryToExecute) {
                    queries.push(queryToExecute);
                }
                currentQuery = '';
            }
        }

        console.log(`! 총 ${queries.length}개의 핵심 스키마 구문을 실행합니다...`);
        for (let query of queries) {
            try {
                if (query.toUpperCase().startsWith('USE ')) continue;
                await connection.query(query);
            } catch (queryError) {
                const msg = queryError.message;
                if (!msg.includes('already exists') && !msg.includes('Duplicate entry')) {
                    console.log(`> [Info] 쿼리 알림: ${msg.split('\n')[0]}`);
                }
            }
        }
        await connection.end();
        console.log('✅ 데이터베이스 테이블 및 초기 데이터 생성 성공!');
    } catch (error) {
        console.error('❌ DB 초기화 실패:', error.message);
        console.log('! [주의] MySQL이 실행 중인지, 비밀번호가 맞는지 확인해주세요.');
        console.log('! 원인: ' + (error.stack || error));
    }

    // 5. 브라우저 엔진 설치
    console.log('\n--- [4/5] 경매 크롤러용 브라우저 설치 ---');
    await runCommand('npx puppeteer browsers install chrome', path.join(__dirname, 'backend'));

    // 6. 관리자 계정 초기화 및 런처 빌드
    console.log('\n--- [5/5] 관리자 계정 초기화 및 런처 빌드 ---');

    // [PRE-CHECK] 실행 중인 런처 프로세스 종료 (EBUSY 오류 방지)
    try {
        if (os.platform() === 'win32') {
            console.log('! 기존 실행 중인 런처 프로세스를 정리합니다...');
            execSync('taskkill /f /im HongdaBiz.exe /t /fi "status eq running"', { stdio: 'ignore' });

            // [중요] 프로세스 종료 후 윈도우가 파일 잠금을 해제할 때까지 잠시 대기 (2초)
            console.log('! 파일 잠금 해제를 대기 중입니다 (2초)...');
            await new Promise(resolve => setTimeout(resolve, 2000));

            // [추가] 빌드 방해 요소인 dist 폴더 강제 삭제 시도
            const distPath = path.join(__dirname, 'hongda-biz-launcher', 'dist');
            if (fs.existsSync(distPath)) {
                console.log('! 기존 빌드 폴더를 강제 정리합니다...');
                execSync(`powershell -Command "Remove-Item -Path '${distPath}' -Recurse -Force -ErrorAction SilentlyContinue"`);
            }
        }
    } catch (e) { /* 무시 */ }

    // 관리자 비밀번호 리셋 스크립트 실행
    await runCommand('node scripts/emergency_reset_admin.js', path.join(__dirname, 'backend'));

    // 런처 EXE 빌드 시도
    console.log('\n[INFO] 런처 실행 파일을 제작합니다...');
    await runCommand('npx electron-packager . "HongdaBiz" --platform=win32 --arch=x64 --out=dist --overwrite', path.join(__dirname, 'hongda-biz-launcher'));

    // 7. 바탕화면 바로가기 생성
    await createDesktopShortcut();

    console.log('\n================================================');
    console.log('   🎉 모든 설정이 완료되었습니다!');
    console.log('================================================');
    console.log('\n1. 바탕화면에 생성된 [홍다 비즈 (Hongda Biz)] 바로가기를 실행하세요.');
    console.log('   (또는 hongda-biz-launcher/dist/HongdaBiz-win32-x64 폴더 안의 HongdaBiz.exe 실행)');
    console.log('2. 관리자 ID: admin / PW: admin1234');
    console.log('\n엔터를 누르면 종료됩니다.');

    rl.on('line', () => {
        process.exit(0);
    });
}

setup();
