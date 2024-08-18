import pandas as pd
import json
import glob

from dotenv import load_dotenv
import os

load_dotenv()

UPSTAGE_API_KEY = os.getenv("UPSTAGE_API_KEY")
import argparse

from rapper import RetrievalAugmentation, BaseSummarizationModel, BaseQAModel, BaseEmbeddingModel, RetrievalAugmentationConfig, chat
from openai import OpenAI # openai==1.2.0
from fastapi import  FastAPI, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional

import concurrent.futures
import time

app = FastAPI()

# Define Main Function
def get_response(
        system_prompt, 
        user_prompt, 
        model_name="solar-1-mini-chat",
        temperature=0.7,
        # top_k=50,
        top_p=0.95,
        max_tokens_to_generate=4096,
        base_url="https://api.upstage.ai/v1/solar",
        api_key="<api-key>",
        ):
    
    client = OpenAI(
        api_key=api_key,
        base_url=base_url
    )

    response = client.chat.completions.create(
        model=model_name,
        messages=[
            {
            "role": "system",
            "content": system_prompt
            },
            {
            "role": "user",
            "content": user_prompt
            }
        ],
        stream=False,
        temperature=temperature,
        # top_k=top_k,
        top_p=top_p,
        max_tokens=max_tokens_to_generate,
    )

    return response.dict()['choices'][0]['message']['content']

# You can define your own Summarization model by extending the base Summarization Class. 
class SolarSummarizationModel(BaseSummarizationModel):
    def __init__(self, model_name="solar-1-mini-chat"):
        # Initialize the tokenizer and the pipeline for the typhoon model
        self.model_name = model_name

    def summarize(self, context, max_tokens=256):
        # Format the prompt for summarization
        
        # Generate the summary using the typhoon.
        system_prompt = "You are a helpful assistant. You always answer in English."
        user_prompt = f"Write a summary of the following, including as many key details as possible: {context}:"
        summary = get_response(
            system_prompt,
            user_prompt,
            temperature=0.7,
            top_p=0.95,
            model_name=self.model_name,
            max_tokens_to_generate=max_tokens,
            api_key=UPSTAGE_API_KEY,
            )
        
        # Extracting and returning the generated summary
        return summary

class SolarQATranscriptionModel(BaseQAModel):
    def __init__(self, model_name="solar-1-mini-chat"):
        # Initialize the tokenizer and the pipeline for the typhoon model
        self.model_name = model_name

    def answer_question(self, context, question):
        # Apply the chat template for the context and question
        system_prompt = "You are assistant, efficient in answer question in meeting transcription. You always answer in English."
        user_prompt = f"{question}\n```transcription\n{context}\n```"

        # Generate the answer using typhoon
        answer = get_response(
            system_prompt, 
            user_prompt,
            temperature=0.7,
            top_p=0.95,
            model_name=self.model_name,
            api_key=UPSTAGE_API_KEY,
            )
        return answer

from sentence_transformers import SentenceTransformer

class BGEm3EmbeddingModel(BaseEmbeddingModel):
    def __init__(self, model_name="BAAI/bge-m3"):
        self.model = SentenceTransformer(model_name)

    def create_embedding(self, text):
        return self.model.encode(text)

class UpstageEmbeddingModel(BaseEmbeddingModel):
    def __init__(self, model_name='solar-embedding-1-large-query'):
        self.model_name = model_name
        self.client = OpenAI(
            api_key=UPSTAGE_API_KEY,
            base_url="https://api.upstage.ai/v1/solar"
        )

    def create_embedding(self, text):
        response = self.client.embeddings.create(
            input=text,
            model=self.model_name
            )
        return response.data[0].embedding

def load_df(path):
    with open(path, 'r') as f:
        d = json.load(f)

    df = pd.DataFrame(d['output'])
    df['speaker'] = os.path.basename(path).split('-')[0]
    return df

def get_script_with_timestamp_sort(df):
    script = ""
    for i, r in df.sort_values(["start"]).iterrows():
        script += f"[{r.speaker},{r.start:.1f}-{r.end:.1f}]: {r.text}" 
        script += "\n"
    return script

def get_script_without_timestamp_sort(df):
    script = ""
    for i, r in df.sort_values(["start"]).iterrows():
        script += f"[{r.speaker}]: {r.text}" 
        script += "\n"
    return script

