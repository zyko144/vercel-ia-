const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('mini', {
  data: () => ipcRenderer.invoke('mini:data'),
  act: (id, action) => ipcRenderer.send('mini:action', id, action),
  onShown: (fn) => ipcRenderer.on('mini:shown', () => fn()),
});
