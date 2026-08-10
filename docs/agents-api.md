# Agents API

The Agents API runs autonomous, tool-using agents. Unlike the one-off endpoints (summarize, translate, etc.), an agent plans across multiple turns: it decides which tools to call, reads the results, and keeps going until the task is done or the turn budget runs out.

Two modes are available:

- **One-off task** (`POST /api/v1/agent/run`) — give the agent a task, get back the final answer plus everything it did.
- **Multi-turn chat** (`POST /api/v1/agent/chat`) — hold a conversation. The agent keeps the full transcript in a server-side session, so follow-up messages have complete context ("book the first one", "did my payment go through?").

Interactive demos: [Agent Chat](http://localhost:3000/api/v1/agent-chat-demo) (multi-turn) and [Agent Tasks](http://localhost:3000/api/v1/agents-demo) (one-off).

## Requirements

- **Providers**: `openrouter` (`OPENROUTER_API_KEY`) or `openai` (`OPENAI_API_KEY`). Agents need models with tool-calling support.
- **Auth**: like all endpoints, requests require `Authorization: Bearer <DEFAULT_ACCESS_TOKEN>` in production (`NODE_ENV != development`). The read-only catalogs (`/agent/scenarios`, `/agent/tools`) and the demo pages are public.

Recommended models:

| Provider | Models |
| --- | --- |
| `openrouter` | `deepseek/deepseek-v4-flash`, `qwen/qwen3.6-35b-a3b` |
| `openai` | `gpt-4o-mini`, `gpt-4.1-nano` |

## Scenarios

A scenario selects the agent's toolset and default system prompt. Pass it as `payload.scenario`; it defaults to `general`.

| Scenario | Tools | Demo data |
| --- | --- | --- |
| `general` | `calculate`, `get_current_datetime`, `get_weather` | Weather via the free Open-Meteo API |
| `customer-support` | `lookup_customer`, `get_subscription`, `get_billing_history`, `get_support_tickets`, `create_support_ticket` | In-memory CRM: `CUST-1001` (jane.cruz@example.com, active), `CUST-1002` (mark.reyes@example.com, past due), `CUST-1003` (aiko.tanaka@example.com, cancelled) |
| `real-estate` | `search_properties`, `get_property_details`, `get_viewing_slots`, `book_viewing` | In-memory listings in Makati, Quezon City, and Taguig with bookable viewing slots |

`GET /api/v1/agent/scenarios` returns this catalog programmatically (labels, descriptions, tools, and sample tasks), including any custom agents.

**Custom agents**: beyond the built-in scenarios, you can create your own agents (system prompt + toolset + skills) via the [Admin API or the admin dashboard](admin-api.md). Agents can use custom HTTP tools, tools discovered from connected MCP servers, and skills (instruction packages loaded on demand). A custom agent's key works exactly like a scenario key on `/agent/run` and `/agent/chat`.

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/v1/agent/run` | Run a one-off agent task |
| POST | `/api/v1/agent/chat` | Send a message in a multi-turn chat session |
| GET | `/api/v1/agent/sessions/{sessionId}` | Get session metadata + transcript |
| DELETE | `/api/v1/agent/sessions/{sessionId}` | End a session and discard its transcript |
| GET | `/api/v1/agent/scenarios` | List scenarios with tools and sample tasks (public) |
| GET | `/api/v1/agent/tools` | List the general toolset (public) |

---

### POST /api/v1/agent/run — one-off task

**Request**

```json
{
  "payload": {
    "task": "What's the current weather in Manila, and what time is it there?",
    "scenario": "general",
    "maxTurns": 6,
    "systemPrompt": "(optional) override the scenario's system prompt"
  },
  "config": {
    "provider": "openrouter",
    "model": "deepseek/deepseek-v4-flash",
    "stream": false
  }
}
```

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `payload.task` | string | yes | The task for the agent to complete |
| `payload.scenario` | string | no | `general` (default), `customer-support`, or `real-estate` |
| `payload.maxTurns` | number | no | Max agent turns (LLM calls) per run. Default 6, cap 10 |
| `payload.systemPrompt` | string | no | Override the scenario's system prompt |
| `config.provider` | string | yes | `openrouter` or `openai` |
| `config.model` | string | yes | Model id, e.g. `deepseek/deepseek-v4-flash` |
| `config.stream` | boolean | no | Stream agent events over SSE (default false) |

**Response** (non-streaming)

```json
{
  "result": "Here's the current information for Manila...",
  "steps": [
    {
      "toolCallId": "call_abc123",
      "toolName": "get_weather",
      "args": { "city": "Manila" },
      "result": "Current weather in Manila, Philippines: Moderate drizzle, 27.8°C...",
      "isError": false
    }
  ],
  "turns": 2,
  "provider": "openrouter",
  "model": "deepseek/deepseek-v4-flash",
  "usage": { "input_tokens": 1379, "output_tokens": 266, "total_tokens": 1645 },
  "apiVersion": "1.0.0"
}
```

- `result` — the agent's final answer.
- `steps` — every tool call it executed, in order, with arguments and results.
- `turns` — how many LLM calls the run used.
- `usage` — token usage aggregated across all turns.

**Example**

```bash
curl -X POST 'http://localhost:3000/api/v1/agent/run' \
  -H 'Authorization: Bearer your-secret-api-key' \
  -H 'Content-Type: application/json' \
  -d '{
    "payload": { "task": "Calculate (1875 * 23.5) / 100 and add 42.", "scenario": "general" },
    "config": { "provider": "openrouter", "model": "deepseek/deepseek-v4-flash" }
  }'
