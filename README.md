# Whisper Desktop Transcription

> High-performance, fully local speech-to-text for Windows

A GPU-accelerated desktop application combining a Python transcription engine with a modern Electron interface — delivering fast, private transcription without cloud dependencies.

---

## Highlights

- **Fully Local** — All inference runs on your machine; no data leaves the device
- **GPU Accelerated** — CUDA-optimized for fast, real-time transcription
- **Low Latency** — FastAPI backend with warm model loading for responsive requests
- **Modern UI** — Electron + React desktop experience
- **Smart Processing** — Voice activity detection reduces noise and hallucinations

---

## Architecture

The application is composed of two complementary layers:

**Backend** (`main.py`)
- FastAPI transcription service
- `faster-whisper` running on CUDA
- Persistent model kept in VRAM for low-latency responses

**Desktop App** (`whisper-panda/`)
- Electron desktop shell
- React-based user interface
- Native IPC bridge to the local API

---

## Technology Stack

| Component   | Stack                                   |
|-------------|-----------------------------------------|
| **Backend** | Python, FastAPI, faster-whisper         |
| **Frontend**| Electron, React, Vite                   |
| **GPU**     | CUDA / cuDNN runtime libraries          |

---

## Requirements

- Windows
- Python 3.10+
- Node.js 18+
- NVIDIA GPU with CUDA support

---

## CUDA / cuDNN Runtime Libraries

The CUDA and cuDNN DLLs are required at runtime and are not included in this repository.

Reference source for required libraries:
- https://github.com/Purfview/whisper-standalone-win/releases/tag/libs

Place the required DLLs in the project runtime path so the backend can access them.

---

## Model Configuration

Framework reference:
- https://github.com/SYSTRAN/faster-whisper

Current backend settings:

| Setting        | Value            |
|----------------|------------------|
| Model          | `large-v3`       |
| Device         | `cuda`           |
| Compute Type   | `int8_float16`   |

The model is downloaded automatically on first run if not already cached.

---

## Local Development

### Backend Setup

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install fastapi uvicorn python-multipart faster-whisper
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

Health check endpoint: `http://127.0.0.1:8000/health`

### Desktop App Setup

```powershell
cd whisper-panda
npm install
npm run dev
```

---

## Objective

Deliver production-quality local transcription with high accuracy, rapid turnaround, and complete data privacy for desktop users.
