const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');
const iconv = require('iconv-lite');
const fs = require('fs');

let mainWindow;
const processes = {
    backend: null,
    frontend: null
};

// [LICENSE] 기기 및 라이선스 정보 전역 변수 (최상단 배치로 초기화 오류 방지)
const HardwareInfo = require('./HardwareInfo'); // 런처 내부 복사본 사용 (패키징 호환성)
const MACHINE_ID = HardwareInfo.getMachineId();
let IS_LICENSED = false;
let LICENSE_MESSAGE = '라이선스 확인 중...';
let LICENSE_EXPIRY = ''; // [NEW] 라이선스 만료일 저장

// [LOGGING] 로그 파일 기록 함수
const LOG_DIR = path.join(os.homedir(), '.hongdabiz', 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

// [ENCODING] 스마트 디코딩 함수 (UTF-8 우선, 깨질 경우 CP949 시도)
function smartDecode(buffer) {
    try {
        const utf8String = buffer.toString('utf8');
        // UTF-8 디코딩 시 유효하지 않은 바이트(FFFD)가 포함되어 있다면 CP949로 시도
        if (utf8String.includes('\uFFFD')) {
            return iconv.decode(buffer, 'cp949');
        }
        return utf8String;
    } catch (e) {
        return iconv.decode(buffer, 'cp949');
    }
}

function writeLogToFile(type, message) {
    try {
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const logPath = path.join(LOG_DIR, `launcher_${today}.log`);
        const timestamp = new Date().toISOString();
        const logContent = `[${timestamp}] [${type}] ${message}\n`;
        fs.appendFileSync(logPath, logContent, 'utf8');
    } catch (e) {
        console.error('Failed to write log to file', e);
    }
}

// 윈도우 생성
async function createWindow() {
    await verifyLicense(); // [NEW] 창 띄우기 전 라이선스 먼저 확인

    mainWindow = new BrowserWindow({
        width: 1000,
        height: 920,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    mainWindow.loadFile('index.html');
}

// [SINGLE INSTANCE LOCK] 중복 실행 방지
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // 두 번째 인스턴스 실행 시 기존 창을 포커스
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });

    app.whenReady().then(async () => {
        // [CLEAN START] 런처 시작 전 혹시 남아있을 수 있는 잔류 프로세스 정리 (포트 3000, 5000)
        try {
            console.log('--- Checking for dangling processes (Port 3000, 5000) ---');
            await killPort(3000).catch(() => { });
            await killPort(5000).catch(() => { });
        } catch (e) { /* ignore cleanup errors */ }

        await createWindow();

        // [UPDATE CHECK] 온라인 버전 체크
        setTimeout(checkUpdateOnline, 1000); // 실행 1초 후 체크

        app.on('activate', function () {
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
        });
    });
}

ipcMain.on('get-version', (event) => {
    const fs = require('fs');
    const versionPath = path.join(PROJECT_ROOT, 'version.json');
    let version = 'unknown';
    if (fs.existsSync(versionPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
            version = data.version;
        } catch (e) {
            console.error('Failed to read version.json', e);
        }
    }
    event.reply('version-info', version);
});

ipcMain.on('get-license-info', (event) => {
    event.reply('license-info', {
        isLicensed: IS_LICENSED,
        message: LICENSE_MESSAGE,
        expiresAt: LICENSE_EXPIRY // [NEW] 만료일 정보 추가
    });
});

// [LICENSE] 기기 ID 전달
ipcMain.on('get-machine-id', (event) => {
    event.reply('machine-id', MACHINE_ID);
});


