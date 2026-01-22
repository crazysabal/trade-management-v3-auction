const express = require('express');
const router = express.Router();
const db = require('../config/database');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const crypto = require('crypto');
const ALGORITHM = 'aes-256-cbc';
const fs = require('fs');
const path = require('path');

// Stealth 플러그인 적용 (봇 감지 우회)
puppeteer.use(StealthPlugin());

// 쿠키 저장 경로
const COOKIES_PATH = path.join(__dirname, '../cookies');

// 암호화 키 (실제 환경에서는 환경변수로 관리)
// 암호화 키 (환경변수 필수)
const ENCRYPTION_KEY_RAW = process.env.ENCRYPTION_KEY;

if (!ENCRYPTION_KEY_RAW) {
  console.error('FATAL ERROR: ENCRYPTION_KEY is not defined in .env file.');
  // 서버 시작 시 키가 없으면 경고만 하고 넘어가거나 프로세스를 종료할 수 있음
  // 여기서는 기존 데이터 호환성을 위해 기본값을 두지 않고 경고만 출력
}

// 키를 SHA-256으로 해시하여 정확히 32바이트로 만듦
function getEncryptionKey() {
  return crypto.createHash('sha256').update(ENCRYPTION_KEY_RAW).digest();
}

// 비밀번호 암호화
function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

