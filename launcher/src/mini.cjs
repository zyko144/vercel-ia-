const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('mini', {
  data: () => ipcRenderer.invoke('mini:data'),
  act: (id, action) => ipcRenderer.send('mini:action', id, action),
  size: (h) => ipcRenderer.send('mini:size', h),
  onShown: (fn) => ipcRenderer.on('mini:shown', () => fn()),
});
