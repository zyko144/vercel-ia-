// Pont de l'enregistreur de replay (fenêtre cachée) : démarrer sur un écran, envoyer chaque seconde de vidéo au disque.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rec', {
  onStart: (fn) => ipcRenderer.on('rec:start', (_e, id, opts) => fn(id, opts)),
  onStop: (fn) => ipcRenderer.on('rec:stop', () => fn()),
  chunk: (buf) => ipcRenderer.send('rec:chunk', buf),
  state: (s) => ipcRenderer.send('rec:state', String(s)),
});
