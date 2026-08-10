# Admin Dashboard & Admin API

AI Backends ships an admin dashboard — separate from the demos — for managing the platform at runtime:

- **Agents**: create custom agents (system prompt + toolset) that become immediately runnable through the [Agents API](agents-api.md) and selectable in the demo pages.
- **Tools**: define custom HTTP tools that agents can call, and test them before use.
- **API Keys**: configure provider API keys without restarting the server.

Open it at [http://localhost:3000/api/admin](http://localhost:3000/api/admin). The page itself is public; every action calls the protected Admin API below, so in production you enter your bearer token (`DEFAULT_ACCESS_TOKEN`) in the top-right field (stored in your browser's localStorage).

## Persistence

Admin configuration is stored in `data/admin-config.json` (override the path with `ADMIN_CONFIG_PATH`). It survives restarts and is gitignored because it contains API keys in plain text — protect it like a `.env` file.

## Endpoints

All endpoints require `Authorization: Bearer <DEFAULT_ACCESS_TOKEN>` in production and are tagged `Admin` in the Swagger docs.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/v1/admin/agents` | List custom agents |
| POST | `/api/v1/admin/agents` | Create a custom agent |
| PUT | `/api/v1/admin/agents/{key}` | Update a custom agent |
| DELETE | `/api/v1/admin/agents/{key}` | Delete a custom agent |
| GET | `/api/v1/admin/tools` | List all tools (built-in + custom) |
| POST | `/api/v1/admin/tools` | Create a custom HTTP tool |
| PUT | `/api/v1/admin/tools/{name}` | Update a custom HTTP tool |
| DELETE | `/api/v1/admin/tools/{name}` | Delete a custom HTTP tool |
| POST | `/api/v1/admin/tools/{name}/test` | Execute a tool once with given arguments |
| GET | `/api/v1/admin/keys` | Provider API key status (masked) |
| PUT | `/api/v1/admin/keys/{provider}` | Set a provider API key at runtime |
| DELETE | `/api/v1/admin/keys/{provider}` | Clear a dashboard key override (falls back to env) |

---

## Custom agents

A custom agent is a scenario: a system prompt plus a list of tool names (built-in and/or custom). Its `key` is used as `payload.scenario` on `POST /api/v1/agent/run` and `POST /api/v1/agent/chat`, and it automatically appears in `GET /api/v1/agent/scenarios` and the demo pages' scenario pickers.

**Create**

```bash
curl -X POST 'http://localhost:3000/api/v1/admin/agents' \
  -H 'Authorization: Bearer your-secret-api-key' \
  -H 'Content-Type: application/json' \
  -d '{
    "key": "currency-helper",
    "label": "Currency helper",
    "description": "Converts amounts between currencies using live exchange rates.",
    "systemPrompt": "You are a currency assistant. Use get-exchange-rate to fetch live rates (never guess rates) and calculate for arithmetic. Always show the rate you used.",
    "tools": ["get-exchange-rate", "calculate"],
    "sampleTasks": ["How many euros is 250 US dollars right now?"]
  }'
```

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `key` | string | yes | Unique lowercase slug (letters, numbers, dashes). Cannot be a built-in scenario key. Immutable after creation. |
| `label` | string | yes | Human-readable name |
| `description` | string | no | What the agent does |
| `systemPrompt` | string | yes | Shapes the agent behavior (max 8000 chars) |
| `tools` | string[] | yes | Tool names; every name must exist in the tool registry |
| `sampleTasks` | string[] | no | Example tasks shown in the demos |

**Run it** — same as any scenario:

```bash
curl -X POST 'http://localhost:3000/api/v1/agent/chat' \
  -H 'Authorization: Bearer your-secret-api-key' \
  -H 'Content-Type: application/json' \
  -d '{
    "payload": { "message": "How many euros is 250 US dollars right now?", "scenario": "currency-helper" },
    "config": { "provider": "openrouter", "model": "deepseek/deepseek-v4-flash" }
  }'
```

---

## Custom HTTP tools

A custom tool performs **one HTTP request** when the agent calls it:

1. `{placeholders}` in the URL are replaced with matching argument values.
2. Remaining arguments are appended as query parameters (GET) or sent as a JSON body (POST).
3. The response body text is returned to the model (truncated to 4000 chars). Non-2xx responses become tool errors the agent can react to.

Requests use a 30-second timeout and exponential-backoff retries on 429/5xx.

**Create**

```bash
curl -X POST 'http://localhost:3000/api/v1/admin/tools' \
  -H 'Authorization: Bearer your-secret-api-key' \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "get-exchange-rate",
    "label": "Exchange rates",
    "description": "Get the latest currency exchange rates for a base currency.",
    "parameters": {
      "type": "object",
      "properties": { "base": { "type": "string", "description": "Base currency code, e.g. USD" } },
      "required": ["base"]
    },
    "http": { "method": "GET", "url": "https://api.frankfurter.dev/v1/latest?base={base}" }
  }'
```

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes | Unique slug the model calls. Cannot clash with built-in tool names. Immutable after creation. |
| `label` | string | yes | Human-readable label |
| `description` | string | yes | Tells the model what the tool does and when to use it |
| `parameters` | object | yes | JSON Schema (`type: "object"`) describing the arguments |
| `http.method` | string | yes | `GET` or `POST` |
| `http.url` | string | yes | Target URL, may contain `{placeholders}` |
| `http.headers` | object | no | Extra headers, e.g. an `Authorization` header for the target API |

**Test before use**

```bash
curl -X POST 'http://localhost:3000/api/v1/admin/tools/get-exchange-rate/test' \
  -H 'Authorization: Bearer your-secret-api-key' \
  -H 'Content-Type: application/json' \
  -d '{ "args": { "base": "USD" } }'
# → { "result": "{\"amount\":1.0,\"base\":\"USD\",...}", "details": { "url": "...", "status": 200 } }
```

**Guards**

- A tool cannot be deleted while a custom agent still references it (400 with the list of agents).
- Built-in tools cannot be edited, deleted, or overridden by name.
- Limits: 100 custom tools, 50 custom agents.

> Note: custom tools make the server perform HTTP requests to admin-supplied URLs. Only admins (bearer-token holders) can define tools, but treat this like any other server-side webhook configuration when deploying.

---

## Provider API keys

`GET /api/v1/admin/keys` shows every supported provider (`openai`, `anthropic`, `openrouter`, `google`, `aigateway`, `baseten`, `llmgateway`, `zai`) with:

```json
{ "provider": "openrouter", "configured": true, "source": "env", "maskedKey": "••••87e5" }
```

- `source: "env"` — key comes from the environment variable.
- `source: "dashboard"` — a runtime override set via the API/dashboard (persisted, overrides env).
- Full key values are never returned.

**Set a key** (takes effect immediately, no restart):

```bash
curl -X PUT 'http://localhost:3000/api/v1/admin/keys/openai' \
  -H 'Authorization: Bearer your-secret-api-key' \
  -H 'Content-Type: application/json' \
  -d '{ "apiKey": "sk-..." }'
```

**Clear an override** (reverts to the environment variable):

```bash
curl -X DELETE 'http://localhost:3000/api/v1/admin/keys/openai' \
  -H 'Authorization: Bearer your-secret-api-key'
```
