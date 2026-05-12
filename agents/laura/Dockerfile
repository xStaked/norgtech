FROM python:3.12-slim AS builder

WORKDIR /app
COPY pyproject.toml .
RUN pip install --no-cache-dir --target=/app/deps .

FROM python:3.12-slim

WORKDIR /app

COPY --from=builder /app/deps /usr/local/lib/python3.12/site-packages/
COPY src/ src/

ENV PORT=8000
EXPOSE 8000

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
