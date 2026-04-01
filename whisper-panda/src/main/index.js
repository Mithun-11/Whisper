import { app, BrowserWindow, ipcMain, globalShortcut, clipboard, Tray, Menu, nativeImage, screen } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { keyboard, Key } from '@nut-tree-fork/nut-js'
import { spawn } from 'child_process'
import path from 'path'
import http from 'http'
import fs from 'fs'

// Speed up the automatic typing so it feels instant
keyboard.config.autoDelayMs = 0

// ─── Single Instance Lock ─────────────────────────────────────────────
// Prevents a second window from opening when the user clicks the taskbar icon.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // Someone tried to launch a second instance — focus our existing window instead.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

let mainWindow
let overlayWindow = null
let tray = null
let backendProcess = null

// ─── Settings Persistence ─────────────────────────────────────────────
const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json')

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'))
    }
  } catch (e) {
    console.error('[Settings] Failed to load:', e)
  }
  return { hotkey: 'Alt+PageDown', startOnBoot: false }
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8')
  } catch (e) {
    console.error('[Settings] Failed to save:', e)
  }
}

let settings = loadSettings()

// ─── Backend Server Management ───────────────────────────────────────
function startBackend() {
  const whisperDir = 'D:\\Whisper'
  const pythonPath = path.join(whisperDir, '.venv', 'Scripts', 'python.exe')

  backendProcess = spawn(pythonPath, ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8000'], {
    cwd: whisperDir,
    env: {
      ...process.env,
      PATH: whisperDir + ';' + process.env.PATH
    },
    stdio: ['pipe', 'pipe', 'pipe']
  })

  backendProcess.stdout.on('data', (data) => {
    console.log(`[Backend] ${data.toString().trim()}`)
  })

  backendProcess.stderr.on('data', (data) => {
    console.log(`[Backend] ${data.toString().trim()}`)
  })

  backendProcess.on('error', (err) => {
    console.error('[Backend] Failed to start:', err)
  })

  backendProcess.on('exit', (code) => {
    console.log(`[Backend] Exited with code ${code}`)
    backendProcess = null
  })

  console.log('[Backend] Starting FastAPI server...')
}

function waitForBackend() {
  return new Promise((resolve) => {
    const check = () => {
      http.get('http://127.0.0.1:8000/health', (res) => {
        if (res.statusCode === 200) {
          console.log('[Backend] Model loaded and ready!')
          resolve()
        } else {
          setTimeout(check, 1500)
        }
      }).on('error', () => {
        setTimeout(check, 1500)
      })
    }
    check()
  })
}

function killBackend() {
  if (backendProcess) {
    spawn('taskkill', ['/pid', backendProcess.pid.toString(), '/f', '/t'])
    backendProcess = null
    console.log('[Backend] Killed.')
  }
}

// ─── Hotkey Registration ──────────────────────────────────────────────
function registerHotkey(combo) {
  const previousCombo = settings.hotkey
  globalShortcut.unregisterAll()
  try {
    const ret = globalShortcut.register(combo, () => {
      if (mainWindow) mainWindow.webContents.send('toggle-record')
    })
    if (!ret) {
      console.log('[Hotkey] Registration failed for:', combo)
      // Restore the previous working hotkey
      if (previousCombo && previousCombo !== combo) {
        globalShortcut.register(previousCombo, () => {
          if (mainWindow) mainWindow.webContents.send('toggle-record')
        })
      }
      return false
    }
    settings.hotkey = combo
    saveSettings(settings)
    return true
  } catch (err) {
    console.error('[Hotkey] Invalid accelerator:', combo, err.message)
    // Restore previous working hotkey so the app isn't left with nothing
    if (previousCombo && previousCombo !== combo) {
      try {
        globalShortcut.register(previousCombo, () => {
          if (mainWindow) mainWindow.webContents.send('toggle-record')
        })
      } catch (_) {}
    }
    return false
  }
}

