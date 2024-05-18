import boto3
import tempfile
import os
import uuid

from langchain_community.document_loaders import PyPDFLoader
from langchain_community.vectorstores import FAISS
from langchain_openai import OpenAIEmbeddings
from langchain_text_splitters.character import RecursiveCharacterTextSplitter

s3_client = boto3.client("s3")
lambda_client = boto3.client("lambda")
FAISS_FILES = ("index.pkl", "index.faiss")
CHUNK_SIZE = 1024
CHUNK_OVERLAP = CHUNK_SIZE / 2


def handler(event, context):
    print(f"{event=}")
    print(f"{context=}")

    records = event["Records"]
    if len(records) > 0:
        handle_record(records[0])

    # force cold restart
    resp = lambda_client.update_function_configuration(
        Description=str(uuid.uuid4()),
        FunctionName=os.environ["CHAT_LAMBDA"],
    )
    print(f"{resp=}")

    return {"statusCode": 200, "body": "ok"}


def handle_record(record: dict) -> None:
    s3_event = record["s3"]
    bucket = s3_event["bucket"]["name"]
    key = s3_event["object"]["key"]
    with tempfile.TemporaryDirectory() as pdf_dir:
        pdf_path = os.path.join(pdf_dir, key)
        download_pdf(bucket, key, pdf_path)
        faiss = embedding(pdf_path)
    with tempfile.TemporaryDirectory() as faiss_dir:
        faiss.save_local(faiss_dir)
        upload_faiss(os.environ["EMBEDDING_BUCKET"], faiss_dir)


def download_pdf(bucket: str, key: str, pdf_path: str) -> None:
    resp = s3_client.get_object(Bucket=bucket, Key=key)
    print(f"{resp=}")
    with open(pdf_path, "wb") as f:
        f.write(resp["Body"].read())


def embedding(pdf_path: str) -> FAISS:
    loader = PyPDFLoader(pdf_path)
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP
    )
    docs = loader.load_and_split(splitter)
    embeddings = OpenAIEmbeddings()
    faiss = FAISS.from_documents(docs, embeddings)
    return faiss


def upload_faiss(bucket: str, tmp_dir: str) -> None:
    for key in FAISS_FILES:
        path = os.path.join(tmp_dir, key)
        with open(path, "rb") as f:
            resp = s3_client.put_object(Bucket=bucket, Key=key, Body=f)
            print(f"{resp=}")
