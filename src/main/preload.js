/**
 * Renderer bridge (window.electronAPI). Built by electron-vite to
 * out/preload/index.cjs. Everything here is optional from the dashboard's
 * point of view: the same React app also runs in a plain browser
 * (npm run dev:web), where window.electronAPI is undefined and every caller
 * must no-op/hide.
 */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  reloadHotkeys: () => ipcRenderer.send('reload-hotkeys'),

  // In-app updater (src/main/updater.js)
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  getUpdateStatus: () => ipcRenderer.invoke('updater:get-status'),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  /** Subscribe to status pushes; returns an unsubscribe function. */
  onUpdateStatus: (callback) => {
    const handler = (_event, status) => callback(status);
    ipcRenderer.on('updater:status', handler);
    return () => ipcRenderer.removeListener('updater:status', handler);
  },
});
