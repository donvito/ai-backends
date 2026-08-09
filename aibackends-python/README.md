# aibackends-python

HTTP API for the [`aibackends`](https://github.com/donvito/aibackends) Python library.

This service sits beside the TypeScript AI Backends API in this repo. Use it when you want **local GPU/CPU model tasks** (llamacpp / transformers / PII) exposed over REST.

```text
Client / TypeScript API
        │  HTTP + Bearer
        ▼
aibackends-python (:8000)  →  aibackends library  →  local models
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

Browser demo (via TypeScript proxy): `http://localhost:3000/api/v1/aibackends-python-demo`

Usage examples: [`examples/aibackends-python.md`](../examples/aibackends-python.md)

## Local run

```bash
cd aibackends-python
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Runtime extras (install aibackends from git until LFM2.5 is on PyPI)
pip install "aibackends[llamacpp,pii,transformers] @ git+https://github.com/donvito/aibackends.git"

# LiquidAI LFM2.5-2.6B GGUF (~1.6GB) — default demo model
hf download LiquidAI/LFM2.5-2.6B-GGUF \
  --include 'LFM2.5-2.6B-Q4_K_M.gguf' \
  --local-dir models

export AIBACKENDS_ACCESS_TOKEN=your-secret-api-key
export AIBACKENDS_RUNTIME=llamacpp
export AIBACKENDS_MODEL=lfm2.5-2.6b
export AIBACKENDS_MODEL_PATH=$PWD/models/LFM2.5-2.6B-Q4_K_M.gguf
# For local smoke tests without auth:
# export AIBACKENDS_SKIP_AUTH=true

uvicorn app.main:app --reload --port 8000
```

Example:

```bash
curl -s http://localhost:8000/v1/summarize \
  -H "Authorization: Bearer your-secret-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text":"Payments failed after checkout deploy.","model":"lfm2.5-2.6b"}'
```

## Docker Compose

From the repo root:

```bash
docker compose up aibackends-python
```

The service listens on **port 8000**. Set `DEFAULT_ACCESS_TOKEN` (or `AIBACKENDS_ACCESS_TOKEN`) in `.env`.

For GPU clouds, build/run the CUDA image from the Python library repo and mount or copy this `app/` package, or install `aibackends[api]` into that image and run uvicorn the same way.

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `AIBACKENDS_ACCESS_TOKEN` / `DEFAULT_ACCESS_TOKEN` | — | Bearer token |
| `AIBACKENDS_SKIP_AUTH` | `false` | Skip auth (dev only) |
| `AIBACKENDS_RUNTIME` | `llamacpp` | Default runtime |
| `AIBACKENDS_MODEL` | `gemma3-270m-it` | Default model ref |
| `AIBACKENDS_MODEL_PATH` | — | Local GGUF/weights path (skips HF download) |
| `AIBACKENDS_PYTHON_PORT` | `8000` | Listen port |
