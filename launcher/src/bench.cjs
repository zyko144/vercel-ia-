const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('bench', { done: (r) => ipcRenderer.send('bench:gpu', r) });
