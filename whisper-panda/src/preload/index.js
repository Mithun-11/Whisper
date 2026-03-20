import { contextBridge, ipcRenderer } from 'electron'

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('api', {
    // Listen for the hotkey press from the backend
    onToggleRecord: (callback) => {
      ipcRenderer.removeAllListeners('toggle-record')
      ipcRenderer.on('toggle-record', callback)
    },

    // Listen for backend ready signal
    onBackendReady: (callback) => {
      ipcRenderer.removeAllListeners('backend-ready')
      ipcRenderer.on('backend-ready', callback)
    },

    // Sends the transcribed text back to the backend for pasting
    typeText: (text) => ipcRenderer.send('type-text', text),

    // Language management
    setLanguage: (lang) => ipcRenderer.send('set-language', lang),
    getLanguage: () => ipcRenderer.invoke('get-language'),

    // Start on boot setting
    getStartupSetting: () => ipcRenderer.invoke('get-startup-setting'),
    setStartupSetting: (enabled) => ipcRenderer.send('set-startup-setting', enabled),
    onStartupSettingChanged: (callback) => {
      ipcRenderer.removeAllListeners('startup-setting-changed')
      ipcRenderer.on('startup-setting-changed', (_event, value) => callback(value))
    }
  })
}