// Status Tracker
const serverStatus = {
    backend: 'stopped',
    frontend: 'stopped'
};

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

function clearLog() {
    document.getElementById('log-combined').innerHTML = '';
}

// ANSI Code Stripper (Simple regex)
function stripAnsi(text) {
    return text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

function appendLog(type, data, isError) {
    const panel = document.getElementById('log-combined');

    const entry = document.createElement('div');
    entry.className = 'log-entry';
    if (isError) entry.classList.add('log-err');

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
});