```

---

### POST /api/v1/agent/chat — multi-turn chat

Start a conversation by sending a message **without** `sessionId`. The response includes a `sessionId`; send it with every follow-up message to continue the same conversation. The agent remembers everything said so far, including tool results.

**Request**

```json
{
  "payload": {
    "message": "Hi, I'm jane.cruz@example.com. Is my subscription active?",
    "sessionId": "(omit to start a new session)",
    "scenario": "customer-support",
    "maxTurns": 6
  },
  "config": {
    "provider": "openrouter",
    "model": "deepseek/deepseek-v4-flash",
    "stream": false
  }
}
```

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `payload.message` | string | yes | The user message to send |
| `payload.sessionId` | string | no | Existing session id. Omit to start a new session |
| `payload.scenario` | string | no | Scenario for a **new** session (ignored with `sessionId`) |
| `payload.systemPrompt` | string | no | System prompt override for a **new** session |
| `payload.maxTurns` | number | no | Max agent turns for this message. Default 6, cap 10 |
| `config.provider` / `config.model` | string | yes | Used when creating the session; existing sessions keep their original provider/model |
| `config.stream` | boolean | no | Stream agent events over SSE |

**Response** (non-streaming)

```json
{
  "sessionId": "4614c306-0e46-4a72-8651-77d28c3a324d",
  "scenario": "customer-support",
  "reply": "Great news, Jane! Your subscription is active...",
  "steps": [
    { "toolCallId": "call_1", "toolName": "lookup_customer", "args": { "query": "jane.cruz@example.com" }, "result": "Customer CUST-1001: ...", "isError": false }
  ],
  "turns": 3,
  "provider": "openrouter",
  "model": "deepseek/deepseek-v4-flash",
  "usage": { "input_tokens": 1500, "output_tokens": 300, "total_tokens": 1800 },
  "apiVersion": "1.0.0"
}
```

**Error responses**

| Status | Meaning |
| --- | --- |
| `404` | `sessionId` not found or expired — start a new chat by omitting it |
| `409` | The session is still processing the previous message |
| `401` | Missing/invalid bearer token (production) |

**Session semantics**

- Sessions are stored **in memory** on the server process. They do not survive a restart and are not shared across instances.
- Idle sessions expire after **30 minutes**; the store is capped at **100 sessions** (oldest idle evicted first).
- Scenario, provider, and model are **fixed when the session is created**; `config` values on follow-up messages are ignored in favor of the session's originals.
- One message at a time per session: concurrent sends return `409`.

**Example — a conversation with memory**

```bash
# 1. Start a session (no sessionId)
curl -X POST 'http://localhost:3000/api/v1/agent/chat' \
  -H 'Authorization: Bearer your-secret-api-key' \
  -H 'Content-Type: application/json' \
  -d '{
    "payload": { "message": "Hi, I am jane.cruz@example.com. Is my subscription active?", "scenario": "customer-support" },
    "config": { "provider": "openrouter", "model": "deepseek/deepseek-v4-flash" }
  }'
