import os
import re
import gc
import threading

# 1. DLL Override — must be at the very top
os.environ["PATH"] = r"D:\Whisper" + os.pathsep + os.environ.get("PATH", "")
os.add_dll_directory(r"D:\Whisper")

from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel
import tempfile
import shutil

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Model Management ─────────────────────────────────────────────────
MODEL_SIZE = "large-v3"
IDLE_UNLOAD_SECONDS = 30 * 60  # 30 minutes

model = None
model_lock = threading.Lock()
idle_timer = None


def _do_unload():
    """Called by the idle timer to free VRAM."""
    global model
    with model_lock:
        if model is not None:
            print("[Model] Idle timeout reached — unloading from VRAM to free memory.")
            del model
            model = None
            gc.collect()
            print("[Model] Unloaded. Will reload on next transcription request.")


def _reset_idle_timer():
    """Restart the 30-minute idle countdown."""
    global idle_timer
    if idle_timer is not None:
        idle_timer.cancel()
    idle_timer = threading.Timer(IDLE_UNLOAD_SECONDS, _do_unload)
    idle_timer.daemon = True
    idle_timer.start()


def _ensure_model_loaded():
    """Load model if not in memory. Thread-safe."""
    global model
    with model_lock:
        if model is None:
            print("[Model] Loading Whisper model into VRAM...")
            model = WhisperModel(MODEL_SIZE, device="cuda", compute_type="int8_float16")
            print("[Model] Loaded successfully.")
    _reset_idle_timer()


# Initial load on startup
print("Loading Whisper model into VRAM...")
_ensure_model_loaded()
print("Model loaded successfully! Ready for dictation.")

# ─── Personal Corrections ─────────────────────────────────────────────
# Add recurring misspellings here: "wrong text": "correct text"
CORRECTIONS = {
    # "fast api": "FastAPI",
}


def apply_corrections(text: str) -> str:
    for wrong, correct in CORRECTIONS.items():
        text = re.sub(re.escape(wrong), correct, text, flags=re.IGNORECASE)
    return text


# ─── Endpoints ────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": model is not None}


@app.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    # Reload model if idle-unloaded
    _ensure_model_loaded()

    suffix = ".webm" if "webm" in (file.content_type or "") else ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    try:
        segments, info = model.transcribe(
            tmp_path,
            language="en",
            beam_size=5,
            # Example-style prompt: Whisper mimics style, not instructions
            initial_prompt=(
                "Well, let me explain. First, we need to consider the options: A, B, and C. "
                "It's a straightforward process, isn't it? Yes, absolutely! "
                "The API response was 200 OK. I'll send an email about it."
            ),
            temperature=0.0,
            condition_on_previous_text=False,
            compression_ratio_threshold=2.4,
            log_prob_threshold=-1.0,
            no_speech_threshold=0.6,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=300),
        )

        full_text = " ".join([s.text.strip() for s in segments])
        full_text = apply_corrections(full_text)

        return {"text": full_text.strip(), "language": info.language}

    finally:
        os.remove(tmp_path)