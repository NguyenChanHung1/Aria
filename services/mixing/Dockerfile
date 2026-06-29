FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir uv
COPY pyproject.toml .
RUN uv pip install --system -e .
COPY src ./src
RUN mkdir -p outputs

ENV PYTHONPATH=/app/src
EXPOSE 8003
CMD ["uvicorn", "mixing.main:app", "--host", "0.0.0.0", "--port", "8003", "--reload"]
