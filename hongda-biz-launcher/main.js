const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

let mainWindow;
const processes = {
    backend: null,
    frontend: null
};

// 윈도우 생성
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 800,
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

    app.whenReady().then(() => {
        createWindow();

        app.on('activate', function () {
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
        });
    });
}

app.on('window-all-closed', function () {
    killAllProcesses();
    if (process.platform !== 'darwin') app.quit();
});

function killAllProcesses() {
    if (processes.backend) {
        process.kill(processes.backend.pid);
        processes.backend = null;
    }
    if (processes.frontend) {
        // Windows에서 kill을 확실히 하기 위해 tree-kill 같은 걸 쓸 수도 있지만,
        // 일단 기본 process.kill 사용. Windows에서는 taskkill이 필요할 수도 있음.
        if (os.platform() === 'win32') {
            try {
                spawn("taskkill", ["/pid", processes.frontend.pid, '/f', '/t']);
            } catch (e) { console.error(e) }
        } else {
            process.kill(processes.frontend.pid);
        }
        processes.frontend = null;
    }
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

        // 경로 존재 여부 체크 (ENOENT 방지 핵심)
        if (!fs.existsSync(targetCwd)) {
            const errMsg = `[Error] 실행 경로를 찾을 수 없습니다: ${targetCwd}\n설치 폴더 구조를 확인해주세요.\n`;
            if (mainWindow) mainWindow.webContents.send('log-data', { type, data: errMsg, isError: true });
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
            if (mainWindow) mainWindow.webContents.send('log-data', { type, data: d.toString() });
        });

        child.stderr.on('data', (d) => {
            if (mainWindow) mainWindow.webContents.send('log-data', { type, data: d.toString(), isError: true });
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