// ─── Window Creation ─────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 540,
    show: false,
    autoHideMenuBar: true,
    resizable: false,
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // Instead of quitting, hide to system tray
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.on('ready-to-show', () => {
    // Start hidden — user accesses via tray icon or taskbar
    // Comment the line below to show window on first launch
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ─── Floating Overlay Window ────────────────────────────────
// A second window: transparent pill that floats above all apps,
// passes mouse clicks through, and never steals keyboard focus.
function createOverlay() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  overlayWindow = new BrowserWindow({
    width: 220,
    height: 64,
    x: Math.round(width / 2) - 110,
    y: height - 90,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    focusable: false,
    hasShadow: false,
    skipTaskbar: true,
    show: true,
    opacity: 0,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })

  // All mouse events pass through to the app underneath
  overlayWindow.setIgnoreMouseEvents(true)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    // In dev, load from the filesystem directly (overlay is static HTML)
    overlayWindow.loadFile(join(__dirname, '../../src/renderer/overlay.html'))
  } else {
    overlayWindow.loadFile(join(__dirname, '../renderer/overlay.html'))
  }
}

function showOverlay(status) {
  if (!overlayWindow) return
  overlayWindow.setOpacity(1)
  overlayWindow.setAlwaysOnTop(true, 'pop-up-menu')
  overlayWindow.webContents.send('overlay-status', status)
}

function hideOverlay() {
  if (!overlayWindow) return
  overlayWindow.setOpacity(0)
}

// ─── System Tray ─────────────────────────────────────────────────────
function createTray() {
  const iconPath = join(__dirname, '../../resources/icon.png')
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
  tray = new Tray(icon)

  const buildMenu = () => Menu.buildFromTemplate([
    {
      label: 'Show WhisperPanda',
      click: () => {
        mainWindow.show()
        mainWindow.focus()
      }
    },
    { type: 'separator' },
    {
      label: 'Start on Boot',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (menuItem) => {
        app.setLoginItemSettings({ openAtLogin: menuItem.checked })
        settings.startOnBoot = menuItem.checked
        saveSettings(settings)
        if (mainWindow) {
          mainWindow.webContents.send('startup-setting-changed', menuItem.checked)
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true
        killBackend()
        app.quit()
      }
    }
  ])

  tray.setToolTip('WhisperPanda — Loading model...')
  tray.setContextMenu(buildMenu())

  // Single-click also shows the window (more intuitive)
  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.focus()
    } else {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  tray.on('double-click', () => {
    mainWindow.show()
    mainWindow.focus()
  })
}

// ─── App Lifecycle ───────────────────────────────────────────────────
app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.whisperpanda')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()
  createTray()
  createOverlay()

  startBackend()
  await waitForBackend()

  mainWindow.webContents.send('backend-ready')
  tray.setToolTip('WhisperPanda — Ready')

  // Show a brief "Ready" notification via the overlay so the user
  // knows the app is running even though the window is hidden
  setTimeout(() => {
    showOverlay('ready')
    setTimeout(() => hideOverlay(), 2500)
  }, 500) // small delay to let overlay window finish loading

  // Register saved hotkey
  registerHotkey(settings.hotkey)

  app.on('activate', () => {
    // macOS: don't create a new window, just show existing
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })
})

// ─── IPC Handlers ────────────────────────────────────────────────────

// Paste text: write to clipboard then simulate Ctrl+V
// The 150ms delay ensures the target app is focused before pasting
ipcMain.on('type-text', async (event, text) => {
  console.log('Pasting:', text)
  clipboard.writeText(text + ' ')
  await new Promise((r) => setTimeout(r, 150))
  await keyboard.pressKey(Key.LeftControl, Key.V)
  await keyboard.releaseKey(Key.LeftControl, Key.V)
})

// Overlay control
ipcMain.on('show-overlay', (_event, status) => showOverlay(status))
ipcMain.on('hide-overlay', () => hideOverlay())

// Hotkey management
ipcMain.handle('get-hotkey', () => settings.hotkey)

ipcMain.handle('set-hotkey', (event, combo) => {
  const success = registerHotkey(combo)
  if (success && mainWindow) {
    mainWindow.webContents.send('hotkey-changed', combo)
  }
  return success
})

// Start on boot setting
ipcMain.handle('get-startup-setting', () => {
  return app.getLoginItemSettings().openAtLogin
})

ipcMain.on('set-startup-setting', (event, enabled) => {
  app.setLoginItemSettings({ openAtLogin: enabled })
  settings.startOnBoot = enabled
  saveSettings(settings)
})

// ─── Cleanup ─────────────────────────────────────────────────────────
app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  killBackend()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.isQuitting = true
    killBackend()
    app.quit()
  }
})