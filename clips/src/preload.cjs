// Pont sécurisé entre l'interface de History Clips et le processus principal.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  list: () => ipcRenderer.invoke('clips:list'),
  open: (t, how) => ipcRenderer.invoke('clips:open', t, how),
  fav: (t) => ipcRenderer.invoke('clips:fav', t),
  rename: (t, name) => ipcRenderer.invoke('clips:rename', t, name),
  remove: (t) => ipcRenderer.invoke('clips:delete', t),
  trim: (t, start, end) => ipcRenderer.invoke('clips:trim', t, start, end),
  exportMp4: (t) => ipcRenderer.invoke('clips:export', t),
  discord: (t, to) => ipcRenderer.invoke('clips:discord', t, to),
  account: () => ipcRenderer.invoke('account:get'),
  login: (email, mdp, code, ticket) => ipcRenderer.invoke('account:login', email, mdp, code, ticket),
  logout: () => ipcRenderer.invoke('account:logout'),
  friends: () => ipcRenderer.invoke('account:friends'),
  settings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (p) => ipcRenderer.invoke('settings:set', p),
  pickFolder: () => ipcRenderer.invoke('settings:folder'),
  saveNow: () => ipcRenderer.invoke('clips:save'),
  site: () => ipcRenderer.invoke('app:site'),
  onChanged: (fn) => ipcRenderer.on('clips:changed', () => fn()),
});