def SolarRapperQA(input_dict):
    """
    input_dict = [{
    "text": "Hello everyone Let's have a meeting about the progress of the work soon.",
    "speaker": "ninewithane",
    "start": 0.009,
    "end": 4.582
    },]
    """
    
    # Init Rag
    RAC = RetrievalAugmentationConfig(
        summarization_model=SolarSummarizationModel(), 
        qa_model=SolarQATranscriptionModel(), 
        # embedding_model=BGEm3EmbeddingModel(),
        tb_embedding_models={'OpenAI': UpstageEmbeddingModel('solar-embedding-1-large-passage')}, # Tree Builder
        tr_embedding_model=UpstageEmbeddingModel('solar-embedding-1-large-query'), # Tree Retriver
        tb_max_tokens=1024,
        tb_num_layers=3,
        tb_summarization_length=256,
        )

    RA_MITM = RetrievalAugmentation(config=RAC,)

    # load json and turn into script
    all_df = pd.DataFrame(input_dict)
    script = get_script_without_timestamp_sort(all_df)
    # os.makedirs(args.save_dir, exist_ok=True)
    # with open(os.path.join(args.save_dir, args.save_text), 'w') as f:
    #     f.write(script)

    RA_MITM.add_documents(script)

    # Create Prompt
    all_users = all_df['speaker'].unique().tolist()

    querys = [
        'Which users spoke in this meeting? Only from [name]. Answer in bullet form',
        'What are the 3 main agendas of this meeting? Tell them in ordered lists',
        'Please summarize this meeting. Tell them in short bullets',
        'What should not be talked about in this meeting? Why is that? Explain step by step. Tell them in ordered lists',
        'What should be done to make this meeting better? In terms of how to speak. Why is that? Explain step by step',
    ]

    qtitles = [
        'Who is attending this meeting?',
        'Main agenda for this meeting',
        'Meeting summary',
        'What should not be discussed in this meeting?',
        'What should be done to make this meeting better?',
    ]

    all_response = []
    for i, q in enumerate(querys):
        # answer = RA_MITM.answer_question(q, top_k=10, collapse_tree=True,)
        context = RA_MITM.retrieve(q)
        all_response.append({'question': qtitles[i], 'context': context})

    solar_model = SolarQATranscriptionModel()
    
    with concurrent.futures.ProcessPoolExecutor() as executor:
        # Submit tasks to the executor
        futures = [executor.submit(
            solar_model.answer_question, 
            question=r['question'], 
            context=r['context']
            ) for r in all_response]
        
        # Collect the results as they complete
        answers = [future.result() for future in concurrent.futures.as_completed(futures)]
    
    all_response = [{'question': d['question'], 'context': d['context'], 'answer': answers[i]} for i, d in enumerate(all_response)]

    # title 
    title_sum = RA_MITM.answer_question("Summarize the information into one short sentence, which becomes the topic of the meeting report.", top_k=10, collapse_tree=True,)

    # create md render
    md_render_main = ""
    md_render_main += f"# {title_sum}\n"
    dfr = pd.DataFrame(all_response)
    for i, r in dfr.iterrows():
        q = r.question
        c = r.context
        a = r.answer

        md_render_main += f"## {q}  \n"
        md_render_main += f"{a}  \n"

    # add user feedback
    md_render_users = {}
    for user in all_users:
        querys = []
        qtitles = []
        
        # prompt 1        
        q = f'What can I do to make this meeting better? For "[{user}]" in terms of speaking, why is that? Explain step by step.'
        querys.append(q)
        qtitles.append(f'What can I do to make this meeting better? For "[{user}]"')
        
        # prompt 2        
        q = f'What should not be discussed in this meeting for "[{user}]"? Why is that? Explain step by step, point by point, like ordered lists.'
        querys.append(q)
        qtitles.append(f'What should not be discussed in this meeting for "[{user}]"?')

        all_response = []
        for i, q in enumerate(querys):
            answer = RA_MITM.answer_question(q, top_k=10, collapse_tree=True,)
            context = RA_MITM.retrieve(q)
            all_response.append({'question': qtitles[i], 'context': context, 'answer': answer})
            
        # create md render
        md_render_user = ""
        md_render_user += f"# {title_sum} For [{user}]\n"
        dfr = pd.DataFrame(all_response)
        for i, r in dfr.iterrows():
            q = r.question
            c = r.context
            a = r.answer

            md_render_user += f"## {q}  \n"
            md_render_user += f"{a}  \n"
        
        md_render_users[user] = md_render_user

    response = {
        "transcript": script,
        "summary": md_render_main,
        "users_summary": md_render_users,
    }

    return response
    # to do อาจจะปรับ parameter 
    # context len ของการ ตัด chunk ให้ยาวขึ้น

# API

with open("./dataset/sample_data/wk2.json", 'r') as f:
    sample_input_dict = json.load(f)

class Text(BaseModel):
    input_dict:list = sample_input_dict

@app.get("/")
def read_root():
    return {"Hello": "World"}

@app.post("/llm")
def read_item(body: Text):
    try :
        tic = time.time()
        prediction = SolarRapperQA(body.input_dict)
        total_time = time.time() - tic
    except Exception as err:
        return JSONResponse(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
        content={"success": False, "details":f"Error Occured : {err}" })
    return {"success": True,"output" : prediction, "total_time": total_time}

# fastapi dev app.py