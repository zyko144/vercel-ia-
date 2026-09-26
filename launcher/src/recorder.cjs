// Pont de l'enregistreur de replay (fenêtre cachée) : démarrer sur un écran, rendre le clip demandé.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rec', {
  onStart: (fn) => ipcRenderer.on('rec:start', (_e, id) => fn(id)),
  onSave: (fn) => ipcRenderer.on('rec:save', () => fn()),
  onStop: (fn) => ipcRenderer.on('rec:stop', () => fn()),
  clip: (buf, mime) => ipcRenderer.send('rec:clip', buf, mime),
  state: (s) => ipcRenderer.send('rec:state', String(s)),
});
