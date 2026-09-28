// Pont de la mini-barre de performances en jeu (lecture seule).
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('perfbar', { onData: (fn) => ipcRenderer.on('perfbar:data', (_e, d) => fn(d)) });
