const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('clipNotice', {
  onShow: fn => ipcRenderer.on('clip-notice:show', (_event, payload) => fn(payload)),
});
