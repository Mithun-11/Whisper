import os
import sys

# 1. The Ultimate DLL Override (Must be at the very top!)
os.environ["PATH"] = r"D:\Whisper" + os.pathsep + os.environ.get("PATH", "")
os.add_dll_directory(r"D:\Whisper")

from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel
import tempfile
import shutil

app = FastAPI()

# 2. Allow Electron to communicate with this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3. Load the model into the RTX 4060 globally so it stays "warm"
print("Loading Whisper model into VRAM...")
model_size = "large-v3"
model = WhisperModel(model_size, device="cuda", compute_type="int8_float16")
print("Model loaded successfully! Ready for dictation.")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...), language: str = Form("en")):
    # Create a temporary file to hold the incoming audio buffer
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_audio:
        shutil.copyfileobj(file.file, temp_audio)
        temp_audio_path = temp_audio.name

    try:
        # 4. Transcribe with VAD enabled to chop off silence and prevent hallucinations
        segments, info = model.transcribe(
            temp_audio_path, 
            beam_size=5,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=500),
            language=language,
            initial_prompt="Hello! This is a professional transcription. Please use proper punctuation, commas, and capitalization."
        )

        # Stitch all the spoken segments together into one string
        full_text = " ".join([segment.text for segment in segments])

        return {
            "text": full_text.strip(), 
            "language": info.language
        }
    
    finally:
        # Always clean up the temp file so your hard drive doesn't fill up
        os.remove(temp_audio_path)