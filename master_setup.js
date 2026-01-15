const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

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

async function setup() {
    console.log('\n================================================');
    console.log('   Trade Management v3 통합 자동 설정 마스터');
    console.log('================================================\n');

    // 1. 디렉토리 확인
    const dirs = ['backend', 'frontend', 'launcher'];
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
    console.log('\n--- [2/5] 서버 환경 설정 (.env) ---');
    const envPath = path.join(__dirname, 'backend', '.env');
    if (!fs.existsSync(envPath)) {
        console.log('! backend/.env 파일이 없습니다. 설정을 생성합니다.');
        const dbPassword = await new Promise(resolve => {
            rl.question('! MySQL root 비밀번호를 입력해주세요: ', resolve);
        });

        const envTemplate = `
# Database Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=${dbPassword || 'your_password'}
DB_NAME=trade_management
DB_PORT=3306

# Server Configuration
PORT=5000
NODE_ENV=development
JWT_SECRET=your-secret-key-v3
ENCRYPTION_KEY=secure-auction-key-v1-super-secret
`;
        fs.writeFileSync(envPath, envTemplate.trim());
        console.log('✅ .env 파일 생성 완료');
    } else {
        console.log('✅ 기존 .env 파일을 유지합니다.');
    }

    // 4. 데이터베이스 초기화
    console.log('\n--- [3/5] 데이터베이스 초기 구축 ---');
    console.log('! database_schema_v3.sql 파일로 DB를 구축합니다.');

    try {
        const backendNodeModules = path.join(__dirname, 'backend', 'node_modules');
        if (fs.existsSync(backendNodeModules)) {
            module.paths.push(backendNodeModules);
        }

        require('dotenv').config({ path: envPath });
        const mysql = require('mysql2/promise');

        // [STEP A] 데이터베이스 자체 생성 (연결 시 DB명을 지정하지 않음)
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
        const sql = fs.readFileSync(path.join(__dirname, 'database_schema_v3.sql'), 'utf8');
        const cleanSql = sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
        const queries = cleanSql.split(';').map(q => q.trim()).filter(q => q.length > 0);

        console.log(`! 총 ${queries.length}개의 스키마 쿼리를 실행합니다...`);
        for (let query of queries) {
            try {
                if (query.toUpperCase().startsWith('USE ')) continue;
                await connection.query(query);
            } catch (queryError) {
                const msg = queryError.message;
                if (!msg.includes('already exists') && !msg.includes('Duplicate entry')) {
                    console.log(`> [Info] 쿼리 건너뜀: ${msg.split('\n')[0]}`);
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
    // 관리자 비밀번호 리셋 스크립트 실행
    await runCommand('node scripts/emergency_reset_admin.js', path.join(__dirname, 'backend'));

    // 런처 EXE 빌드 시도
    console.log('\n[INFO] 런처 실행 파일을 제작합니다...');
    await runCommand('npx electron-packager . "TradeManagement" --platform=win32 --arch=x64 --out=dist --overwrite', path.join(__dirname, 'launcher'));

    console.log('\n================================================');
    console.log('   🎉 모든 설정이 완료되었습니다!');
    console.log('================================================');
    console.log('\n1. launcher/dist 폴더 안의 TradeManagement.exe를 실행하세요.');
    console.log('2. 관리자 ID: admin / PW: admin1234');
    console.log('\n엔터를 누르면 종료됩니다.');

    rl.on('line', () => {
        process.exit(0);
    });
}

setup();
