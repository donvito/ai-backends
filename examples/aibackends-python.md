# aibackends-python Example

Use the aibackends-python HTTP API (or the TypeScript same-origin proxy) to run local tasks from the [`aibackends`](https://github.com/donvito/aibackends) Python library.

These examples default to LiquidAI **`lfm2.5-2.6b`** (chat completion + native tool calling).

## Prerequisites

```bash
cd aibackends-python
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pip install "aibackends[llamacpp,pii,transformers] @ git+https://github.com/donvito/aibackends.git"

# LFM2.5 GGUF (~1.6GB)
hf download LiquidAI/LFM2.5-2.6B-GGUF \
  --include 'LFM2.5-2.6B-Q4_K_M.gguf' \
  --local-dir models

export AIBACKENDS_ACCESS_TOKEN=your-secret-api-key
export AIBACKENDS_RUNTIME=llamacpp
export AIBACKENDS_MODEL=lfm2.5-2.6b
export AIBACKENDS_MODEL_PATH=$PWD/models/LFM2.5-2.6B-Q4_K_M.gguf
# export AIBACKENDS_SKIP_AUTH=true
uvicorn app.main:app --port 8000
```

Interactive demo: [http://localhost:3000/api/v1/aibackends-python-demo](http://localhost:3000/api/v1/aibackends-python-demo)

## Summarize

```bash
curl -s http://localhost:8000/v1/summarize \
  -H "Authorization: Bearer your-secret-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Payments failed after the checkout deploy. Cart totals looked correct, but the payment webhook returned 500 for Visa cards. Support volume spiked within 20 minutes.",
    "runtime": "llamacpp",
    "model": "lfm2.5-2.6b"
  }'
```

## Classify

```bash
curl -s http://localhost:8000/v1/classify \
  -H "Authorization: Bearer your-secret-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Please find attached invoice #1042 for March hosting fees. Net 30 payment terms apply.",
    "labels": ["invoice", "contract", "receipt", "support"],
    "runtime": "llamacpp",
    "model": "lfm2.5-2.6b"
  }'
```

## Redact PII

```bash
curl -s http://localhost:8000/v1/redact-pii \
  -H "Authorization: Bearer your-secret-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Contact Jane Doe at jane.doe@example.com or +1 555 0100 about the renewal.",
    "backend": "gliner",
    "labels": ["email", "phone_number"]
  }'
```

## Embed

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

## Extract invoice

```bash
curl -s http://localhost:8000/v1/extract-invoice \
  -H "Authorization: Bearer your-secret-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Invoice from Acme Cloud\nItem: API hosting x1 — $120.00\nItem: Support plan x1 — $40.00\nSubtotal: $160.00\nTax: $12.80\nTotal: $172.80\nDue date: 2026-04-15\nPayment terms: Net 30",
    "runtime": "llamacpp",
    "model": "lfm2.5-2.6b"
  }'
```

## Chat completion

```bash
curl -s http://localhost:8000/v1/chat \
  -H "Authorization: Bearer your-secret-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "In one sentence, what is Liquid AI LFM2.5?"}
    ],
    "runtime": "llamacpp",
    "model": "lfm2.5-2.6b",
    "max_tokens": 256
  }'
```

## Tool calling demo (LFM2.5)

```bash
curl -s http://localhost:8000/v1/tool-call-demo \
  -H "Authorization: Bearer your-secret-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What is the weather in Paris right now?",
    "runtime": "llamacpp",
    "model": "lfm2.5-2.6b"
  }'
```

Or chat with explicit tool schemas:

```bash
curl -s http://localhost:8000/v1/chat \
  -H "Authorization: Bearer your-secret-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "What is the weather in Paris right now?"}
    ],
    "tools": [
      {
        "name": "get_weather",
        "description": "Get the current weather for a city.",
        "parameters": {
          "type": "object",
          "properties": {
            "city": {"type": "string"}
          },
          "required": ["city"]
        }
      }
    ],
    "runtime": "llamacpp",
    "model": "lfm2.5-2.6b"
  }'
```

## TypeScript proxy

Same payloads work through `/api/v1/local/<task>` when the main server is running (`AIBACKENDS_PYTHON_URL`, default `http://localhost:8000`).
