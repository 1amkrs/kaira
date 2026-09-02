const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  launchApp: (app) => ipcRenderer.invoke('launch-app', app),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  openPath: (path) => ipcRenderer.invoke('open-path', path),
  getDisplayInfo: () => ipcRenderer.invoke('get-display-info'),
  setFullscreen: (fullscreen) => ipcRenderer.invoke('set-fullscreen', fullscreen),
  executeSystemPower: (action) => ipcRenderer.invoke('system-power', action),
  getSystemDiagnostics: () => ipcRenderer.invoke('get-system-diagnostics'),
  getAudioDevices: () => ipcRenderer.invoke('get-audio-devices'),
  setAudioDevice: (deviceId) => ipcRenderer.invoke('set-audio-device', deviceId),
  getPlatformInfo: () => ipcRenderer.invoke('get-platform-info'),
  getAmbientStatus: () => ipcRenderer.invoke('ambient-status'),
  setAmbientMode: (mode) => ipcRenderer.invoke('ambient-mode', mode),
  setAmbientIntensity: (intensity) => ipcRenderer.invoke('ambient-intensity', intensity),
  getUblockStatus: () => ipcRenderer.invoke('ublock-status'),
  setUblockEnabled: (enabled) => ipcRenderer.invoke('ublock-toggle', enabled),
  setUblockAntiPopup: (enabled) => ipcRenderer.invoke('ublock-toggle-popup', enabled),
  resetUblockStats: () => ipcRenderer.invoke('ublock-reset-stats'),
  controlMedia: (action, value) => ipcRenderer.invoke('media-control', { action, value }),
  getSelfDebridStatus: () => ipcRenderer.invoke('get-self-debrid-status'),
  startSelfDebrid: () => ipcRenderer.invoke('start-self-debrid'),
  stopSelfDebrid: () => ipcRenderer.invoke('stop-self-debrid'),
  sendRemoteState: (state) => ipcRenderer.send('remote-state-sync', state),
  onRemoteCommand: (callback) => {
    const handler = (e, cmd) => callback(cmd);
    ipcRenderer.on('remote-command', handler);
    return () => ipcRenderer.removeListener('remote-command', handler);
  },
  onRemoteClientCount: (callback) => {
    const handler = (e, count) => callback(count);
    ipcRenderer.on('remote-client-count', handler);
    return () => ipcRenderer.removeListener('remote-client-count', handler);
  },
  getRemoteServerInfo: () => ipcRenderer.invoke('get-remote-server-info'),
});
