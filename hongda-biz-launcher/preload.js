const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    startProcess: (type, command, cwd, port) => ipcRenderer.send('start-process', { type, command, cwd, port }),
    stopProcess: (type) => ipcRenderer.send('stop-process', { type }),
    onLog: (callback) => ipcRenderer.on('log-data', (event, data) => callback(data)),
    onStatusChange: (callback) => ipcRenderer.on('process-status', (event, data) => callback(data)),
    onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (event, data) => callback(data)),
    runUpdate: () => ipcRenderer.send('run-update'),
    getMachineId: () => ipcRenderer.send('get-machine-id'),
    onMachineId: (callback) => ipcRenderer.on('machine-id', (event, data) => callback(data)),
    getLicenseInfo: () => ipcRenderer.send('get-license-info'),
    onLicenseInfo: (callback) => ipcRenderer.on('license-info', (event, data) => callback(data)),
    getVersion: () => ipcRenderer.send('get-version'),
    onVersion: (callback) => ipcRenderer.on('version-info', (event, data) => callback(data)),
    openExternal: (url) => ipcRenderer.send('open-external', url),
    minimizeWindow: () => ipcRenderer.send('minimize-window'),
    // [NEW] 수동 업데이트 체크
    checkUpdate: () => ipcRenderer.send('manual-check-update'),
    onUpdateNotAvailable: (callback) => ipcRenderer.on('update-not-available', (event, data) => callback(data)),
    onUpdateError: (callback) => ipcRenderer.on('update-check-error', (event, data) => callback(data)),
    openLogsFolder: () => ipcRenderer.send('open-logs-folder')
});
