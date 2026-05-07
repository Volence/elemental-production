const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  reloadHotkeys: () => ipcRenderer.send('reload-hotkeys'),
});
