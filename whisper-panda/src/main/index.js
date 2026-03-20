import { app, BrowserWindow, ipcMain, globalShortcut, clipboard, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { keyboard, Key } from '@nut-tree-fork/nut-js'
import { spawn } from 'child_process'
import path from 'path'
import http from 'http'

// Speed up the automatic typing so it feels instant
keyboard.config.autoDelayMs = 0

let mainWindow
let tray = null
let backendProcess = null
let currentLanguage = 'en'

// ─── Backend Server Management ───────────────────────────────────────
function startBackend() {
  // Use the venv's Python to run uvicorn
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
        // Server not up yet, retry
        setTimeout(check, 1500)
      })
    }
    check()
  })
}

function killBackend() {
  if (backendProcess) {
    // On Windows, we need to kill the entire process tree
    spawn('taskkill', ['/pid', backendProcess.pid.toString(), '/f', '/t'])
    backendProcess = null
    console.log('[Backend] Killed.')
  }
}

// ─── Window Creation ─────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 520,
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
    // Start hidden — the user interacts via tray + hotkey
    // But show on first launch so they know the app is running
    mainWindow.show()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ─── System Tray ─────────────────────────────────────────────────────
function createTray() {
  const iconPath = join(__dirname, '../../resources/icon.png')
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
  tray = new Tray(icon)

  const contextMenu = Menu.buildFromTemplate([
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
        app.setLoginItemSettings({
          openAtLogin: menuItem.checked
        })
        // Notify the renderer about the change
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
  tray.setContextMenu(contextMenu)

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

  // 1. Create window + tray immediately (shows loading state)
  createWindow()
  createTray()

  // 2. Start the FastAPI backend and wait for it to be ready
  startBackend()
  await waitForBackend()

  // 3. Tell the renderer the backend is ready
  mainWindow.webContents.send('backend-ready')
  tray.setToolTip('WhisperPanda — Ready')

  // 4. Register the Global Hotkey only after backend is ready
  const ret = globalShortcut.register('CommandOrControl+Shift+Space', () => {
    mainWindow.webContents.send('toggle-record')
  })

  if (!ret) {
    console.log('Hotkey registration failed!')
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// ─── IPC Handlers ────────────────────────────────────────────────────

// Receive text from renderer and instantly paste it
ipcMain.on('type-text', async (event, text) => {
  console.log("Pasting:", text)
  clipboard.writeText(text + " ")
  await keyboard.pressKey(Key.LeftControl, Key.V)
  await keyboard.releaseKey(Key.LeftControl, Key.V)
})

// Language management
ipcMain.on('set-language', (event, lang) => {
  currentLanguage = lang
  console.log('Language set to:', lang)
})

ipcMain.handle('get-language', () => {
  return currentLanguage
})

// Start on boot setting
ipcMain.handle('get-startup-setting', () => {
  return app.getLoginItemSettings().openAtLogin
})

ipcMain.on('set-startup-setting', (event, enabled) => {
  app.setLoginItemSettings({ openAtLogin: enabled })
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