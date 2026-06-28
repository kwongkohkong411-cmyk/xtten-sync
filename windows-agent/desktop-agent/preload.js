const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('agentBridge', {
  getState: () => ipcRenderer.invoke('agent:state'),
  login: (payload) => ipcRenderer.invoke('auth:login', payload),
  logout: () => ipcRenderer.invoke('auth:logout'),
  start: () => ipcRenderer.invoke('agent:start'),
  stop: () => ipcRenderer.invoke('agent:stop'),
  setAutoStart: (enabled) => ipcRenderer.invoke('app:auto-start', enabled),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  applyUpdate: () => ipcRenderer.invoke('update:apply'),
});
