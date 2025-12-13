const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

console.log('=== 경매 크롤링 디버깅 시작 ===');

// 1. 환경변수 확인
console.log('\n[1] 환경변수 점검');
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY) {
    console.error('❌ ENCRYPTION_KEY가 .env 파일에 정의되지 않았습니다!');
    console.log('   -> 이것이 500 에러의 원인일 가능성이 매우 높습니다.');
} else {
    console.log('✅ ENCRYPTION_KEY가 존재합니다.');
    console.log(`   키 길이: ${ENCRYPTION_KEY.length}`);
}

// 2. 암호화 모듈 테스트
console.log('\n[2] 암호화/복호화 테스트');
try {
    if (ENCRYPTION_KEY) {
        const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
        const text = 'test_password';
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        console.log('✅ 암호화 테스트 성공');

        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        if (decrypted === text) {
            console.log('✅ 복호화 테스트 성공');
        } else {
            console.error('❌ 복호화 결과가 원본과 다릅니다.');
        }
    } else {
        console.log('⚠️ ENCRYPTION_KEY가 없어 테스트를 건너뜁니다.');
    }
} catch (e) {
    console.error('❌ 암호화 테스트 중 오류 발생:', e.message);
}

// 3. Puppeteer 테스트
console.log('\n[3] Puppeteer 실행 테스트');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
    try {
        console.log('   브라우저 실행 시도...');
        const browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-gpu',
                '--disable-dev-shm-usage',
                '--no-first-run',
                '--no-zygote'
            ]
        });
        console.log('✅ 브라우저 실행 성공 (Headless)');

        const page = await browser.newPage();
        await page.goto('about:blank');
        console.log('✅ 페이지 생성 성공');

        await browser.close();
        console.log('✅ 브라우저 종료 성공');
        console.log('\n=== 진단 완료: 성공 ===');
    } catch (e) {
        console.error('❌ Puppeteer 실행 실패:', e.message);
        console.error('   -> Puppeteer 설정이나 서버 환경 문제일 수 있습니다.');
        console.log('\n=== 진단 완료: 실패 ===');
    }
})();