// 라이선스 검증 함수
async function verifyLicense() {
    const https = require('https');
    // [UPDATE] 사장님의 라이선스 관리 Gist 주소 (항상 최신본을 읽도록 타임스탬프 추가)
    const LICENSE_URL = `https://gist.githubusercontent.com/crazysabal/923caedede033de2dcdc9153a0fe25e3/raw/license_config.json?t=${Date.now()}`;

    return new Promise((resolve) => {
        https.get(LICENSE_URL, (res) => {
            let data = '';
            res.on('data', (d) => data += d);
            res.on('end', () => {
                try {
                    const config = JSON.parse(data);
                    const license = config.ALLOWED_MACHINES[MACHINE_ID];

                    if (!license) {
                        IS_LICENSED = false;
                        LICENSE_MESSAGE = `[미등록 기기] 라이선스가 승인되지 않았습니다. 관리자에게 등록을 요청하세요. (ID: ${MACHINE_ID})`;
                        LICENSE_EXPIRY = '미승인';
                        console.log('--- [License Result] NOT LICENSED (Unregistered ID) ---');
                    } else {
                        LICENSE_EXPIRY = license.expires_at; // 만료일 저장
                        const expiresAt = new Date(license.expires_at);
                        const today = new Date();
                        if (today > expiresAt) {
                            IS_LICENSED = false;
                            LICENSE_MESSAGE = `[기간 만료] 사용 기간이 종료되었습니다. (${license.expires_at}) 연장을 위해 관리자에게 문의하세요.`;
                            console.log('--- [License Result] EXPIRED ---');
                        } else {
                            IS_LICENSED = true;
                            LICENSE_MESSAGE = `[승인 완료] 유효 기간: ${license.expires_at}`;
                            console.log('--- [License Result] SUCCESS (Licensed) ---');
                        }
                    }
                } catch (e) {
                    // 서버 연결 실패나 JSON 파싱 실패 시 오프라인 유예 정책 (안전하게 허용)
                    IS_LICENSED = true;
                    LICENSE_MESSAGE = '[승인 성공] 라이선스 서버 연결 실패. 로컬 모드로 실행됩니다.';
                    LICENSE_EXPIRY = '서버 통신 오류';
                    console.log('--- [License Result] FALLBACK (Server Error) ---');
                }
                resolve();
            });
        }).on('error', () => {
            IS_LICENSED = true; // 서버 에러 시 일단 실행 (사용자 불편 방지)
            LICENSE_MESSAGE = '[승인 성공] 오프라인 상태입니다.';
            LICENSE_EXPIRY = '오프라인 (확인 불가)';
            resolve();
        });
    });
}

// 온라인 버전 체크 함수
async function checkUpdateOnline() {
    const https = require('https');
    const fs = require('fs');
    const rootPath = getProjectRoot();
    const versionPath = path.join(rootPath, 'version.json');

    // [UPDATE] 사장님의 실제 레포 주소 (캐시 방지 타임스탬프 추가)
    // 실제 레포: crazysabal/hongda-biz, 브랜치: master
    const REMOTE_VERSION_URL = `https://raw.githubusercontent.com/crazysabal/hongda-biz/master/version.json?t=${Date.now()}`;

    return new Promise((resolve) => {
        https.get(REMOTE_VERSION_URL, (res) => {
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => {
                try {
                    const localVersion = JSON.parse(fs.readFileSync(versionPath, 'utf8')).version;
                    const remoteVersion = JSON.parse(data).version;

                    // [FIX] 단순 문자열 비교(!==)가 아닌 버전 대소 비교 수행
                    // 예: 1.0.25 vs 1.0.24
                    const isNewer = compareVersions(remoteVersion, localVersion) > 0;

                    if (isNewer) {
                        mainWindow.webContents.send('update-available', { local: localVersion, remote: remoteVersion });
                        resolve({ available: true, local: localVersion, remote: remoteVersion });
                    } else {
                        resolve({ available: false, local: localVersion, remote: remoteVersion });
                    }
                } catch (e) {
                    resolve({ error: true, message: 'Parse error' });
                }
            });
        }).on('error', (err) => {
            resolve({ error: true, message: err.message });
        });
    });
}

// [UTIL] 버전 비교 (1: v1 > v2, -1: v1 < v2, 0: same)
function compareVersions(v1, v2) {
    const p1 = v1.split('.').map(Number);
    const p2 = v2.split('.').map(Number);
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
        const n1 = p1[i] || 0;
        const n2 = p2[i] || 0;
        if (n1 > n2) return 1;
        if (n1 < n2) return -1;
    }
    return 0;
}

// [NEW] 수동 업데이트 체크 IPC
ipcMain.on('manual-check-update', async (event) => {
    const result = await checkUpdateOnline();
    if (result && !result.available && !result.error) {
        event.reply('update-not-available', result.local);
    } else if (result && result.error) {
        event.reply('update-check-error', result.message);
    }
});

app.on('window-all-closed', function () {
    killAllProcesses();
    if (process.platform !== 'darwin') app.quit();
});

// [추가] 앱이 종료되기 직전에 한 번 더 확실하게 청소
app.on('before-quit', () => {
    killAllProcesses();
});