// 비밀번호 복호화
function decrypt(text) {
  const textParts = text.split(':');
  const iv = Buffer.from(textParts.shift(), 'hex');
  const encryptedText = textParts.join(':');
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// 경매 계정 목록 조회
router.get('/accounts', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, account_name, site_url, username, is_active, last_used FROM auction_accounts ORDER BY id'
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('경매 계정 조회 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// 경매 계정 저장
router.post('/accounts', async (req, res) => {
  try {
    const { account_name, site_url, username, password } = req.body;

    const encryptedPassword = encrypt(password);

    const [result] = await db.query(
      `INSERT INTO auction_accounts (account_name, site_url, username, password)
       VALUES (?, ?, ?, ?)`,
      [account_name, site_url, username, encryptedPassword]
    );

    res.status(201).json({
      success: true,
      message: '경매 계정이 저장되었습니다.',
      data: { id: result.insertId }
    });
  } catch (error) {
    console.error('경매 계정 저장 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// 경매 계정 수정
router.put('/accounts/:id', async (req, res) => {
  try {
    const { account_name, site_url, username, password } = req.body;

    let query = `UPDATE auction_accounts SET account_name = ?, site_url = ?, username = ?`;
    let params = [account_name, site_url, username];

    if (password) {
      const encryptedPassword = encrypt(password);
      query += `, password = ?`;
      params.push(encryptedPassword);
    }

    query += ` WHERE id = ?`;
    params.push(req.params.id);

    await db.query(query, params);

    // 자동 세션 초기화: 계정 정보가 변경되면 기존 세션(쿠키 및 캐시)을 즉시 삭제
    try {
      const accountId = req.params.id;
      const cookieFile = path.join(COOKIES_PATH, `account_${accountId}.json`);
      const userDataDir = path.join(__dirname, '../puppeteer_data', `account_${accountId}`);

      if (fs.existsSync(cookieFile)) {
        fs.unlinkSync(cookieFile);
      }
      if (fs.existsSync(userDataDir)) {
        fs.rmSync(userDataDir, { recursive: true, force: true });
      }
    } catch (sessionError) {
      console.error('자동 세션 초기화 중 오류 (무시됨):', sessionError);
    }

    res.json({ success: true, message: '경매 계정이 수정되었으며 세션이 초기화되었습니다.' });
  } catch (error) {
    console.error('경매 계정 수정 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// 경매 계정 세션 삭제 (쿠키 및 유저 데이터 삭제)
router.delete('/accounts/:id/session', async (req, res) => {
  try {
    const accountId = req.params.id;
    const cookieFile = path.join(COOKIES_PATH, `account_${accountId}.json`);
    const userDataDir = path.join(__dirname, '../puppeteer_data', `account_${accountId}`);

    if (fs.existsSync(cookieFile)) {
      fs.unlinkSync(cookieFile);
    }

    if (fs.existsSync(userDataDir)) {
      // fs.rmSync is available in Node.js 14+ for recursive directory removal
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }

    res.json({ success: true, message: '세션 정보가 초기화되었습니다.' });
  } catch (error) {
    console.error('세션 초기화 오류:', error);
    res.status(500).json({ success: false, message: '세션 초기화 중 오류가 발생했습니다.' });
  }
});

// 경매 계정 삭제
router.delete('/accounts/:id', async (req, res) => {
  try {
    const accountId = req.params.id;

    // 1. 데이터베이스에서 계정 삭제
    await db.query('DELETE FROM auction_accounts WHERE id = ?', [accountId]);

    // 2. 관련 세션 파일 삭제 (쿠키 및 유저 데이터)
    const cookieFile = path.join(COOKIES_PATH, `account_${accountId}.json`);
    const userDataDir = path.join(__dirname, '../puppeteer_data', `account_${accountId}`);

    if (fs.existsSync(cookieFile)) {
      fs.unlinkSync(cookieFile);
    }
    if (fs.existsSync(userDataDir)) {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }

    res.json({ success: true, message: '경매 계정과 관련 세션 정보가 삭제되었습니다.' });
  } catch (error) {
    console.error('경매 계정 삭제 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// 쿠키 저장 함수
async function saveCookies(page, accountId) {
  const cookies = await page.cookies();
  if (!fs.existsSync(COOKIES_PATH)) {
    fs.mkdirSync(COOKIES_PATH, { recursive: true });
  }
  fs.writeFileSync(
    path.join(COOKIES_PATH, `account_${accountId}.json`),
    JSON.stringify(cookies, null, 2)
  );
  // console.log(`✓ 쿠키 저장 완료 (계정 ID: ${accountId})`);
}

// 쿠키 로드 함수
async function loadCookies(page, accountId) {
  const cookieFile = path.join(COOKIES_PATH, `account_${accountId}.json`);
  if (fs.existsSync(cookieFile)) {
    const cookies = JSON.parse(fs.readFileSync(cookieFile, 'utf8'));
    await page.setCookie(...cookies);
    // console.log(`✓ 저장된 쿠키 로드 완료 (계정 ID: ${accountId})`);
    return true;
  }
  return false;
}

// 로그인 상태 확인 함수
async function checkLoginStatus(page) {
  try {
    const url = page.url();

    // 로그인 페이지로 리다이렉트되었으면 로그인 필요
    if (url.includes('login')) {
      return false;
    }

    // 낙찰 내역 페이지에 있으면 로그인된 상태
    if (url.includes('nak_live_list') || url.includes('nak_list')) {
      return true;
    }

    // 그 외의 경우 페이지 내용으로 확인
    const pageContent = await page.content();
    // 로그인 폼이 있으면 로그인 필요
    if (pageContent.includes('user_id') || pageContent.includes('user_pw') || pageContent.includes('로그인')) {
      return false;
    }

    return true;
  } catch (e) {
    return false;
  }
}

// 경매 데이터 크롤링 실행
router.post('/crawl', async (req, res) => {
  const { account_id, crawl_date } = req.body;

  let browser;
  const startTime = Date.now();

  try {
    // 계정 정보 조회
    const [accounts] = await db.query(
      'SELECT * FROM auction_accounts WHERE id = ? AND is_active = 1',
      [account_id]
    );

    if (accounts.length === 0) {
      return res.status(404).json({ success: false, message: '계정을 찾을 수 없습니다.' });
    }

    const account = accounts[0];
    const password = decrypt(account.password);

    // console.log('🚀 크롤링 시작 - 브라우저를 실행합니다...');

    // Puppeteer로 크롤링 시작 (Super Stealth 모드)
    // 계정별로 브라우저 프로필(userDataDir)을 격리하여 세션 간섭 방지
    const baseUserDataDir = path.join(__dirname, '../puppeteer_data');
    const accountSpecificDir = path.join(baseUserDataDir, `account_${account_id}`);

    if (!fs.existsSync(accountSpecificDir)) {
      fs.mkdirSync(accountSpecificDir, { recursive: true });
    }

    browser = await puppeteer.launch({
      headless: 'shell', // 레거시 헤드리스 모델이 감지가 덜 됨
      userDataDir: accountSpecificDir,
      ignoreDefaultArgs: ['--enable-automation'],
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-extensions',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--no-zygote',
        '--disable-web-security', // 웹 보안 비활성화 (BLOCKED_BY_CLIENT 방지)
        '--allow-running-insecure-content',
        '--ignore-certificate-errors'
      ],
      defaultViewport: { width: 1280, height: 800 }
    });

    const page = await browser.newPage();

    // User-Agent 설정 (일반 브라우저처럼 보이게)
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // 저장된 쿠키 로드 시도
    const hasCookies = await loadCookies(page, account_id);

    // 낙찰 내역 페이지로 바로 이동 시도
    // console.log('📋 낙찰 내역 페이지 접속 시도...');
    await page.goto('http://tgjungang.co.kr/app/sub/nak_live_list.html', {
      waitUntil: 'domcontentloaded',
      timeout: 30000 // 타임아웃 30초로 연장
    });

    // 로그인 상태 확인
    let isLoggedIn = await checkLoginStatus(page);

    // 로그인이 안 되어 있으면 로그인 진행
    if (!isLoggedIn) {
      if (hasCookies) {
        // console.log('⚠️  저장된 쿠키가 만료되었습니다. 다시 로그인합니다...');
      } else {
        // console.log('📝 로그인이 필요합니다. 로그인 페이지로 이동합니다...');
      }

      await page.goto('http://tgjungang.co.kr/app/sub/login.html?call=nak', {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });

      // 페이지 로딩 대기 (v24 호환)
      await new Promise(r => setTimeout(r, 500));

      // 1. 먼저 로그인 폼이 있는지 확인
      let idInput = await page.$('input[name="id"], input[id="var_id"], input[name="user_id"], input[name="mb_id"], input[id="user_id"]');
      let pwInput = await page.$('input[name="passwd"], input[id="var_passwd"], input[type="password"], input[name="user_pw"]');

      if (idInput && pwInput) {
        // console.log('✓ 로그인 폼 발견! 바로 로그인을 진행합니다.');
      } else {
        // 이미 로그인된 상태이거나 다른 페이지
        const currentUrl = page.url();
        if (currentUrl.includes('nak_live_list') || !currentUrl.includes('login')) {
          // console.log('✓ 이미 로그인된 상태입니다.');
          isLoggedIn = true;
        } else {
          // 잠시 대기 후 다시 시도
          await new Promise(r => setTimeout(r, 500));
          idInput = await page.$('input[name="id"], input[id="var_id"], input[name="user_id"], input[name="mb_id"], input[id="user_id"]');
          pwInput = await page.$('input[name="passwd"], input[id="var_passwd"], input[type="password"], input[name="user_pw"]');

          if (!idInput || !pwInput) {
            throw new Error('로그인 폼을 찾을 수 없습니다. 페이지 구조가 변경되었을 수 있습니다.');
          }
        }
      }

      // 이미 로그인 상태가 아니면 로그인 진행
      if (!isLoggedIn) {
        // 로그인 폼 요소 찾기 (여러 가능한 셀렉터 시도)
        const idSelectors = ['input[name="id"]', 'input[id="var_id"]', 'input[id="user_id"]', 'input[name="user_id"]', 'input[name="mb_id"]'];
        const pwSelectors = ['input[name="passwd"]', 'input[id="var_passwd"]', 'input[type="password"]', 'input[name="user_pw"]'];

        let idInput = null;
        let pwInput = null;

        // ID 필드 탐색
        for (const selector of idSelectors) {
          try {
            idInput = await page.$(selector);
            if (idInput) break;
          } catch (e) { }
        }

        // PW 필드 탐색
        for (const selector of pwSelectors) {
          try {
            pwInput = await page.$(selector);
            if (pwInput) break;
          } catch (e) { }
        }

        // 만약 못 찾았다면 1초 더 기다려보고 다시 시도 (네트워크 지연 대비)
        if (!idInput || !pwInput) {
          await new Promise(r => setTimeout(r, 1500));
          for (const selector of idSelectors) {
            idInput = await page.$(selector);
            if (idInput) break;
          }
          for (const selector of pwSelectors) {
            pwInput = await page.$(selector);
            if (pwInput) break;
          }
        }

        if (!idInput || !pwInput) {
          // 디버깅용: 현재 페이지 정보 출력 (런처 로그에 표시됨)
          const debugUrl = page.url();
          console.log('현재 URL:', debugUrl);
          // console.log('페이지에서 찾은 input 요소들:');
          /*
          const inputs = await page.$$eval('input', els => els.map(el => ({
            name: el.name,
            id: el.id,
            type: el.type,
            class: el.className
          })));
          console.log(inputs);
          */

          throw new Error('로그인 폼을 찾을 수 없습니다. 브라우저 창을 확인해주세요.');
        }

        // 로그인 정보 입력
        await idInput.click({ clickCount: 3 });  // 기존 텍스트 선택
        await idInput.type(account.username, { delay: 50 });

        await pwInput.click({ clickCount: 3 });
        await pwInput.type(password, { delay: 50 });

        // 로그인 버튼 클릭
        const submitSelectors = [
          'div[name="로그인"]',           // 대구중앙청과 로그인 버튼
          'a:contains("로그인")',
          '.ui-btn:contains("로그인")',
          'button[type="submit"]',
          'input[type="submit"]',
          '.login-btn',
          '.btn-login'
        ];

        let submitBtn = null;
        for (const selector of submitSelectors) {
          try {
            submitBtn = await page.$(selector);
            if (submitBtn) {
              // console.log(`   로그인 버튼 발견: ${selector}`);
              break;
            }
          } catch (e) {
            // 셀렉터 오류 무시
          }
        }

        // 셀렉터로 못 찾으면 텍스트로 찾기
        if (!submitBtn) {
          const buttons = await page.$$('div, a, button, input');
          for (const btn of buttons) {
            const text = await btn.evaluate(el => el.textContent || el.value || '');
            if (text.includes('로그인') && !text.includes('취소')) {
              submitBtn = btn;
              // console.log('   로그인 버튼 발견 (텍스트 검색)');
              break;
            }
          }
        }

        if (submitBtn) {
          await submitBtn.click();
          // console.log('   로그인 버튼 클릭 완료');
        } else {
          // 버튼을 못 찾으면 Enter 키로 시도
          // console.log('   로그인 버튼을 찾지 못해 Enter 키로 시도...');
          await page.keyboard.press('Enter');
        }

        // 로그인 완료 대기 (페이지 이동 또는 URL 변경)
        try {
          await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 });
        } catch (e) {
          // Navigation 타임아웃은 무시하고 URL 변경 확인
          // console.log('   페이지 이동 대기 중...');
          await new Promise(r => setTimeout(r, 1000));
        }

        // 로그인 성공 여부 확인
        const currentUrl = page.url();
        if (currentUrl.includes('login')) {
          // 아직 로그인 페이지에 있으면 실패
          console.log('⚠️  로그인에 실패했을 수 있습니다.');
          await new Promise(r => setTimeout(r, 2000)); // 2초 추가 대기
        }

        // 쿠키 저장 (다음번 로그인 생략용)
        await saveCookies(page, account_id);

        // console.log('✓ 로그인 성공!');
      }
    } else {
      // console.log('✓ 저장된 쿠키로 로그인 상태 유지 중');
    }

    // 낙찰 내역 페이지 이동 (날짜 파라미터 포함)
    // console.log('📋 낙찰 내역 페이지로 이동합니다...');
    const targetDate = crawl_date || new Date().toISOString().split('T')[0];

    // URL에 날짜 파라미터 추가 시도 (일반적인 파라미터명들 시도)
    let nakUrl = `http://tgjungang.co.kr/app/sub/nak_live_list.html?schDate=${targetDate}`;

    await page.goto(nakUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    });

    // 페이지 로딩 대기 (최소화)
    await new Promise(r => setTimeout(r, 300));

    // 날짜 설정 - 년/월/일 select 박스로 구성
    // console.log(`📅 날짜 설정: ${targetDate}`);

    // 날짜 파싱 (2025-12-03 -> year: 2025, month: 12, day: 3)
    const [year, month, day] = targetDate.split('-');
    const yearNum = parseInt(year);
    const monthNum = parseInt(month);
    const dayNum = parseInt(day);

    // console.log(`   년: ${yearNum}, 월: ${monthNum}, 일: ${dayNum}`);

    try {
      // 년도 select 박스 찾기 및 선택
      const yearSelects = await page.$$('select');
      if (yearSelects.length >= 3) {
        // 첫 번째 select가 년도, 두 번째가 월, 세 번째가 일
        // console.log('   날짜 선택 중...');
        await yearSelects[0].select(year);
        await yearSelects[1].select(String(monthNum));
        await yearSelects[2].select(String(dayNum));
        await new Promise(r => setTimeout(r, 100));

        // 검색 버튼 클릭
        const searchLinks = await page.$$('a');
        for (const link of searchLinks) {
          const text = await link.evaluate(el => el.textContent);
          if (text && text.includes('검색')) {
            // console.log('   검색 버튼 클릭...');
            await link.click();
            // 검색 결과 로딩 대기
            await new Promise(r => setTimeout(r, 800));
            break;
          }
        }

        // console.log('✓ 날짜 설정 완료');
      } else {
        console.log('   ⚠️ select 박스를 충분히 찾지 못했습니다.');

        // 대안: JavaScript로 직접 설정 시도
        await page.evaluate((y, m, d) => {
          const selects = document.querySelectorAll('select');
          if (selects.length >= 3) {
            selects[0].value = y;
            selects[0].dispatchEvent(new Event('change'));
            selects[1].value = m;
            selects[1].dispatchEvent(new Event('change'));
            selects[2].value = d;
            selects[2].dispatchEvent(new Event('change'));
          }
        }, year, String(monthNum), String(dayNum));

        // 검색 실행
        await page.evaluate(() => {
          const links = document.querySelectorAll('a');
          for (const link of links) {
            if (link.textContent.includes('검색')) {
              link.click();
              break;
            }
          }
        });
        await new Promise(r => setTimeout(r, 800));
      }
    } catch (dateError) {
      console.log('   ⚠️ 날짜 설정 중 오류:', dateError.message);
    }

    // console.log('🔍 데이터를 파싱합니다...');

    // 데이터 파싱 (대구중앙청과 낙찰 리스트 구조에 맞춤)
    const auctionData = await page.evaluate(() => {
      const items = [];

      // li 요소들 중 낙찰 데이터가 있는 것만 파싱
      const listElements = document.querySelectorAll('li');

      listElements.forEach(elem => {
        try {
          const html = elem.innerHTML;
          const text = elem.textContent.trim();

          // 총 구입대금 요약 행은 스킵
          if (text.includes('총 구입대금')) return;

          // 빈 li 스킵
          if (!text || text.length < 10) return;

          // p 태그 내용 확인
          const pTag = elem.querySelector('p');
          if (!pTag) return;

          const pHtml = pTag.innerHTML;
          const pText = pTag.textContent;

          // 입하번호 추출 (첫 번째 span, font-weight:bold)
          let arriveNo = '';
          const arriveSpan = pTag.querySelector('span[style*="font-weight:bold"]') ||
            pTag.querySelector('span[style*="font-weight: bold"]');
          if (arriveSpan) {
            arriveNo = arriveSpan.textContent.trim();
          } else {
            // 숫자로 시작하는 첫 번째 숫자 추출
            const numMatch = pText.match(/^\s*(\d+)/);
            if (numMatch) arriveNo = numMatch[1];
          }

          // 품목명 추출 (color:#808000 span)
          let productName = '';
          const productSpan = pTag.querySelector('span[style*="color:#808000"]') ||
            pTag.querySelector('span[style*="color: #808000"]');
          if (productSpan) {
            productName = productSpan.textContent.trim();
          }

          // 출하지/출하주 추출 (입하번호 span 다음 텍스트, 품목명 span 이전)
          // 예: "(주)동산청과(정현달)" → 출하지: (주)동산청과, 출하주: 정현달
          let shipperLocation = ''; // 출하지 (괄호 밖 텍스트)
          let sender = '';          // 출하주 (마지막 괄호 안 텍스트)

          if (arriveSpan && productSpan) {
            const fullText = pTag.textContent;
            const afterArriveNo = fullText.indexOf(arriveNo) + arriveNo.length;
            const beforeProduct = fullText.indexOf(productName);
            if (afterArriveNo > 0 && beforeProduct > afterArriveNo) {
              const rawSender = fullText.substring(afterArriveNo, beforeProduct).trim();

              // 마지막 괄호 안의 내용을 출하주로, 나머지를 출하지로 분리
              // 예: "(주)동산청과(정현달)" → 출하지: (주)동산청과, 출하주: 정현달
              const lastParenMatch = rawSender.match(/^(.+)\(([^)]+)\)$/);
              if (lastParenMatch) {
                shipperLocation = lastParenMatch[1].trim(); // 괄호 밖
                sender = lastParenMatch[2].trim();          // 마지막 괄호 안
              } else {
                // 괄호가 없으면 전체를 출하지로
                shipperLocation = rawSender;
                sender = '';
              }
            }
          }

          // 등급 추출
          let grade = '';
          const gradeMatch = pText.match(/등급\s*[:：]\s*([^,，\s]+)/);
          if (gradeMatch) grade = gradeMatch[1].trim();

          // 중량 추출
          let weight = '';
          const weightMatch = pText.match(/중량\s*[:：]\s*([0-9.]+)/);
          if (weightMatch) weight = weightMatch[1];

          // 수량 추출
          let count = 0;
          const countMatch = pText.match(/수량\s*[:：]\s*([0-9,]+)\s*개/);
          if (countMatch) count = parseInt(countMatch[1].replace(/,/g, ''));

          // 단가 추출
          let unitPrice = 0;
          const priceMatch = pText.match(/단가\s*[:：]\s*([0-9,]+)\s*원/);
          if (priceMatch) unitPrice = parseFloat(priceMatch[1].replace(/,/g, ''));

          // 팰릿 추출
          let pallet = '';
          const palletMatch = pText.match(/팰릿\s*[:：]\s*([^\s]*)/);
          if (palletMatch) pallet = palletMatch[1].trim();

          // 총액 계산 (수량 * 단가)
          const totalPrice = count * unitPrice;

          // 유효한 데이터면 추가
          if (arriveNo && productName) {
            items.push({
              arrive_no: arriveNo,
              shipper_location: shipperLocation, // 출하지
              sender: sender,                     // 출하주
              product_name: productName,
              grade: grade,
              weight: weight,
              unit_name: '개',
              count: count,
              unit_price: unitPrice,
              total_price: totalPrice,
              pallet: pallet
            });
          }
        } catch (e) {
          // 파싱 에러 무시
        }
      });

      return items;
    });

    // 쿠키 저장 (세션 유지용)
    await saveCookies(page, account_id);

    // console.log(`✓ ${auctionData.length}건의 데이터를 파싱했습니다.`);

    await browser.close();

    // 데이터베이스에 저장 (배치 INSERT + 중복 체크)
    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    // console.log('💾 데이터베이스에 저장 중...');

    // 기존 데이터 한 번에 조회 (중복 체크용)
    const [existingData] = await db.query(
      `SELECT account_id, arrive_no, product_name, count, unit_price 
       FROM auction_raw_data WHERE auction_date = ?`,
      [targetDate]
    );

    // 중복 체크용 Set 생성 (계정 ID를 포함하여 격리된 중복 체크 수행)
    const existingSet = new Set(
      existingData.map(e => `${e.account_id}_${e.arrive_no}_${e.product_name}_${e.count}_${Math.floor(Number(e.unit_price))}`)
    );

    // 중복 제외한 데이터 필터링
    const newItems = auctionData.filter(item => {
      const key = `${account_id}_${item.arrive_no}_${item.product_name}_${item.count}_${Math.floor(Number(item.unit_price))}`;
      if (existingSet.has(key)) {
        skippedCount++;
        return false;
      }
      return true;
    });

    // 배치 INSERT (50개씩)
    const BATCH_SIZE = 50;
    for (let i = 0; i < newItems.length; i += BATCH_SIZE) {
      const batch = newItems.slice(i, i + BATCH_SIZE);

      if (batch.length === 0) continue;

      try {
        const values = batch.map(item => [
          targetDate,
          account_id, // 계정 ID 추가
          item.arrive_no,
          item.shipper_location || '',
          item.sender || '',
          item.product_name,
          item.grade || '',
          item.weight,
          item.unit_name,
          item.count,
          Math.floor(item.unit_price),
          Math.floor(item.total_price),
          'PENDING'
        ]);

        const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
        const flatValues = values.flat();

        await db.query(
          `INSERT INTO auction_raw_data 
           (auction_date, account_id, arrive_no, shipper_location, sender, product_name, grade, weight, unit_name, 
            count, unit_price, total_price, status)
           VALUES ${placeholders}`,
          flatValues
        );

        successCount += batch.length;
      } catch (error) {
        console.error('배치 저장 오류:', error);
        failedCount += batch.length;
      }
    }

    // 중복 데이터 스킵 로그 제거 (사용자 요청)

    // 크롤링 이력 저장
    const executionTime = Math.floor((Date.now() - startTime) / 1000);
    await db.query(
      `INSERT INTO auction_crawl_history 
       (crawl_date, account_id, total_records, success_records, failed_records, 
        status, execution_time)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        crawl_date || new Date().toISOString().split('T')[0],
        account_id,
        auctionData.length,
        successCount,
        failedCount,
        failedCount === 0 ? 'SUCCESS' : 'PARTIAL',
        executionTime
      ]
    );

    // 계정 최근 사용일시 업데이트
    await db.query(
      'UPDATE auction_accounts SET last_used = NOW() WHERE id = ?',
      [account_id]
    );

    res.json({
      success: true,
      message: `${successCount}건의 낙찰 내역을 가져왔습니다.`,
      data: {
        total: auctionData.length,
        success: successCount,
        failed: failedCount
      }
    });

  } catch (error) {
    if (browser) await browser.close();

    console.error('크롤링 오류:', error);

    // 크롤링 실패 이력 저장
    const executionTime = Math.floor((Date.now() - startTime) / 1000);
    await db.query(
      `INSERT INTO auction_crawl_history 
       (crawl_date, account_id, total_records, success_records, failed_records, 
        status, error_message, execution_time)
       VALUES (?, ?, 0, 0, 0, 'FAILED', ?, ?)`,
      [
        crawl_date || new Date().toISOString().split('T')[0],
        account_id,
        error.message,
        executionTime
      ]
    );

    res.status(500).json({
      success: false,
      message: '크롤링 중 오류가 발생했습니다: ' + error.message
    });
  }
});

// 크롤링된 원본 데이터 조회
router.get('/raw-data', async (req, res) => {
  try {
    const { auction_date, account_id, status } = req.query;

    let query = 'SELECT * FROM auction_raw_data WHERE 1=1';
    const params = [];

    if (auction_date) {
      query += ' AND auction_date = ?';
      params.push(auction_date);
    }

    if (account_id) {
      query += ' AND account_id = ?';
      params.push(account_id);
    }

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    query += `
      ORDER BY 
        CAST(arrive_no AS UNSIGNED) ASC, 
        (SELECT MIN(sort_order) FROM products WHERE grade = auction_raw_data.grade) ASC,
        id ASC`;

    const [rows] = await db.query(query, params);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('원본 데이터 조회 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// 원본 데이터 개별 삭제
router.delete('/raw-data/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // 데이터 존재 여부 확인
    const [existing] = await db.query('SELECT id FROM auction_raw_data WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: '데이터를 찾을 수 없습니다.' });
    }

    await db.query('DELETE FROM auction_raw_data WHERE id = ?', [id]);

    res.json({ success: true, message: '삭제되었습니다.' });
  } catch (error) {
    console.error('원본 데이터 삭제 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// 원본 데이터 일괄 삭제
router.delete('/raw-data', async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: '삭제할 항목을 선택해주세요.' });
    }

    const placeholders = ids.map(() => '?').join(',');
    await db.query(`DELETE FROM auction_raw_data WHERE id IN (${placeholders})`, ids);

    res.json({ success: true, message: `${ids.length}건이 삭제되었습니다.` });
  } catch (error) {
    console.error('원본 데이터 일괄 삭제 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// 원본 데이터 상태 일괄 수정 (매입 전표 생성 후 사용)
router.put('/raw-data/status', async (req, res) => {
  try {
    const { ids, status } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: '대상을 선택해주세요.' });
    }

    const placeholders = ids.map(() => '?').join(',');
    await db.query(`UPDATE auction_raw_data SET status = ? WHERE id IN (${placeholders})`, [status, ...ids]);

    res.json({ success: true, message: '상태가 변경되었습니다.' });
  } catch (error) {
    console.error('원본 데이터 상태 수정 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// 품목 매칭 목록 조회
router.get('/mappings', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        pm.*,
        p.product_code,
        p.product_name,
        p.grade
      FROM product_mapping pm
      LEFT JOIN products p ON pm.system_product_id = p.id
      WHERE pm.is_active = 1
      ORDER BY pm.auction_product_name
    `);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('품목 매칭 조회 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// 품목 매칭 추가/수정 (품목명 + 중량 + 등급 조합으로 매핑)
router.post('/mappings', async (req, res) => {
  try {
    const { auction_product_name, auction_weight, auction_grade, system_product_id, match_type } = req.body;

    // auction_product_name은 필수
    if (!auction_product_name) {
      return res.status(400).json({ success: false, message: '경매 품목명이 필요합니다.' });
    }

    // 중량과 등급 값 정규화 (빈 문자열로 처리 - NULL은 UNIQUE KEY에서 작동 안함)
    const weight = auction_weight !== undefined && auction_weight !== '' && auction_weight !== null
      ? parseFloat(auction_weight).toFixed(2)
      : '';
    const grade = auction_grade && auction_grade.trim() !== '' ? auction_grade.trim() : '';

    // system_product_id가 빈 문자열이거나 없으면 매칭 해제 (null로 설정)
    const productId = system_product_id && system_product_id !== '' ? system_product_id : null;

    if (productId === null) {
      // 매칭 해제 - 기존 매칭 비활성화
      await db.query(
        `UPDATE product_mapping 
         SET is_active = 0, updated_at = NOW() 
         WHERE auction_product_name = ? 
           AND auction_weight = ?
           AND auction_grade = ?`,
        [auction_product_name, weight, grade]
      );
      return res.json({ success: true, message: '품목 매칭이 해제되었습니다.' });
    }

    // 기존 매핑 확인 후 UPDATE 또는 INSERT
    const [existing] = await db.query(
      `SELECT id FROM product_mapping 
       WHERE auction_product_name = ? AND auction_weight = ? AND auction_grade = ?`,
      [auction_product_name, weight, grade]
    );

    if (existing.length > 0) {
      // 기존 매핑 업데이트
      await db.query(
        `UPDATE product_mapping 
         SET system_product_id = ?, match_type = ?, is_active = 1, updated_at = NOW()
         WHERE id = ?`,
        [productId, match_type || 'MANUAL', existing[0].id]
      );
    } else {
      // 새 매핑 생성
      await db.query(
        `INSERT INTO product_mapping (auction_product_name, auction_weight, auction_grade, system_product_id, match_type)
         VALUES (?, ?, ?, ?, ?)`,
        [auction_product_name, weight, grade, productId, match_type || 'MANUAL']
      );
    }

    res.json({ success: true, message: '품목 매칭이 저장되었습니다.' });
  } catch (error) {
    console.error('품목 매칭 저장 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// 특정 날짜의 기존 매입 내역 조회 (중복 체크용)
router.get('/existing-purchases', async (req, res) => {
  try {
    const { trade_date } = req.query;
    if (!trade_date) {
      return res.status(400).json({ success: false, message: '날짜(trade_date)가 필요합니다.' });
    }

    const [rows] = await db.query(`
      SELECT 
        td.product_id,
        td.quantity,
        td.total_weight,
        p.grade,
        p.product_name,
        tm.trade_number
      FROM trade_details td
      JOIN trade_masters tm ON td.trade_master_id = tm.id
      JOIN products p ON td.product_id = p.id
      WHERE tm.trade_date = ? 
        AND tm.trade_type = 'PURCHASE'
        AND tm.status != 'CANCELLED'
    `, [trade_date]);

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('기존 매입 내역 조회 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
