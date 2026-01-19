// Status Tracker
const serverStatus = {
    backend: 'stopped',
    frontend: 'stopped'
};

let isLicensed = false; // [LICENSE] 승인 여부
let licenseMsg = '';

let isStartingAll = false; // [NEW] 통합 시작 중인지 추적
let isUpdateAvailable = false; // [NEW] 업데이트 발견 여부

function toggleServer(type) {
    // [LICENSE] 가드 추가
    if (!isLicensed && serverStatus[type] !== 'running') {
        alert('라이선스 오류:\n' + licenseMsg);
        return;
    }

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
    // [LICENSE] 가드 추가
    if (!isLicensed) {
        const isAnyRunning = serverStatus.backend === 'running' || serverStatus.frontend === 'running';
        if (!isAnyRunning) {
            console.warn('License not valid. Auto-start aborted.');
            return;
        }
    }

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

function openLogsFolder() {
    window.api.openLogsFolder();
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

    const cleanData = stripAnsi(data); // 매칭을 위해 ANSI 코드 제거

    // [시스템 로그] 특정 키워드 감지 시 시각적 피드백 제공 (디버깅용)
    if (isStartingAll) {
        if (type === 'backend' && (cleanData.includes('Server running') || cleanData.includes('Connected to MySQL'))) {
            appendLog('system', '▶ 백엔드 준비 완료 감지. 프론트엔드 시작 시퀀스 가동...', false);
            if (serverStatus.frontend !== 'running') {
                setTimeout(() => {
                    window.api.startProcess('frontend', 'npm run dev', 'frontend', 3000);
                }, 1000);
            }
        }

        if (type === 'frontend' && (cleanData.includes('Local:') || cleanData.includes('http://localhost:3000') || cleanData.includes('vite'))) {
            // "vite" 키워드 추가하여 더 넓게 매칭
            appendLog('system', '▶ 프론트엔드 준비 완료 감지. 브라우저 및 최소화 실행...', false);
            isStartingAll = false; // 시퀀스 완전 종료
            setTimeout(() => {
                if (isUpdateAvailable) {
                    appendLog('system', '💡 업데이트가 발견되어 브라우저 자동 실행 및 최소화를 건너뜁니다.', false);
                    return;
                }
                appendLog('system', '🌐 브라우저를 열고 런처를 최소화합니다.', false);
                window.api.openExternal('http://localhost:3000');
                setTimeout(() => {
                    window.api.minimizeWindow();
                }, 2000);
            }, 1500);
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

// [UPDATE] 온라인 업데이트 알림 수신
window.api.onUpdateAvailable(({ local, remote }) => {
    const banner = document.getElementById('update-banner');
    const verSpan = document.getElementById('remote-ver');
    if (banner && verSpan) {
        verSpan.textContent = remote;
        banner.style.display = 'block';
        isUpdateAvailable = true; // 플래그 설정
        appendLog('system', `🚀 새로운 업데이트가 발견되었습니다! (v${local} -> v${remote})`, false);
        appendLog('system', `💡 [지금 업데이트] 버튼을 클릭해 진행하세요.`, false);
    }
});

function checkManualUpdate() {
    appendLog('system', '🔍 업데이트 확인 중...', false);
    window.api.checkUpdate();
}

window.api.onUpdateNotAvailable((version) => {
    appendLog('system', `✅ 최신 버전을 사용 중입니다. (v${version})`, false);
    alert(`이미 최신 버전(v${version})입니다.`);
});

window.api.onUpdateError((msg) => {
    appendLog('system', `❌ 업데이트 확인 중 오류 발생: ${msg}`, true);
    alert(`업데이트 확인 실패:\n${msg}`);
});

function startAutoUpdate() {
    if (confirm('신규 업데이트를 설치하기 위해 프로그램을 종료하고 업데이트를 시작하시겠습니까?')) {
        appendLog('system', '🚀 자동 업데이트를 시작합니다. 런처가 곧 종료됩니다...', false);
        window.api.runUpdate();
    }
}
// [LICENSE] 기기 ID 처리
let currentMachineId = '';
window.api.onMachineId((id) => {
    currentMachineId = id;
    const display = document.getElementById('machine-id-display');
    if (display) display.textContent = id;
});

window.api.onVersion((ver) => {
    const display = document.getElementById('ver-text');
    if (display) display.textContent = ver;
});

window.api.onLicenseInfo((info) => {
    isLicensed = info.isLicensed;
    licenseMsg = info.message;
    console.log('[License Info]', info);

    // [NEW] 만료일 전용 UI 업데이트
    const expiryDisplay = document.getElementById('license-expiry-display');
    if (expiryDisplay) {
        if (info.expiresAt && info.expiresAt !== '미승인') {
            expiryDisplay.textContent = `만료일: ${info.expiresAt}`;
            expiryDisplay.style.color = '#238636'; // GitHub green
        } else {
            expiryDisplay.textContent = `만료일: ${info.expiresAt || '확인 불가'}`;
            expiryDisplay.style.color = isLicensed ? '#888' : '#da3633'; // normal or GitHub red
        }
    }

    // UI에 상태 표시
    if (!isLicensed) {
        appendLog('system', '⚠️ ' + licenseMsg, true);
    } else {
        appendLog('system', '✅ ' + licenseMsg, false);

        // [NEW] 라이선스 승인 완료 시 자동 시작 트리거 (최초 1회)
        if (!hasAutoStarted && !isStartingAll) {
            hasAutoStarted = true;
            appendLog('system', '🚀 라이선스 확인됨. 자동 시작 시퀀스를 가동합니다...', false);
            setTimeout(() => {
                toggleAll();
            }, 500); // UI 안정화를 위한 짧은 지연
        }
    }
});

async function copyMachineId() {
    if (currentMachineId) {
        const success = await copyToClipboard(currentMachineId);
        if (success) {
            const confirm = document.getElementById('copy-confirm');
            if (confirm) {
                confirm.style.display = 'block';
                setTimeout(() => confirm.style.display = 'none', 2000);
            }
        }
    }
}

// [NEW] 런처 실행 시 자동 시작 트리거
let hasAutoStarted = false;
window.onload = () => {
    console.log('--- 시스템 초기화 및 라이선스 체크 ---');

    // 정보 요청 (응답이 오면 위 onLicenseInfo에서 자동 시작 트리거됨)
    window.api.getMachineId();
    window.api.getLicenseInfo();
    window.api.getVersion();
};