# → { "sessionId": "4614c306-...", "reply": "...active...", ... }

# 2. Follow up — no need to repeat the email; the agent remembers
curl -X POST 'http://localhost:3000/api/v1/agent/chat' \
  -H 'Authorization: Bearer your-secret-api-key' \
  -H 'Content-Type: application/json' \
  -d '{
    "payload": { "message": "Did my last payment go through?", "sessionId": "4614c306-..." },
    "config": { "provider": "openrouter", "model": "deepseek/deepseek-v4-flash" }
  }'
```

---

### GET /api/v1/agent/sessions/{sessionId}

Returns session metadata and a simplified transcript.

```json
{
  "sessionId": "4614c306-0e46-4a72-8651-77d28c3a324d",
  "provider": "openrouter",
  "model": "deepseek/deepseek-v4-flash",
  "scenario": "customer-support",
  "createdAt": "2026-08-10T07:59:19.000Z",
  "lastActivityAt": "2026-08-10T08:01:02.000Z",
  "messages": [
    { "role": "user", "text": "Hi, I am jane.cruz@example.com. Is my subscription active?" },
    { "role": "assistant", "text": "Hi Jane! Let me look up your account right away." },
    { "role": "tool", "toolName": "lookup_customer", "text": "Customer CUST-1001: Jane Cruz...", "isError": false },
    { "role": "assistant", "text": "Great news, Jane! Your subscription is active..." }
  ]
}
```

### DELETE /api/v1/agent/sessions/{sessionId}

Ends the session and discards its transcript. Returns `{ "deleted": true, "sessionId": "..." }`, or `404` if the session does not exist.

---

## Streaming (SSE)

Set `config.stream: true` on `/agent/run` or `/agent/chat` to receive Server-Sent Events. Each `data:` line is a JSON object. Event objects during the run:

| `type` | Payload fields | Meaning |
| --- | --- | --- |
| `agent_start` | — | The run started |
| `turn_start` | `turn` | A new agent turn (LLM call) began |
| `thinking_delta` | `delta` | Reasoning text chunk (models that expose thinking) |
| `text_delta` | `delta` | Assistant reply text chunk |
| `tool_call` | `toolCallId`, `toolName`, `args` | The agent invoked a tool |
| `tool_result` | `toolCallId`, `toolName`, `result`, `isError` | The tool finished |
| `agent_end` | — | The run finished |

Every event also carries `provider`, `model`, and `version` (plus `sessionId` and `scenario` on `/agent/chat`).

The stream ends with a final summary object marked `done: true`:

```json
{
  "done": true,
  "sessionId": "(chat only)",
  "reply": "final answer (named result on /agent/run)",
  "steps": [ ... ],
  "turns": 2,
  "usage": { "input_tokens": 1363, "output_tokens": 196, "total_tokens": 1559 },
  "provider": "openrouter",
  "model": "deepseek/deepseek-v4-flash",
  "version": "1.0.0"
}
```

If the run fails mid-stream, the final event is `{ "error": "message", "done": true }`.

**Example**

```bash
curl -N -X POST 'http://localhost:3000/api/v1/agent/chat' \
  -H 'Authorization: Bearer your-secret-api-key' \
  -H 'Content-Type: application/json' \
  -d '{
    "payload": { "message": "What properties do you have in Quezon City?", "scenario": "real-estate" },
    "config": { "provider": "openrouter", "model": "deepseek/deepseek-v4-flash", "stream": true }
  }'
```

---

## Catalogs

### GET /api/v1/agent/scenarios (public)

```json
{
  "scenarios": [
    {
      "key": "real-estate",
      "label": "Real estate",
      "description": "A real-estate assistant that can search property listings...",
      "sampleTasks": ["I'm looking for a home in Quezon City..."],
      "tools": [
        { "name": "search_properties", "label": "Search listings", "description": "Search properties for sale..." }
      ]
    }
  ]
}
```

### GET /api/v1/agent/tools (public)

Returns the `general` scenario's toolset in the same `{ name, label, description }` shape.
