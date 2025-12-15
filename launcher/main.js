const { app, BrowserWindow, ipcMain } = require('electron');
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

app.whenReady().then(() => {
    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

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

const killPort = require('kill-port');

// IPC 통신
ipcMain.on('start-process', async (event, { type, command, cwd, port }) => {
    if (processes[type]) return;

    if (port) {
        try {
            await killPort(port);
            if (mainWindow) mainWindow.webContents.send('log-data', { type, data: `[System] Port ${port} cleaned.\n` });
        } catch (e) {
            // 포트가 사용 중이지 않으면 에러가 날 수 있음 (무시)
        }
    }

    const [cmd, ...args] = command.split(' ');

    // Windows 호환성 (npm.cmd 사용)
    const finalCmd = (os.platform() === 'win32' && cmd === 'npm') ? 'npm.cmd' : cmd;

    const child = spawn(finalCmd, args, {
        cwd: path.resolve(__dirname, '..', cwd),
        shell: true,
        env: {
            ...process.env,
            BROWSER: 'none',   // 브라우저 자동 실행 방지
            FORCE_COLOR: true, // 로그 색상 유지
        }
    });

    processes[type] = child;
    event.reply('process-status', { type, status: 'running' });

    child.stdout.on('data', (data) => {
        if (mainWindow) mainWindow.webContents.send('log-data', { type, data: data.toString() });
    });

    child.stderr.on('data', (data) => {
        if (mainWindow) mainWindow.webContents.send('log-data', { type, data: data.toString(), isError: true });
    });

    child.on('close', (code) => {
        processes[type] = null;
        if (mainWindow) mainWindow.webContents.send('process-status', { type, status: 'stopped', code });
        if (mainWindow) mainWindow.webContents.send('log-data', { type, data: `\n[Process exited with code ${code}]\n` });
    });
});

ipcMain.on('stop-process', (event, { type }) => {
    const child = processes[type];
    if (child) {
        if (os.platform() === 'win32') {
            spawn("taskkill", ["/pid", child.pid, '/f', '/t']);
        } else {
            child.kill();
        }
        processes[type] = null;
        event.reply('process-status', { type, status: 'stopped' });
    }
});
