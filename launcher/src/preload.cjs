// Pont minimal et sûr entre l'interface et Windows : seulement ces fonctions, rien d'autre.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcher', {
  scan: () => ipcRenderer.invoke('lib:scan'),
  action: (id, action) => ipcRenderer.invoke('item:action', id, action),
  setItem: (id, patch) => ipcRenderer.invoke('item:set', id, patch),
  settings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  win: (what) => ipcRenderer.send('win', what),
  onActive: (fn) => ipcRenderer.on('lib:active', (_e, ids) => fn(ids)),
  onUpdate: (fn) => ipcRenderer.on('lib:update', (_e, lib) => fn(lib)),
  details: (id) => ipcRenderer.invoke('item:details', id),
  openLink: (which) => ipcRenderer.invoke('open:link', which),
  reco: () => ipcRenderer.invoke('reco:get'),
  openReco: (steamId) => ipcRenderer.invoke('reco:open', steamId),
  stats: (period) => ipcRenderer.invoke('stats:get', period),
  nowPlaying: () => ipcRenderer.invoke('media:now'),
  mediaKey: (name) => ipcRenderer.invoke('media:key', name),
  ask: (message) => ipcRenderer.invoke('ai:ask', message),
});
