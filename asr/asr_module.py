import torch
from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor, pipeline
import pandas as pd
from glob import glob
from pydub import AudioSegment
import json

class ASR():
    def __init__(self):
        self.asr_model = self.get_asr_model()
        
    def transcribe(self, audio_file, speaker_name, offset):
        if isinstance(audio_file, str):
            with open(audio_file, "rb") as f:
                audio_file = f.read()
                
        result       = self.asr_model(audio_file, return_timestamps=True)['chunks']
        result_df    = self.convert_whisper_output_format(result, speaker_name, offset)
        
        json_output = result_df.to_json(orient='records', force_ascii=False)
        # data        = {"output": json.loads(json_output)}
        return json.loads(json_output)
    
    def get_asr_model(self):
        device = "cuda:0" if torch.cuda.is_available() else "cpu"
        torch_dtype = torch.float16 if torch.cuda.is_available() else torch.float32

        model_id = "openai/whisper-large-v3"

        model = AutoModelForSpeechSeq2Seq.from_pretrained(
            model_id, torch_dtype=torch_dtype, low_cpu_mem_usage=True, use_safetensors=True
        )
        model.to(device)

        processor = AutoProcessor.from_pretrained(model_id)

        pipe = pipeline(
            "automatic-speech-recognition",
            model=model,
            tokenizer=processor.tokenizer,
            feature_extractor=processor.feature_extractor,
            torch_dtype=torch_dtype,
            device=device,
            chunk_length_s=30,
            # stride_length_s=3,
            generate_kwargs={"language": "english"},
        )
        return pipe
    
    def convert_whisper_output_format(self, data, speaker_name=None, offset=0):
        df            = pd.DataFrame(data)
        df['speaker'] = speaker_name
        df['start']   = df['timestamp'].map(lambda x: x[0]) + offset
        df['end']     = df['timestamp'].map(lambda x: x[1]) + offset
        df            = df.drop(columns=['timestamp'])
        return df

def get_speaker_name(audio_path):
    return audio_path.split('-')[2].split('_')[0].split('.')[0]
   
def get_offset(audio_paths):
    '''
    input: list of audio path
    output: list of offset
    '''
    lenght = []
    for audio_path in audio_paths:
        lenght.append(len(AudioSegment.from_file(audio_path)) / 1000)
    df = pd.DataFrame([audio_paths, lenght], index=['audio_path', 'duration']).T
    df['offsets'] = (df['duration'].max() - df['duration']).map(int).tolist()
    return dict(df.drop(columns=['duration']).values)

def combine_sort(json_list):
    '''
    input: list of each output from asr api
    output: sorted dataframe
    '''
    df = pd.DataFrame(sum(json_list, [])).sort_values('start')
    json_output = df.to_json(orient='records', force_ascii=False)
    data        = {"output": json.loads(json_output)}
    with open('output.json', 'w', encoding='utf-8') as file:
        json.dump(data, file, ensure_ascii=False, indent=4)
    return data
