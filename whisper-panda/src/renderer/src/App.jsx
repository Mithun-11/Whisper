import { useEffect, useState, useRef } from 'react'
import axios from 'axios'

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'bn', name: 'বাংলা (Bangla)' },
  { code: 'hi', name: 'हिन्दी (Hindi)' },
  { code: 'ar', name: 'العربية (Arabic)' },
  { code: 'es', name: 'Español (Spanish)' },
  { code: 'fr', name: 'Français (French)' },
  { code: 'de', name: 'Deutsch (German)' },
  { code: 'ja', name: '日本語 (Japanese)' },
  { code: 'ko', name: '한국어 (Korean)' },
  { code: 'zh', name: '中文 (Chinese)' },
  { code: 'ru', name: 'Русский (Russian)' },
  { code: 'pt', name: 'Português (Portuguese)' },
  { code: 'tr', name: 'Türkçe (Turkish)' },
  { code: 'ur', name: 'اردو (Urdu)' }
]

function App() {
  const [isRecording, setIsRecording] = useState(false)
  const [backendReady, setBackendReady] = useState(false)
  const [status, setStatus] = useState('loading') // loading | ready | recording | processing
  const [language, setLanguage] = useState('en')
  const [startOnBoot, setStartOnBoot] = useState(false)
  const [lastText, setLastText] = useState('')
  const mediaRecorder = useRef(null)
  const audioChunks = useRef([])

  // Load saved settings on mount
  useEffect(() => {
    window.api.getLanguage().then(setLanguage)
    window.api.getStartupSetting().then(setStartOnBoot)
    window.api.onStartupSettingChanged(setStartOnBoot)
    window.api.onBackendReady(() => {
      setBackendReady(true)
      setStatus('ready')
    })
  }, [])

  // Listen for the global hotkey trigger
  useEffect(() => {
    window.api.onToggleRecord(() => {
      if (!backendReady) return // Ignore hotkey if backend isn't ready
      setIsRecording((prev) => !prev)
    })
  }, [backendReady])

  // Handle the Microphone Lifecycle
  useEffect(() => {
    if (isRecording) {
      setStatus('recording')
      setLastText('')

      navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        mediaRecorder.current = new MediaRecorder(stream)
        audioChunks.current = []

        mediaRecorder.current.ondataavailable = (e) => {
          audioChunks.current.push(e.data)
        }

        mediaRecorder.current.onstop = async () => {
          // Immediately release the microphone
          stream.getTracks().forEach((track) => track.stop())

          setStatus('processing')

          const audioBlob = new Blob(audioChunks.current, { type: 'audio/wav' })
          const formData = new FormData()
          formData.append('file', audioBlob, 'record.wav')
          formData.append('language', language)

          try {
            const response = await axios.post('http://127.0.0.1:8000/transcribe', formData, {
              headers: { 'Content-Type': 'multipart/form-data' }
            })

            const text = response.data.text
            if (text) {
              setLastText(text)
              window.api.typeText(text)
            }
          } catch (error) {
            console.error('Transcription failed:', error)
            setLastText('⚠ Connection failed. Is the backend running?')
          }

          setStatus('ready')
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

  const handleLanguageChange = (e) => {
    const lang = e.target.value
    setLanguage(lang)
    window.api.setLanguage(lang)
  }

  const handleStartOnBoot = (e) => {
    const enabled = e.target.checked
    setStartOnBoot(enabled)
    window.api.setStartupSetting(enabled)
  }

  return (
    <div className="app">
      {/* Header */}
      <div className="header">
        <h1 className="title">🐼 WhisperPanda</h1>
        <p className="subtitle">Local AI Dictation</p>
      </div>

      {/* Status Orb */}
      <div className="status-container">
        <div className={`orb ${status}`}>
          <div className="orb-inner">
            {status === 'loading' && '⏳'}
            {status === 'ready' && '🎙️'}
            {status === 'recording' && '🔴'}
            {status === 'processing' && '⚡'}
          </div>
        </div>
        <p className="status-text">
          {status === 'loading' && 'Loading model into GPU...'}
          {status === 'ready' && 'Ready — Press Ctrl+Shift+Space'}
          {status === 'recording' && 'Listening...'}
          {status === 'processing' && 'Transcribing...'}
        </p>
      </div>

      {/* Last transcription preview */}
      {lastText && (
        <div className="last-text">
          <p>{lastText}</p>
        </div>
      )}

      {/* Settings */}
      <div className="settings">
        <div className="setting-row">
          <label htmlFor="language">Language</label>
          <select id="language" value={language} onChange={handleLanguageChange}>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </div>

        <div className="setting-row">
          <label htmlFor="startup">Start on boot</label>
          <label className="toggle">
            <input
              type="checkbox"
              id="startup"
              checked={startOnBoot}
              onChange={handleStartOnBoot}
            />
            <span className="slider" />
          </label>
        </div>
      </div>

      <p className="hint">Close window to minimize to tray</p>
    </div>
  )
}

export default App