function killAllProcesses() {
    const { execSync } = require('child_process');
    Object.keys(processes).forEach(type => {
        const child = processes[type];
        if (child && child.pid) {
            try {
                if (os.platform() === 'win32') {
                    // [중요] execSync를 사용하여 종료 명령이 완료될 때까지 기다림
                    // /f: 강제 종료, /t: 자식 프로세스까지 모두 종료 (Tree-kill)
                    execSync(`taskkill /pid ${child.pid} /f /t`, { stdio: 'ignore' });
                } else {
                    child.kill('SIGKILL');
                }
            } catch (e) {
                // 이미 종료된 경우 등 에러 무시
            }
            processes[type] = null;
        }
    });
}

// [GLOBAL ERROR HANDLER] 프로그램이 갑자기 꺼지는 것을 방지
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('log-data', {
            type: 'backend',
            data: `\n[Fatal Error] 시스템 오류가 발생했습니다: ${err.message}\n`,
            isError: true
        });
    }
    writeLogToFile('FATAL', `시스템 오류가 발생했습니다: ${err.message}\n${err.stack}`);
});

const killPort = require('kill-port');

// [NEW] 프로젝트 루트 경로를 찾는 지능형 함수 (디렉토리 검증 강화)
function getProjectRoot() {
    const fs = require('fs');
    console.log('--- Root Path Discovery Starting ---');

    // 1. 개발 환경
    const devPath = path.resolve(__dirname, '..');
    if (fs.existsSync(path.join(devPath, 'backend')) && fs.existsSync(path.join(devPath, 'frontend'))) {
        console.log('Detected environment: Development');
        return devPath;
    }

    // 2. 패키징 환경 (더 깊게 탐색)
    let current = __dirname;
    for (let i = 0; i < 10; i++) { // 최대 10단계 위까지 탐색범위 확대
        if (fs.existsSync(path.join(current, 'backend')) && fs.existsSync(path.join(current, 'frontend'))) {
            console.log(`Detected environment: Packaged (Level ${i})`);
            return current;
        }
        const parent = path.resolve(current, '..');
        if (parent === current) break; // 드라이브 루트 도착
        current = parent;
    }

    // 3. 마지막 수단: 현재 실행 위치
    console.log('Detected environment: Fallback to CWD');
    return process.cwd();
}

const PROJECT_ROOT = getProjectRoot();

// IPC 통신
ipcMain.on('start-process', async (event, { type, command, cwd, port }) => {
    if (processes[type]) return;

    try {
        const fs = require('fs');
        const targetCwd = path.resolve(PROJECT_ROOT, cwd);

        // 상세 로그 출력 (진단용)
        const diagLog = `[System] Starting ${type.toUpperCase()}...\n` +
            `- Root: ${PROJECT_ROOT}\n` +
            `- Target: ${targetCwd}\n`;
        if (mainWindow) mainWindow.webContents.send('log-data', { type, data: diagLog });
        writeLogToFile('SYSTEM', diagLog);

        // 경로 존재 여부 체크 (ENOENT 방지 핵심)
        if (!fs.existsSync(targetCwd)) {
            const errMsg = `[Error] 실행 경로를 찾을 수 없습니다: ${targetCwd}\n설치 폴더 구조를 확인해주세요.\n`;
            if (mainWindow) mainWindow.webContents.send('log-data', { type, data: errMsg, isError: true });
            writeLogToFile('ERROR', errMsg);
            return;
        }

        if (port) {
            try {
                await killPort(port);
                if (mainWindow) mainWindow.webContents.send('log-data', { type, data: `[System] Port ${port} cleaned.\n` });
            } catch (e) { /* ignore */ }
        }

        const [cmd, ...args] = command.split(' ');
        const finalCmd = (os.platform() === 'win32' && cmd === 'npm') ? 'npm.cmd' : cmd;

        // 환경 변수 정규화
        const env = {
            ...process.env,
            BROWSER: 'none',
            FORCE_COLOR: 'true',
            PATH: process.env.PATH,
            ComSpec: process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe'
        };

        const child = spawn(finalCmd, args, {
            cwd: targetCwd,
            shell: true,
            env: env,
            windowsHide: true // 콘솔 창 숨김 (깔끔하게)
        });

        processes[type] = child;
        event.reply('process-status', { type, status: 'running' });

        child.stdout.on('data', (d) => {
            const decodedData = smartDecode(d);
            if (mainWindow) mainWindow.webContents.send('log-data', { type, data: decodedData });
            writeLogToFile(type, decodedData);
        });

        child.stderr.on('data', (d) => {
            const decodedData = smartDecode(d);
            if (mainWindow) mainWindow.webContents.send('log-data', { type, data: decodedData, isError: true });
            writeLogToFile(`${type}_ERROR`, decodedData);
        });

        child.on('error', (err) => {
            if (mainWindow) mainWindow.webContents.send('log-data', {
                type,
                data: `\n[Process Error] 실행 실패: ${err.message}\n`,
                isError: true
            });
        });

        child.on('close', (code) => {
            processes[type] = null;
            if (mainWindow) mainWindow.webContents.send('process-status', { type, status: 'stopped', code });
            if (mainWindow) mainWindow.webContents.send('log-data', { type, data: `\n[Process exited with code ${code}]\n` });
        });

    } catch (err) {
        console.error('Handled start error:', err);
        if (mainWindow) mainWindow.webContents.send('log-data', {
            type,
            data: `\n[Fatal Error] 명령 실행 중 오류 발생: ${err.message}\n`,
            isError: true
        });
    }
});

