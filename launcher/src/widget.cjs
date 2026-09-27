const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('widget', {
  onData: (fn) => ipcRenderer.on('widget:data', (_e, d) => fn(d)),
  open: () => ipcRenderer.send('widget:open'),
  close: () => ipcRenderer.send('widget:close'),
});
