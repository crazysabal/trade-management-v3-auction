const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    startProcess: (type, command, cwd, port) => ipcRenderer.send('start-process', { type, command, cwd, port }),
    stopProcess: (type) => ipcRenderer.send('stop-process', { type }),
    onLog: (callback) => ipcRenderer.on('log-data', (event, data) => callback(data)),
    onStatusChange: (callback) => ipcRenderer.on('process-status', (event, data) => callback(data))
});
