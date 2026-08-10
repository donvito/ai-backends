# Admin Dashboard & Admin API

AI Backends ships an admin dashboard — separate from the demos — for managing the platform at runtime:

- **Agents**: create custom agents (system prompt + toolset + skills) that become immediately runnable through the [Agents API](agents-api.md) and selectable in the demo pages.
- **Tools**: define custom HTTP tools that agents can call, and test them before use.
- **Skills**: create instruction packages (Agent Skills style) that agents load on demand.
- **MCP Servers**: connect Model Context Protocol servers and use their tools in agents.
- **API Keys**: configure provider API keys without restarting the server.

Open it at [http://localhost:3000/admin](http://localhost:3000/admin). The page itself is public; every action calls the protected Admin API below, so in production you enter your bearer token (`DEFAULT_ACCESS_TOKEN`) in the sidebar field (stored in your browser's localStorage).

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
| GET | `/api/v1/admin/skills` | List skills |
| POST | `/api/v1/admin/skills` | Create a skill |
| PUT | `/api/v1/admin/skills/{name}` | Update a skill |
| DELETE | `/api/v1/admin/skills/{name}` | Delete a skill |
| GET | `/api/v1/admin/mcp-servers` | List MCP servers with status and discovered tools |
| POST | `/api/v1/admin/mcp-servers` | Register an MCP server (connects + discovers tools) |
| PUT | `/api/v1/admin/mcp-servers/{name}` | Update an MCP server (reconnects) |
| DELETE | `/api/v1/admin/mcp-servers/{name}` | Remove an MCP server |
| POST | `/api/v1/admin/mcp-servers/{name}/refresh` | Reconnect and re-discover tools |
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

## Skills

Skills follow the Agent Skills progressive-disclosure model: agents always see each skill's **name and description** in their system prompt; the **full content** loads only when the agent calls the built-in `use_skill` tool. This keeps context small while giving agents deep instructions on demand.

**Create**

```bash
curl -X POST 'http://localhost:3000/api/v1/admin/skills' \
  -H 'Authorization: Bearer your-secret-api-key' \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "shipping-policy",
    "description": "Company shipping and delivery policy. Use when customers ask about shipping times, delays, or delivery guarantees.",
    "content": "# Shipping Policy\n\n- Standard shipping: 3-5 business days...\n- If an order is delayed more than 3 business days past its ETA, the customer is entitled to a $10 credit."
  }'
```

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes | Unique slug. Immutable after creation. |
| `description` | string | yes | When to use the skill — always visible to agents that have it (max 1024 chars, per the Agent Skills spec) |
| `content` | string | yes | Full markdown instructions, loaded on demand (max 50k chars) |

**Attach to an agent** via the agent's `skills` array:

```json
{ "key": "order-support", "tools": ["mcp_demo_lookup_order"], "skills": ["shipping-policy"], ... }
```

At run time the agent's system prompt gains an `<available_skills>` listing plus a `use_skill` tool. Deletion is blocked while any agent references the skill.

---

## MCP servers

Register a Model Context Protocol server and its tools become part of the tool registry, usable by any agent. Supported transports: **Streamable HTTP** and **SSE** (remote/HTTP servers; stdio servers are not supported in the API server context).

**Register** (connects immediately and discovers tools):

```bash
curl -X POST 'http://localhost:3000/api/v1/admin/mcp-servers' \
  -H 'Authorization: Bearer your-secret-api-key' \
  -H 'Content-Type: application/json' \
  -d '{ "name": "demo", "url": "http://localhost:3900/mcp", "transport": "streamable-http" }'
```

Response includes connection status and the discovered tools:

```json
{
  "name": "demo", "connected": true, "toolCount": 2,
  "tools": [
    { "name": "mcp_demo_roll_dice", "originalName": "roll_dice", "serverName": "demo", ... },
    { "name": "mcp_demo_lookup_order", "originalName": "lookup_order", "serverName": "demo", ... }
  ]
}
```

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes | Unique slug; tools are registered as `mcp_<name>_<tool>`. Immutable after creation. |
| `url` | string | yes | MCP endpoint URL |
| `transport` | string | no | `streamable-http` (default) or `sse` |
| `headers` | object | no | Extra request headers, e.g. an `Authorization` header |

Notes:

- Bridged tools work everywhere normal tools do: attach them to agents, test them via `POST /admin/tools/{name}/test`, and they appear in `GET /admin/tools` with `source: "mcp"`.
- Persisted servers are reconnected automatically at startup; use `/refresh` to reconnect or pick up new tools.
- Failed tool calls trigger one automatic reconnect + retry.
- Removal is blocked while any agent references the server's tools.
- A runnable demo server ships in [`examples/mcp-demo-server.ts`](../examples/mcp-demo-server.ts) (`bun run examples/mcp-demo-server.ts`).

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
