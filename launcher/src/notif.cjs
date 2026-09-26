// Pont minimal pour la fenêtre de notifications (en bas à gauche) : afficher les cartes, cliquer un bouton.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('notif', {
  onCards: (fn) => ipcRenderer.on('notif:cards', (_e, cards) => fn(cards)),
  act: (id, action) => ipcRenderer.send('notif:act', String(id), String(action)),
  hover: (on) => ipcRenderer.send('notif:hover', Boolean(on)),
});
