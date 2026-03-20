# Whisper Local (Windows)

Local speech-to-text stack:
- FastAPI backend using `faster-whisper` on CUDA
- Electron + React desktop UI in `whisper-panda/`

## Project Structure

- `main.py`: FastAPI transcription server
- `whisper-panda/`: Electron frontend app

## Prerequisites

- Windows
- Python 3.10+
- Node.js 18+
- NVIDIA GPU with CUDA support (for `device="cuda"`)

## 1. Python Setup (Backend)

Create and activate a virtual environment:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

Install dependencies:

```powershell
pip install fastapi uvicorn python-multipart faster-whisper
```

## 2. CUDA/cuDNN DLL Setup (Local)

This project expects CUDA/cuDNN runtime DLLs to be available from the project root path (`D:\Whisper` in current code).

DLL source link you shared:
- https://github.com/Purfview/whisper-standalone-win/releases/tag/libs

Place the required DLLs (such as `cublas*.dll` and `cudnn*.dll`) in the project root so `main.py` can load them.

## 3. Whisper Model Installation

Follow the model guidance from:
- https://github.com/SYSTRAN/faster-whisper

Current backend uses:
- model name: `large-v3`
- device: `cuda`
- compute type: `int8_float16`

On first run, `faster-whisper` will download model files automatically if not already cached.

## 4. Run Backend

From project root:

```powershell
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

Health check:
- `GET http://127.0.0.1:8000/health`

## 5. Electron Frontend Setup

```powershell
cd whisper-panda
npm install
npm run dev
```

## 6. Local Git Init

From project root:

```powershell
git init
git add .
git commit -m "Initial local commit"
git branch -M main
```

If you later connect GitHub remote:

```powershell
git remote add origin <your-repo-url>
git push -u origin main
```

## Notes

- `.gitignore` is configured at root for Python, Node/Electron, caches, and local media/runtime files.
- CUDA DLLs are currently optional in `.gitignore` (commented out). Uncomment those lines if you do not want DLLs tracked.
