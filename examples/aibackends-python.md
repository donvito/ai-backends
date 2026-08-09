# aibackends-python Example

Use the aibackends-python HTTP API (or the TypeScript same-origin proxy) to run local tasks from the [`aibackends`](https://github.com/donvito/aibackends) Python library.

## Prerequisites

```bash
# Run locally (recommended for the interactive demo)
cd aibackends-python
pip install -r requirements.txt
pip install "aibackends[llamacpp]"

# Small CPU GGUF used by the demo defaults (~253MB)
hf download bartowski/google_gemma-3-270m-it-GGUF \
  --include 'google_gemma-3-270m-it-Q4_K_M.gguf' \
  --local-dir models

export AIBACKENDS_ACCESS_TOKEN=your-secret-api-key
export AIBACKENDS_RUNTIME=llamacpp
export AIBACKENDS_MODEL=gemma3-270m-it
export AIBACKENDS_MODEL_PATH=$PWD/models/google_gemma-3-270m-it-Q4_K_M.gguf
uvicorn app.main:app --port 8000

# Or via Docker (mount models/ and set AIBACKENDS_MODEL_PATH=/models/...)
# docker compose up aibackends-python --build
```

Interactive demo page: [http://localhost:3000/api/v1/aibackends-python-demo](http://localhost:3000/api/v1/aibackends-python-demo)

## Option A — Direct aibackends-python API

- **Base URL**: `http://localhost:8000`
- **Auth**: `Authorization: Bearer <AIBACKENDS_ACCESS_TOKEN>`

### Summarize

```bash
curl -s http://localhost:8000/v1/summarize \
  -H "Authorization: Bearer your-secret-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Payments failed after the checkout deploy. Cart totals looked correct, but the payment webhook returned 500 for Visa cards.",
    "runtime": "llamacpp",
    "model": "gemma3-270m-it"
  }'
```

### Classify

```bash
curl -s http://localhost:8000/v1/classify \
  -H "Authorization: Bearer your-secret-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Please find attached invoice #1042 for March hosting fees.",
    "labels": ["invoice", "contract", "receipt", "support"],
    "runtime": "llamacpp",
    "model": "gemma3-270m-it"
  }'
```

### Redact PII

```bash
curl -s http://localhost:8000/v1/redact-pii \
  -H "Authorization: Bearer your-secret-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Contact Jane Doe at jane.doe@example.com or +1 555 0100.",
    "backend": "gliner",
    "labels": ["email", "phone_number"]
  }'
```

### Embed

```bash
curl -s http://localhost:8000/v1/embed \
  -H "Authorization: Bearer your-secret-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Payments failed after checkout deploy.",
    "runtime": "transformers",
    "model": "minilm-l6"
  }'
```

## Option B — TypeScript proxy (same origin)

When the main AI Backends server is running, call:

- `GET /api/v1/local/health`
- `POST /api/v1/local/summarize`
- `POST /api/v1/local/classify`
- `POST /api/v1/local/redact-pii`
- `POST /api/v1/local/embed`
- `POST /api/v1/local/extract-invoice`

Proxy target: `AIBACKENDS_PYTHON_URL` (default `http://localhost:8000`).

```bash
curl -s http://localhost:3000/api/v1/local/summarize \
  -H "Authorization: Bearer your-secret-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Payments failed after the checkout deploy.",
    "runtime": "llamacpp",
    "model": "gemma3-270m-it"
  }'
```

## JavaScript example (via proxy)

```javascript
async function summarizeLocal(text, token) {
  const response = await fetch('http://localhost:3000/api/v1/local/summarize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      runtime: 'llamacpp',
      model: 'gemma3-270m-it',
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.summary;
}
```

## Notes

- The TypeScript API (port 3000) and aibackends-python (port 8000) are separate services.
- Install the matching `aibackends` extras (`llamacpp`, `transformers`, `pii`) before expecting inference to succeed.
- Structured tasks (classify / extract-invoice) work more reliably with larger GGUFs than gemma3-270m-it.
- See [`aibackends-python/README.md`](../aibackends-python/README.md) for service configuration.
