# ASR Module

This project provides an Automatic Speech Recognition (ASR) module using Hugging Face's Whisper model, integrated with a FastAPI server. The module supports uploading audio files for transcription and returns the transcribed text along with timestamps.

## Features

- **Audio Transcription**: Transcribe audio files via a FastAPI endpoint.
- **Speaker Identification**: Optionally specify speaker names in the transcription results.
- **Timestamped Transcriptions**: Output includes start and end timestamps for each transcribed chunk.

## Installation

```
pip install -r requirements.txt
```

## Usage

### FastAPI Server

1. Run the FastAPI server:

    ```bash
    uvicorn asr_api:app --host 0.0.0.0 --port 8000
    ```

2. Send a POST request to `/transcribe/` with an audio file to get the transcription.

    Example using `curl`:
    ```bash
    curl -X POST "http://localhost:8000/transcribe/" -H "accept: application/json" -H "Content-Type: multipart/form-data" -F "file=@path/to/your/audiofile.wav" -F "speaker_name=JohnDoe" -F "offset=0"
    ```

### API Endpoint: `/transcribe/`

This endpoint accepts an audio file and returns a JSON object containing the transcription and timestamps.

#### Arguments:

- `file` (required): The audio file to be transcribed. It should be in a format supported by the ASR model (e.g., `.wav`).
- `speaker_name` (optional): A string to identify the speaker in the transcription. This will be added as a column in the output.
- `offset` (optional): An integer to specify an offset in seconds to adjust the timestamps in the transcription.

## Configuration

### ASR Model

The ASR model is based on Hugging Face's Whisper model (`openai/whisper-large-v3`). It is configured to use GPU if available. You can modify the model by changing the `model_id` in the `get_asr_model()` method of `asr_module.py`.

### Audio Processing

The module uses `pydub` for handling audio files. Ensure your input files are in a supported format like `.wav`.

