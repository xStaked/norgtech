FROM python:3.12-slim

WORKDIR /app

# psycopg (pool + checkpointer PG) necesita libpq del sistema; sin esto
# el import revienta en el arranque aunque corra en modo memoria.
RUN apt-get update && apt-get install -y --no-install-recommends libpq5 && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
RUN pip install --no-cache-dir .
COPY src/ src/

ENV PORT=8000
ENV WEB_CONCURRENCY=2
EXPOSE 8000

CMD ["sh", "-c", "uvicorn src.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers ${WEB_CONCURRENCY:-2}"]
