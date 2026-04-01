import { useEffect, useState, useRef } from 'react'
import axios from 'axios'

const MAX_HISTORY = 5

function App() {
  const [isRecording, setIsRecording] = useState(false)
  const [backendReady, setBackendReady] = useState(false)
  const [status, setStatus] = useState('loading') // loading | ready | recording | processing | error
  const [hotkey, setHotkey] = useState('')
  const [startOnBoot, setStartOnBoot] = useState(false)
  const [history, setHistory] = useState([]) // [{text, id}]
  const [editingHotkey, setEditingHotkey] = useState(false)
  const [pendingKeys, setPendingKeys] = useState(null)
  const [copiedId, setCopiedId] = useState(null)
  const mediaRecorder = useRef(null)
  const audioChunks = useRef([])
  const hotkeyRef = useRef(null)

  // Load saved settings on mount
  useEffect(() => {
    window.api.getHotkey().then((raw) => setHotkey(formatHotkey(raw)))
    window.api.getStartupSetting().then(setStartOnBoot)
    window.api.onStartupSettingChanged(setStartOnBoot)
    window.api.onBackendReady(() => {
      setBackendReady(true)
      setStatus('ready')
    })
    window.api.onHotkeyChanged((raw) => setHotkey(formatHotkey(raw)))
  }, [])

  // Listen for global hotkey trigger
  useEffect(() => {
    window.api.onToggleRecord(() => {
      if (!backendReady) return
      setIsRecording((prev) => !prev)
    })
  }, [backendReady])

  // Microphone lifecycle
  useEffect(() => {
    if (isRecording) {
      setStatus('recording')
      window.api.showOverlay('recording')

      navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        mediaRecorder.current = new MediaRecorder(stream)
        audioChunks.current = []

        mediaRecorder.current.ondataavailable = (e) => {
          audioChunks.current.push(e.data)
        }

        mediaRecorder.current.onstop = async () => {
          stream.getTracks().forEach((track) => track.stop())
          setStatus('processing')
          window.api.showOverlay('processing')

          const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' })
          const formData = new FormData()
          formData.append('file', audioBlob, 'record.webm')

          // If request takes >5s the model is likely reloading from idle-unload
          const loadingTimer = setTimeout(() => {
            window.api.showOverlay('loading')
          }, 5000)

          try {
            const response = await axios.post('http://127.0.0.1:8000/transcribe', formData, {
              headers: { 'Content-Type': 'multipart/form-data' },
              timeout: 300000 // 5 min max — model reload can take ~60s
            })
            clearTimeout(loadingTimer)

            const text = response.data.text
            if (text) {
              const entry = { text, id: Date.now() }
              setHistory((prev) => [entry, ...prev].slice(0, MAX_HISTORY))
              window.api.typeText(text)
            }
            setStatus('ready')
            window.api.hideOverlay()
          } catch (error) {
            clearTimeout(loadingTimer)
            console.error('Transcription failed:', error)
            setStatus('error')
            window.api.hideOverlay()
            setTimeout(() => setStatus('ready'), 3000)
          }
        }

        mediaRecorder.current.start()
      }).catch((err) => {
        console.error('Microphone access denied:', err)
        setStatus('ready')
      })
    } else {
      if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
        mediaRecorder.current.stop()
      }
    }
  }, [isRecording])

  // Convert Electron accelerator format to user-friendly display
  function formatHotkey(raw = '') {
    return raw
      .replace('CommandOrControl', 'Ctrl')
      .replace('Command', 'Ctrl')
      .replace('Control', 'Ctrl')
      .replace(/\+/g, ' + ')
  }

  // Hotkey capture
  function handleHotkeyKeyDown(e) {
    e.preventDefault()
    // Escape cancels editing without applying anything
    if (e.key === 'Escape') { cancelHotkey(); return }
    // Enter confirms if we already have a pending key
    if (e.key === 'Enter') { confirmHotkey(); return }

    const modifiers = []
    if (e.ctrlKey) modifiers.push('CommandOrControl')
    if (e.shiftKey) modifiers.push('Shift')
    if (e.altKey) modifiers.push('Alt')

    // Skip bare modifier keypresses
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return

    // Use e.code-based name for special keys so Electron accepts them
    const SPECIAL_KEYS = {
      ' ': 'Space', 'ArrowUp': 'Up', 'ArrowDown': 'Down',
      'ArrowLeft': 'Left', 'ArrowRight': 'Right',
      'Pause': 'Pause', 'ScrollLock': 'ScrollLock',
      'PrintScreen': 'PrintScreen', 'Insert': 'Insert',
      'Delete': 'Delete', 'Home': 'Home', 'End': 'End',
      'PageUp': 'PageUp', 'PageDown': 'PageDown',
      'Tab': 'Tab', 'Backspace': 'Backspace',
    }
    const key = SPECIAL_KEYS[e.key] ?? e.key.toUpperCase()
    const combo = [...modifiers, key].join('+')
    setPendingKeys(combo)
  }

  async function confirmHotkey() {
    if (!pendingKeys) { setEditingHotkey(false); return }
    const success = await window.api.setHotkey(pendingKeys)
    if (success) {
      setHotkey(formatHotkey(pendingKeys))
    } else {
      // Registration failed — tell the user but don't leave them stuck
      alert(`Could not register "${pendingKeys}" as a hotkey. It may already be in use.`)
    }
    setPendingKeys(null)
    setEditingHotkey(false)
  }

  function cancelHotkey() {
    setPendingKeys(null)
    setEditingHotkey(false)
  }

  function copyText(entry) {
    navigator.clipboard.writeText(entry.text)
    setCopiedId(entry.id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  const statusLabel = {
    loading: 'Loading AI model…',
    ready: `Press ${hotkey}`,
    recording: 'Listening…',
    processing: 'Transcribing…',
    error: 'Connection error — is backend running?'
  }[status]

  return (
    <div className="app">
      {/* Header */}
      <div className="header">
        <div className="logo">
          <span className="logo-icon">🐼</span>
          <h1 className="title">WhisperPanda</h1>
        </div>
        <p className="subtitle">Local AI Dictation</p>
      </div>

      {/* Status Orb */}
      <div className="orb-wrap">
        <div
          className={`orb ${status} ${backendReady && status !== 'processing' ? 'clickable' : ''}`}
          onClick={() => { if (backendReady && status !== 'processing') setIsRecording(r => !r) }}
          title={backendReady ? (isRecording ? 'Stop recording' : 'Start recording') : ''}
        >
          <div className="orb-ring" />
          <div className="orb-core">
            {status === 'loading' && <LoadingIcon />}
            {status === 'ready' && <MicIcon />}
            {status === 'recording' && <WaveIcon />}
            {status === 'processing' && <SpinIcon />}
            {status === 'error' && <ErrorIcon />}
          </div>
        </div>
        <p className={`status-text ${status}`}>{statusLabel}</p>
      </div>

      {/* Transcription History */}
      <div className="history-section">
        {history.length === 0 ? (
          <p className="history-empty">Your transcriptions will appear here.</p>
        ) : (
          <div className="history-list">
            {history.map((entry, i) => (
              <div key={entry.id} className={`history-item ${i === 0 ? 'latest' : ''}`}>
                <p className="history-text">{entry.text}</p>
                <button
                  className={`copy-btn ${copiedId === entry.id ? 'copied' : ''}`}
                  onClick={() => copyText(entry)}
                  title="Copy to clipboard"
                >
                  {copiedId === entry.id ? <CheckIcon /> : <CopyIcon />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Settings */}
      <div className="settings">
        {/* Hotkey */}
        <div className="setting-row">
          <label>Hotkey</label>
          {editingHotkey ? (
            <div className="hotkey-capture">
              <div
                className="hotkey-input"
                ref={hotkeyRef}
                tabIndex={0}
                onKeyDown={handleHotkeyKeyDown}
                autoFocus
              >
                {pendingKeys ? formatHotkey(pendingKeys) : 'Press keys…'}
              </div>
              <button className="icon-btn confirm" onClick={confirmHotkey} title="Confirm">✓</button>
              <button className="icon-btn cancel" onClick={cancelHotkey} title="Cancel">✕</button>
            </div>
          ) : (
            <button className="hotkey-badge" onClick={() => setEditingHotkey(true)}>
              {hotkey}
              <EditIcon />
            </button>
          )}
        </div>

        {/* Start on boot */}
        <div className="setting-row">
          <label>Start on boot</label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={startOnBoot}
              onChange={(e) => {
                setStartOnBoot(e.target.checked)
                window.api.setStartupSetting(e.target.checked)
              }}
            />
            <span className="slider" />
          </label>
        </div>
      </div>

      <p className="hint">Minimize window to send to tray</p>
    </div>
  )
}

// ─── Inline SVG Icons ─────────────────────────────────────────────────
const MicIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
)

const WaveIcon = () => (
  <svg width="32" height="20" viewBox="0 0 32 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="2" y1="10" x2="2" y2="10" className="wave-bar bar1" />
    <line x1="8" y1="5" x2="8" y2="15" className="wave-bar bar2" />
    <line x1="14" y1="2" x2="14" y2="18" className="wave-bar bar3" />
    <line x1="20" y1="5" x2="20" y2="15" className="wave-bar bar4" />
    <line x1="26" y1="8" x2="26" y2="12" className="wave-bar bar5" />
    <line x1="32" y1="10" x2="32" y2="10" className="wave-bar bar1" />
  </svg>
)

const SpinIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="spin">
    <path d="M21 12a9 9 0 1 1-9-9" />
  </svg>
)

const LoadingIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="spin">
    <circle cx="12" cy="12" r="9" strokeDasharray="50" strokeDashoffset="15" />
  </svg>
)

const ErrorIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
)

const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
)

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

const EditIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: '6px', opacity: 0.6 }}>
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
)

export default App