import os
import shutil
from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize services
from app.asr.whisper_service import WhisperService
from app.agents.orchestrator import Orchestrator

app = FastAPI(title="CareScribe AI Microservice", version="1.0.0")

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

whisper_service = WhisperService()
orchestrator = Orchestrator()

TEMP_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "temp")
os.makedirs(TEMP_DIR, exist_ok=True)

@app.get("/health")
def health_check():
    return {
        "status": "operational",
        "gemini_configured": os.getenv("GEMINI_API_KEY") is not None
    }

@app.post("/process-audio")
async def process_audio(file: UploadFile = File(...), patientName: str = Form(None)):
    print(f"[FastAPI] Received process-audio request for file: {file.filename}, patientName: {patientName}")
    
    # Save the file locally in a temp directory
    temp_file_path = os.path.join(TEMP_DIR, f"temp_{file.filename}")
    try:
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        print(f"[FastAPI] Saved temporary file: {temp_file_path}")
        
        # 1. Transcribe the audio file using Gemini File API (Whisper alternative)
        transcript = whisper_service.transcribe(temp_file_path, patientName)
        print(f"[FastAPI] Transcription complete. Length: {len(transcript)} chars")
        
        # 2. Run agent orchestration (RAG + SOAP Note + Triage)
        result = orchestrator.process_transcript(transcript)
        print("[FastAPI] Orchestration pipeline complete.")
        
        return result
        
    except Exception as e:
        print(f"[FastAPI] Error processing audio request: {e}")
        raise HTTPException(status_code=500, detail=str(e))
        
    finally:
        # Cleanup temporary file
        if os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
                print(f"[FastAPI] Cleaned up temporary file: {temp_file_path}")
            except Exception as cleanup_err:
                print(f"[FastAPI] Failed to remove temp file: {cleanup_err}")


# ─── Transcript-only pipeline (no audio upload needed) ───────────────────────

class TranscriptRequest(BaseModel):
    transcript: str

@app.post("/process-transcript")
async def process_transcript_endpoint(body: TranscriptRequest):
    """
    Accepts a pre-built labeled transcript string (from dual-stream call recording)
    and runs the full orchestration pipeline: RAG → SOAP → Triage.
    Skips audio upload/transcription step entirely.
    """
    if not body.transcript or len(body.transcript.strip()) < 10:
        raise HTTPException(status_code=400, detail="Transcript is too short or empty")

    print(f"[FastAPI] /process-transcript called. Transcript length: {len(body.transcript)} chars")
    try:
        result = orchestrator.process_transcript(body.transcript)
        print("[FastAPI] /process-transcript pipeline complete.")
        return result
    except Exception as e:
        print(f"[FastAPI] /process-transcript error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Single-chunk transcription (for incremental ASR) ────────────────────────

@app.post("/transcribe-chunk")
async def transcribe_chunk(file: UploadFile = File(...), patientName: str = Form(None)):
    """
    Transcribes a single audio chunk (10–15 seconds).
    Returns only the text — no SOAP/triage generated here.
    """
    print(f"[FastAPI] /transcribe-chunk called for: {file.filename}, patientName: {patientName}")
    temp_file_path = os.path.join(TEMP_DIR, f"chunk_{file.filename}")
    try:
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        text = whisper_service.transcribe(temp_file_path, patientName)
        print(f"[FastAPI] Chunk transcribed: {len(text)} chars")
        return {"text": text}

    except Exception as e:
        print(f"[FastAPI] /transcribe-chunk error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        if os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
            except Exception:
                pass


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)

