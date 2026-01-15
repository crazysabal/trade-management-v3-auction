// Status Tracker
const serverStatus = {
    backend: 'stopped',
    frontend: 'stopped'
};

let isStartingAll = false; // [NEW] 통합 시작 중인지 추적

function toggleServer(type) {
    if (serverStatus[type] === 'running') {
        window.api.stopProcess(type);
    } else {
        if (type === 'backend') {
            window.api.startProcess('backend', 'npm start', 'backend', 5000);
        } else {
            window.api.startProcess('frontend', 'npm run dev', 'frontend', 3000);
        }
    }
}

function toggleAll() {
    const isAnyRunning = serverStatus.backend === 'running' || serverStatus.frontend === 'running';

    if (isAnyRunning) {
        isStartingAll = false; // 중지 시에는 플래그 초기화
        if (serverStatus.backend === 'running') window.api.stopProcess('backend');
        if (serverStatus.frontend === 'running') window.api.stopProcess('frontend');
    } else {
        isStartingAll = true;
        // 백엔드 먼저 실행
        window.api.startProcess('backend', 'npm start', 'backend', 5000);
    }
}

function clearLog() {
    document.getElementById('log-combined').innerHTML = '';
}

// ANSI Code Stripper (Simple regex)
function stripAnsi(text) {
    return text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

// Copy to Clipboard
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (err) {
        console.error('Failed to copy: ', err);
        return false;
    }
}

function copyAllLogs() {
    const logs = document.querySelectorAll('#log-combined .log-entry');
    const texts = Array.from(logs).map(entry => {
        const content = entry.querySelector('.log-content');
        return content ? content.textContent : '';
    });

    if (texts.length > 0) {
        const fullText = texts.join('\n');
        copyToClipboard(fullText).then(success => {
            if (success) {
                // Visual feedback for all copy - maybe on the button?
                const btn = document.querySelector('.copy-btn');
                if (btn) {
                    const originalText = btn.textContent;
                    btn.textContent = 'Copied!';
                    setTimeout(() => btn.textContent = originalText, 1500);
                }
            }
        });
    }
}

function appendLog(type, data, isError) {
    const panel = document.getElementById('log-combined');

    const entry = document.createElement('div');
    entry.className = 'log-entry';
    if (isError) entry.classList.add('log-err');

    // Add Click-to-Copy
    entry.title = "Click to copy";
    entry.style.cursor = "pointer";
    entry.onclick = async () => {
        const success = await copyToClipboard(stripAnsi(data));
        if (success) {
            // Visual feedback
            entry.style.backgroundColor = "rgba(255, 255, 255, 0.2)";
            setTimeout(() => {
                entry.style.backgroundColor = "";
            }, 200);
        }
    };

    const tag = document.createElement('span');
    tag.className = `log-tag tag-${type}`;
    tag.textContent = type.toUpperCase();

    const content = document.createElement('span');
    content.className = 'log-content';
    content.textContent = stripAnsi(data); // Strip ANSI colors for clean text or use a library if color needed

    entry.appendChild(tag);
    entry.appendChild(content);
    panel.appendChild(entry);

    // Auto-scroll logic
    if (panel.scrollHeight - panel.scrollTop - panel.clientHeight < 200) {
        panel.scrollTop = panel.scrollHeight;
    }
}

// IPC Listeners
window.api.onLog(({ type, data, isError }) => {
    appendLog(type, data, isError);

    // [NEW] 통합 시작 중이고, 백엔드 로그에 특정 키워드가 나타나면 프론트엔드 실행
    if (isStartingAll && type === 'backend' && (data.includes('Server running') || data.includes('Connected to MySQL'))) {
        if (serverStatus.frontend !== 'running') {
            isStartingAll = false; // 시퀀스 완료
            setTimeout(() => {
                window.api.startProcess('frontend', 'npm run dev', 'frontend', 3000);
            }, 1000); // UI 안정화를 위해 1초 대기
        }
    }
});

window.api.onStatusChange(({ type, status }) => {
    serverStatus[type] = status;
    const group = document.getElementById(`status-${type}`);
    const btn = document.getElementById(`btn-${type}`);

    if (status === 'running') {
        group.classList.add('running');
        btn.textContent = 'STOP';
        btn.classList.remove('start');
        btn.classList.add('stop');
    } else {
        group.classList.remove('running');
        btn.textContent = 'START';
        btn.classList.remove('stop');
        btn.classList.add('start');
    }

    // 통합 버튼 상태 업데이트
    updateAllButtonStatus();
});

function updateAllButtonStatus() {
    const btnAll = document.getElementById('btn-all');
    const isAnyRunning = serverStatus.backend === 'running' || serverStatus.frontend === 'running';

    if (isAnyRunning) {
        btnAll.textContent = 'ALL STOP';
        btnAll.classList.remove('start');
        btnAll.classList.add('stop');
    } else {
        btnAll.textContent = 'ALL START';
        btnAll.classList.remove('stop');
        btnAll.classList.add('start');
    }
}
// [NEW] 런처 실행 시 자동 시작 트리거
window.onload = () => {
    console.log('--- 자동 시작 시퀀스 가동 ---');
    setTimeout(() => {
        toggleAll();
    }, 1000); // 윈도우 초기 안정화를 위해 1초 후 시작
};
