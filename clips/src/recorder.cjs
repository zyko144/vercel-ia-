// Pont de l'enregistreur de replay (fenêtre cachée) : démarrer sur un écran, envoyer chaque seconde (vidéo et micro) au disque.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rec', {
  onStart: (fn) => ipcRenderer.on('rec:start', (_e, id, opts) => fn(id, opts)),
  onStop: (fn) => ipcRenderer.on('rec:stop', () => fn()),
  chunk: (buf, kind) => ipcRenderer.send('rec:chunk', buf, kind),
  state: (s) => ipcRenderer.send('rec:state', String(s)),
});
