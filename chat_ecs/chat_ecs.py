import boto3
import chainlit as cl
import os
import json


lambda_client = boto3.client("lambda")
s3_client = boto3.client("s3")


@cl.on_chat_start
async def on_chat_start():
    pass


@cl.on_message
async def main(message: cl.Message):
    print(f"{message=}")
    if message.elements:
        await handle_file(message.elements[0].path)
    else:
        await handle_query(message.content)


async def handle_file(file_path: str) -> None:
    with open(file_path, "rb") as f:
        key = os.path.basename(file_path)
        resp = s3_client.put_object(Bucket=os.environ["SOURCE_BUCKET"], Key=key, Body=f)
        print(f"{resp=}")
    await cl.Message(content=f"File upload done").send()


async def handle_query(query: str) -> None:
    payload = json.dumps({"query": query}).encode()

    resp = lambda_client.invoke(
        FunctionName=os.environ["CHAT_LAMBDA"],
        InvocationType="RequestResponse",
        Payload=payload,
    )
    print(f"{resp=}")

    payload = resp["Payload"].read()
    print(f"{payload=}")
    decoded = json.loads(payload)
    result = decoded["result"]

    await cl.Message(content=result).send()
