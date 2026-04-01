import { contextBridge, ipcRenderer } from 'electron'

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('api', {
    // Recording toggle from global hotkey
    onToggleRecord: (callback) => {
      ipcRenderer.removeAllListeners('toggle-record')
      ipcRenderer.on('toggle-record', callback)
    },

    // Backend ready signal
    onBackendReady: (callback) => {
      ipcRenderer.removeAllListeners('backend-ready')
      ipcRenderer.on('backend-ready', callback)
    },

    // Paste transcribed text into the active app
    typeText: (text) => ipcRenderer.send('type-text', text),

    // Overlay control
    showOverlay: (status) => ipcRenderer.send('show-overlay', status),
    hideOverlay: () => ipcRenderer.send('hide-overlay'),

    // Hotkey management
    getHotkey: () => ipcRenderer.invoke('get-hotkey'),
    setHotkey: (combo) => ipcRenderer.invoke('set-hotkey', combo),
    onHotkeyChanged: (callback) => {
      ipcRenderer.removeAllListeners('hotkey-changed')
      ipcRenderer.on('hotkey-changed', (_event, value) => callback(value))
    },

    // Start on boot
    getStartupSetting: () => ipcRenderer.invoke('get-startup-setting'),
    setStartupSetting: (enabled) => ipcRenderer.send('set-startup-setting', enabled),
    onStartupSettingChanged: (callback) => {
      ipcRenderer.removeAllListeners('startup-setting-changed')
      ipcRenderer.on('startup-setting-changed', (_event, value) => callback(value))
    }
  })
}