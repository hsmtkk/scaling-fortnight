FROM python:3.11
WORKDIR /app
COPY requirements.txt /app/requirements.txt
RUN pip install -r requirements.txt
COPY chat_ecs.py /app/chat_ecs.py
CMD chainlit run chat_ecs.py --host 0.0.0.0 --port 80
