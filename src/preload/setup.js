'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (patch) => ipcRenderer.invoke('config:set', patch),
  listRooms: () => ipcRenderer.invoke('net:listRooms'),
  localIPs: () => ipcRenderer.invoke('net:localIPs'),
  host: (payload) => ipcRenderer.invoke('net:host', payload),
  join: (payload) => ipcRenderer.invoke('net:join', payload),
  leave: () => ipcRenderer.invoke('net:leave'),
  kick: (id) => ipcRenderer.invoke('net:kick', id),
  getState: () => ipcRenderer.invoke('state:get'),
  copy: (text) => ipcRenderer.invoke('clipboard:write', text),
  diagRun: () => ipcRenderer.invoke('diag:run'),
  diagPort: (ip, port) => ipcRenderer.invoke('diag:port', ip, port),
  hideSetup: () => ipcRenderer.invoke('ui:hideSetup'),
  onState: (cb) => ipcRenderer.on('state', (_e, state) => cb(state)),
  onToast: (cb) => ipcRenderer.on('toast', (_e, text) => cb(text))
});
