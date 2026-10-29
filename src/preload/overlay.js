'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  onState: (cb) => ipcRenderer.on('state', (_e, state) => cb(state)),
  onChat: (cb) => ipcRenderer.on('chat', (_e, msg) => cb(msg)),
  onEmote: (cb) => ipcRenderer.on('emote', (_e, msg) => cb(msg)),
  onMove: (cb) => ipcRenderer.on('move', (_e, msg) => cb(msg)),
  onPositions: (cb) => ipcRenderer.on('positions', (_e, msg) => cb(msg)),
  onBump: (cb) => ipcRenderer.on('bump', (_e, msg) => cb(msg)),
  onRelayout: (cb) => ipcRenderer.on('relayout', () => cb()),
  onReset: (cb) => ipcRenderer.on('overlay:reset', () => cb()),
  setInteractive: (on) => ipcRenderer.invoke('overlay:interactive', on),
  setDragging: (on) => ipcRenderer.invoke('overlay:dragging', on),
  movePet: (id, x, y) => ipcRenderer.invoke('pet:move', { id, x, y }),
  grabPet: (id) => ipcRenderer.invoke('pet:grab', id),
  releasePet: (id, x, y, vx, vy) => ipcRenderer.invoke('pet:release', { id, x, y, vx, vy })
});
