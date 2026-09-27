// Pont minimal pour la bulle de message (en haut à droite, même en jeu) : afficher, ouvrir, répondre, fermer.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bubble', {
  onData: (fn) => ipcRenderer.on('bubble:data', (_e, d) => fn(d)),
  open: () => ipcRenderer.send('bubble:open'),
  close: () => ipcRenderer.send('bubble:close'),
  hover: (on) => ipcRenderer.send('bubble:hover', Boolean(on)),
  size: (h) => ipcRenderer.send('bubble:size', Number(h) || 0),
  app: () => ipcRenderer.send('bubble:app'),
  reply: (text) => ipcRenderer.invoke('bubble:reply', String(text ?? '').slice(0, 500)),
});
