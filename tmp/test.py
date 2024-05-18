from langchain_community.vectorstores import FAISS
from langchain_openai import OpenAIEmbeddings

embeddings = OpenAIEmbeddings()
faiss = FAISS.load_local("faiss", embeddings, allow_dangerous_deserialization=True)
