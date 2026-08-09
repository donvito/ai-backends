# aibackends Python sidecar

HTTP wrapper around the [`aibackends`](https://github.com/donvito/aibackends) Python library.

This service sits beside the TypeScript AI Backends API in this repo. Use it when you want **local GPU/CPU model tasks** (llamacpp / transformers / PII) exposed over REST.

```text
Client / TypeScript API
        │  HTTP + Bearer
        ▼
python-sidecar (:8000)  →  aibackends library  →  local models
```

## Endpoints

| Method | Path | Library task |
|--------|------|----------------|
| `GET` | `/health` | liveness + defaults |
| `POST` | `/v1/summarize` | `summarize` |
| `POST` | `/v1/classify` | `classify` |
| `POST` | `/v1/redact-pii` | `redact_pii` |
| `POST` | `/v1/embed` | `embed` |
| `POST` | `/v1/extract-invoice` | `extract_invoice` |

Interactive docs: `http://localhost:8000/docs`

## Local run

```bash
cd python-sidecar
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Pick the extras you need for real inference:
pip install "aibackends[llamacpp]"
# pip install "aibackends[transformers]"
# pip install "aibackends[pii]"

export AIBACKENDS_ACCESS_TOKEN=your-secret-api-key
export AIBACKENDS_RUNTIME=llamacpp
export AIBACKENDS_MODEL=gemma4-e2b
# For local smoke tests without auth:
# export AIBACKENDS_SKIP_AUTH=true

uvicorn app.main:app --reload --port 8000
```

Example:

```bash
curl -s http://localhost:8000/v1/summarize \
  -H "Authorization: Bearer your-secret-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text":"Payments failed after checkout deploy."}'
```

## Docker Compose

From the repo root:

```bash
docker compose up python-sidecar
```

The service listens on **port 8000**. Set `DEFAULT_ACCESS_TOKEN` (or `AIBACKENDS_ACCESS_TOKEN`) in `.env`.

For GPU clouds, build/run the CUDA image from the Python library repo and mount or copy this `app/` package, or install `aibackends[api]` into that image and run uvicorn the same way.

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `AIBACKENDS_ACCESS_TOKEN` / `DEFAULT_ACCESS_TOKEN` | — | Bearer token |
| `AIBACKENDS_SKIP_AUTH` | `false` | Skip auth (dev only) |
| `AIBACKENDS_RUNTIME` | `llamacpp` | Default runtime |
| `AIBACKENDS_MODEL` | `gemma4-e2b` | Default model ref |
| `AIBACKENDS_SIDECAR_PORT` | `8000` | Listen port |
