'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  send: (text) => ipcRenderer.invoke('chat:send', text),
  sendEmote: (emote) => ipcRenderer.invoke('emote:send', emote),
  setPanel: (open) => ipcRenderer.invoke('chat:panel', open),
  leave: () => ipcRenderer.invoke('net:leave'),
  showSetup: () => ipcRenderer.invoke('ui:showSetup'),
  setCollapsed: (collapsed) => ipcRenderer.invoke('chat:collapse', collapsed),
  onState: (cb) => ipcRenderer.on('state', (_e, state) => cb(state)),
  onChat: (cb) => ipcRenderer.on('chat', (_e, msg) => cb(msg)),
  onToast: (cb) => ipcRenderer.on('toast', (_e, text) => cb(text)),
  onPanel: (cb) => ipcRenderer.on('panel-state', (_e, state) => cb(state)),
  onFocusInput: (cb) => ipcRenderer.on('focus-input', () => cb())
});
