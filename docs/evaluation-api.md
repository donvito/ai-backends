# Evaluation API: TypeSafe Jev

`POST /api/v1/evaluate` evaluates a shared state against named, typed questions.
Jev returns decisions rather than generated text. It has its own
`EvaluationProvider` interface and is not accepted by generative endpoints or
listed in the LLM model catalog.

Use short, atomic judgments. Compose multi-step reasoning, thresholds, and
actions in your application code. State is text or JSON (objects/arrays);
raw images are not supported. A probability or confidence is evidence for a
decision, not a guarantee.

## Configuration

```env
TYPESAFE_API_KEY=your-typesafe-key
TYPESAFE_BASE_URL=https://api.typesafe.ai
TYPESAFE_MODEL=jev-latest
TYPESAFE_TIMEOUT=10000
```

`TYPESAFE_TIMEOUT` is a positive integer in milliseconds covering the entire
evaluation, including retries and reading the response body. AIBackends makes
at most three attempts, with 250ms then 500ms backoff for HTTP 429 and 529.
`Retry-After` can extend that delay within the overall timeout.

You can set or replace the `typesafe` key from the admin dashboard or
`PUT /api/v1/admin/keys/typesafe`. Changes take effect without a restart;
clearing the override restores the startup environment key.
AIBackends can start with only a TypeSafe key.

`GET /api/v1/services/status` includes `services.typesafe` with `enabled`,
`available`, `config.model`, and `config.hasApiKey`. As with the other hosted
services, `available` indicates local configuration, not a live credential or
network health check. No API key is returned.

## Request

```sh
curl http://localhost:3000/api/v1/evaluate \
  -H "Authorization: Bearer $DEFAULT_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "payload": {
      "state": {"user_request": "Create an invoice for Acme Corp"},
      "questions": {
        "route": {
          "type": "choice",
          "instructions": "Which agent should handle this request?",
          "criteria": {
            "accounting": "Invoices and bookkeeping",
            "research": "Research and documents",
            "human": "Ambiguous or unsupported"
          }
        },
        "risk": {
          "type": "score",
          "instructions": "How financially sensitive is this request?",
          "criteria": ["Low", "Moderate", "High"]
        },
        "needs_clarification": {
          "type": "noul",
          "instructions": "Is required invoice information missing?",
          "criteria": {"true": "Required information is missing"}
        }
      }
    },
    "config": {"provider": "typesafe", "model": "jev-latest"}
  }'
```

`config.provider` is required; `config.model` is optional and defaults to
`TYPESAFE_MODEL`. The question map must be nonempty. Each question requires
`instructions` (any JSON value):

| Type | Criteria | Answer |
| --- | --- | --- |
| `choice` | Nonempty option map with string or null descriptions | `choice`, all `probabilities`, `confidence` |
| `score` | Ordered array of at least two string levels | Weighted `score`, `legend`, `probabilities`, `confidence` |
| `noul` | Optional `true`/`false` string descriptions | `noul`, a value from 0 to 1 |

Question IDs are returned unchanged. Upstream state/questions are sent without
prompt wrapping. The response contains `provider: "typesafe"`, the upstream
`model`, `answers`, and `usage`. All answer details and upstream extension
fields are preserved. When TypeSafe omits `usage.total_tokens`, AIBackends adds
`input_tokens + output_tokens`. Invalid responses, missing answers, or answer
types/options that disagree with the request are rejected.

## Errors

| HTTP status | Meaning |
| --- | --- |
| 400 | Invalid AIBackends request |
| 401 | Missing/invalid AIBackends bearer token in production |
| 429 | TypeSafe rate limit persists after retries |
| 502 | Upstream authentication (401/403), validation (422), network, or invalid response failure |
| 503 | TypeSafe is unconfigured, or unavailable/overloaded after retries |
| 504 | Overall evaluation timeout exceeded |

Upstream authentication errors are 502 because the TypeSafe key belongs to the
server, not the caller. Upstream error bodies are not returned to clients.

## Tests

```sh
bun run test
# Opt-in: makes one real request and uses your TypeSafe quota.
TYPESAFE_API_KEY=... bun test:integration
```

Normal tests mock the HTTP API and require no live credentials. Integration
testing is skipped unless explicitly enabled by the integration command.

## References

- [TypeSafe API contract](https://docs.typesafe.ai/api)
- [Quickstart](https://docs.typesafe.ai/introduction/quickstart)
- [Atomic judgments and composition](https://docs.typesafe.ai/introduction)

The Jev playground and automatic agent routing are separate follow-up features.
