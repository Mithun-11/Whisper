# 🎤 Whisper Desktop Transcription

> **High-performance, fully local speech-to-text for Windows**

A GPU-accelerated desktop application that combines a Python transcription engine with a modern Electron interface—delivering fast, private transcription without cloud dependencies.

---

## ✨ Highlights

- 🔒 **Fully Local** — All inference runs on your machine
- ⚡ **GPU Accelerated** — CUDA-optimized for fast transcription
- 🎯 **Low Latency** — FastAPI backend with warm model loading
- 🖥️ **Modern UI** — Electron + React desktop experience
- 🎙️ **Smart Processing** — Voice activity detection reduces noise & hallucinations

---

## 🏗️ Architecture

Two complementary layers working in harmony:

**Backend** (`main.py`)
- FastAPI transcription service
- `faster-whisper` running on CUDA
- Persistent model in VRAM for responsive requests

**Desktop App** (`whisper-panda/`)
- Electron desktop shell
- React-based user interface
- Native IPC to local API

---

## 🛠️ Technology Stack

| Component | Stack |
|-----------|-------|
| **Backend** | Python, FastAPI, faster-whisper |
| **Frontend** | Electron, React, Vite |
| **GPU** | CUDA/cuDNN runtime libraries |

---

## 📋 Requirements

- Windows
- Python 3.10+
- Node.js 18+
- NVIDIA GPU with CUDA support

---

## 📦 CUDA/cuDNN Runtime Libraries

CUDA/cuDNN DLLs are required at runtime (not included in repo).

**Reference library source:**
- https://github.com/Purfview/whisper-standalone-win/releases/tag/libs

Place required DLLs in the project runtime path for the backend to access.

---

## 🧠 Model Configuration

**Framework reference:**
- https://github.com/SYSTRAN/faster-whisper

**Current backend settings:**

| Setting | Value |
|---------|-------|
| Model | `large-v3` |
| Device | `cuda` |
| Compute Type | `int8_float16` |

*Model downloads automatically on first run if not cached.*

---

## 🚀 Local Development

### Backend Setup

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install fastapi uvicorn python-multipart faster-whisper
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

**Health check:** http://127.0.0.1:8000/health

### Desktop App Setup

```powershell
cd whisper-panda
npm install
npm run dev
```

---

## 🎯 Mission

Deliver **production-quality** local transcription with exceptional accuracy, rapid turnaround, and absolute data privacy for desktop users.
