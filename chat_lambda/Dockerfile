FROM public.ecr.aws/lambda/python:3.11
COPY requirements.txt ${LAMBDA_TASK_ROOT}
RUN pip install -r requirements.txt
COPY chat_lambda.py ${LAMBDA_TASK_ROOT}
CMD [ "chat_lambda.handler" ]
