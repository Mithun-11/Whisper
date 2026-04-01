import os
import sys
import re

# 1. The Ultimate DLL Override (Must be at the very top!)
os.environ["PATH"] = r"D:\Whisper" + os.pathsep + os.environ.get("PATH", "")
os.add_dll_directory(r"D:\Whisper")

from fastapi import FastAPI, UploadFile, File
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

# 3. Load the model globally so it stays "warm" in VRAM
#    int8_float16 is the fastest compute type for RTX cards — best speed/accuracy tradeoff.
print("Loading Whisper model into VRAM...")
model_size = "large-v3"
model = WhisperModel(model_size, device="cuda", compute_type="int8_float16")
print("Model loaded successfully! Ready for dictation.")

# 4. Personal dictionary — add recurring misspellings here.
#    Format: "wrong": "correct"
CORRECTIONS = {
    # Add your own as you spot them, e.g.:
    # "fast api": "FastAPI",
    # "java script": "JavaScript",
}

def apply_corrections(text: str) -> str:
    for wrong, correct in CORRECTIONS.items():
        text = re.sub(re.escape(wrong), correct, text, flags=re.IGNORECASE)
    return text


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    # Save the incoming audio to a temp file
    suffix = ".webm" if "webm" in (file.content_type or "") else ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_audio:
        shutil.copyfileobj(file.file, temp_audio)
        temp_audio_path = temp_audio.name

    try:
        segments, info = model.transcribe(
            temp_audio_path,
            language="en",
            beam_size=5,
            # Show Whisper the STYLE we want via example text, not instructions.
            # Good punctuation in the prompt → good punctuation in output.
            initial_prompt="Well, let me explain. First, we need to consider the options: A, B, and C. "
                           "It's a straightforward process, isn't it? Yes, absolutely! "
                           "The API response was 200 OK. I'll send an email about it.",
            # Strict accuracy: always pick the most likely word (no creativity).
            temperature=0.0,
            # For short dictation clips, don't bleed context from the previous recording.
            # This prevents the famous Whisper hallucination-loop bug.
            condition_on_previous_text=False,
            # Anti-hallucination guards: cut off if output is suspiciously repetitive
            # or the model confidence is very low.
            compression_ratio_threshold=2.4,
            log_prob_threshold=-1.0,
            no_speech_threshold=0.6,
            # VAD: strip leading/trailing silence to prevent empty-clip hallucinations.
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=300),
        )

        full_text = " ".join([segment.text.strip() for segment in segments])
        full_text = apply_corrections(full_text)

        return {
            "text": full_text.strip(),
            "language": info.language,
        }

    finally:
        os.remove(temp_audio_path)