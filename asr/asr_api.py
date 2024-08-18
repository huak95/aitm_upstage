from fastapi import FastAPI, UploadFile, File
from typing import Optional
from asr_module import *

app = FastAPI()
asr_model = ASR()

@app.post("/transcribe/")
async def transcribe_audio(
    file         : UploadFile = File(...),
    speaker_name : Optional[str] = None,
    offset       : Optional[int] = 0
):
    audio_bytes = await file.read()
    transcription = asr_model.transcribe(audio_bytes, speaker_name, offset)
    
    return transcription

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
