import os
import tempfile
import boto3

from langchain_community.vectorstores import FAISS
from langchain_openai import OpenAIEmbeddings
from langchain_openai import OpenAI
from langchain.chains import RetrievalQA


s3_client = boto3.client("s3")
FAISS_FILES = ("index.pkl", "index.faiss")
MAX_TOKENS = 1024


def init_qa() -> RetrievalQA:
    with tempfile.TemporaryDirectory() as tmp_dir:
        for key in FAISS_FILES:
            resp = s3_client.get_object(Bucket=os.environ["EMBEDDING_BUCKET"], Key=key)
            print(f"{resp=}")
            path = os.path.join(tmp_dir, key)
            with open(path, "wb") as f:
                f.write(resp["Body"].read())
        # debug
        files = os.listdir(tmp_dir)
        print(f"{files=}")

        embeddings = OpenAIEmbeddings()
        faiss = FAISS.load_local(
            tmp_dir, embeddings, allow_dangerous_deserialization=True
        )
    llm = OpenAI(max_tokens=MAX_TOKENS)
    qa = RetrievalQA.from_chain_type(
        llm=llm,
        chain_type="map_reduce",
        retriever=faiss.as_retriever(),
    )
    return qa


qa = init_qa()


def handler(event, context):
    print(f"{event=}")
    print(f"{context=}")

    query = event["query"]
    resp = qa.invoke({"query": query})
    print(f"{resp=}")
    result = resp["result"]

    return {"status": 200, "result": result}