ipcMain.on('stop-process', (event, { type }) => {
    const child = processes[type];
    if (child) {
        try {
            if (os.platform() === 'win32') {
                spawn("taskkill", ["/pid", child.pid, '/f', '/t']);
            } else {
                child.kill();
            }
        } catch (e) { console.error('Stop error', e); }
        processes[type] = null;
        event.reply('process-status', { type, status: 'stopped' });
    }
});

ipcMain.on('open-external', (event, url) => {
    shell.openExternal(url);
});

ipcMain.on('minimize-window', () => {
    if (mainWindow) mainWindow.minimize();
});

ipcMain.on('open-logs-folder', () => {
    if (fs.existsSync(LOG_DIR)) {
        shell.openPath(LOG_DIR);
    }
});

// [NEW] 환경 변수(.env) 읽기/쓰기 IPC 핸들러
ipcMain.on('get-env', (event) => {
    try {
        const envPath = path.join(PROJECT_ROOT, 'backend', '.env');
        if (!fs.existsSync(envPath)) {
            return event.reply('env-info', {});
        }
        const content = fs.readFileSync(envPath, 'utf8');
        const env = {};
        content.split('\n').forEach(line => {
            const [key, ...value] = line.split('=');
            if (key && value) {
                env[key.trim()] = value.join('=').trim();
            }
        });
        event.reply('env-info', env);
    } catch (e) {
        console.error('Failed to read .env', e);
        event.reply('env-info', {});
    }
});

ipcMain.on('save-env', (event, newEnv) => {
    try {
        const envPath = path.join(PROJECT_ROOT, 'backend', '.env');
        let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

        for (const [key, value] of Object.entries(newEnv)) {
            const regex = new RegExp(`^${key}=.*`, 'm');
            if (content.match(regex)) {
                content = content.replace(regex, `${key}=${value}`);
            } else {
                content += `\n${key}=${value}`;
            }
        }

        fs.writeFileSync(envPath, content.trim() + '\n', 'utf8');
        event.reply('save-env-success', true);
        writeLogToFile('SYSTEM', `[Config] 환경 변수 업데이트됨: ${Object.keys(newEnv).join(', ')}`);
    } catch (e) {
        console.error('Failed to save .env', e);
        event.reply('save-env-success', false);
    }
});

// [UPDATE] 자동 업데이트 실행 연동
ipcMain.on('run-update', () => {
    const fs = require('fs');
    const rootPath = getProjectRoot();
    const updateBatPath = path.join(rootPath, 'Update_System.bat');

    if (fs.existsSync(updateBatPath)) {
        console.log('[Update] 자동 업데이트 배치 실행:', updateBatPath);

        // 새로운 cmd 창에서 배치 파일 실행 (detached: true 해야 런처가 꺼져도 계속됨)
        const { spawn } = require('child_process');
        spawn('cmd.exe', ['/c', 'start', '', updateBatPath], {
            cwd: rootPath,
            detached: true,
            stdio: 'ignore'
        }).unref();

        // 런처 종료
        setTimeout(() => {
            app.quit();
        }, 1000);
    } else {
        console.error('[Update] 업데이트 파일을 찾을 수 없습니다:', updateBatPath);
    }
});
