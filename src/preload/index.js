'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wow', Object.freeze({
  bootstrap: () => ipcRenderer.invoke('app:bootstrap'),
  daemon: Object.freeze({
    start: () => ipcRenderer.invoke('daemon:start'),
    stop: () => ipcRenderer.invoke('daemon:stop'),
    snapshot: () => ipcRenderer.invoke('daemon:snapshot'),
    onLog: (callback) => {
      const listener = (_event, entry) => callback(entry);
      ipcRenderer.on('daemon:log', listener);
      return () => ipcRenderer.removeListener('daemon:log', listener);
    }
  }),
  mining: Object.freeze({
    start: (address, threads) => ipcRenderer.invoke('mining:start', { address, threads }),
    stop: () => ipcRenderer.invoke('mining:stop')
  }),
  settings: Object.freeze({
    save: (settings) => ipcRenderer.invoke('settings:save', settings),
    chooseDataDirectory: () => ipcRenderer.invoke('dialog:data-directory')
  }),
  shell: Object.freeze({
    openDataDirectory: () => ipcRenderer.invoke('shell:open-data-directory'),
    openExternal: (url) => ipcRenderer.invoke('shell:open-external', url)
  })
}));

