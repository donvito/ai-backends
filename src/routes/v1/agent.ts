import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { handleError } from '../../utils/errorHandler'
import {
  agentChatRequestSchema,
  agentChatResponseSchema,
  agentRequestSchema,
  agentResponseSchema,
  agentScenariosResponseSchema,
  agentSessionDeleteResponseSchema,
  agentSessionResponseSchema,
  agentToolsResponseSchema,
  createAgentResponse,
} from '../../schemas/v1/agent'
import { getAgentToolCatalog } from '../../services/agent-tools'
import { getAgentScenarioCatalog, scenarioExists } from '../../services/agent-scenarios'
import {
  createAgentSession,
  deleteAgentSession,
  getAgentSession,
  getAgentSessionInfo,
  type AgentSession,
} from '../../services/agent-sessions'
import { runAgent, sendAgentMessage, type AgentProviderName } from '../../services/pi-agent'
import { apiVersion } from './versionConfig'
import { createFinalResponse } from './finalResponse'

const router = new OpenAPIHono()

async function handleAgentRunRequest(c: Context) {
  try {
    const body = await c.req.json()
    const parsed = agentRequestSchema.parse(body)
    const { payload, config } = parsed
    if (!scenarioExists(payload.scenario)) {
      return c.json({ error: `Unknown scenario "${payload.scenario}". Check GET /api/v1/agent/scenarios for available keys.` }, 400)
    }
    const provider = config.provider as AgentProviderName
    const model = config.model
    const isStreaming = config.stream || false

    const runOptions = {
      provider,
      model,
      task: payload.task,
      scenario: payload.scenario,
      systemPrompt: payload.systemPrompt,
      maxTurns: payload.maxTurns,
    }

    // Stream agent lifecycle events over SSE
    if (isStreaming) {
      c.header('Content-Type', 'text/event-stream')
      c.header('Cache-Control', 'no-cache')
      c.header('Connection', 'keep-alive')

      return streamSSE(c, async (stream) => {
        try {
          const runResult = await runAgent({
            ...runOptions,
            onEvent: async (event) => {
              await stream.writeSSE({
                data: JSON.stringify({ ...event, provider, model, version: apiVersion }),
              })
            },
          })

          await stream.writeSSE({
            data: JSON.stringify({
              done: true,
              result: runResult.result,
              steps: runResult.steps,
              turns: runResult.turns,
              usage: {
                input_tokens: runResult.usage.promptTokens,
                output_tokens: runResult.usage.completionTokens,
                total_tokens: runResult.usage.totalTokens,
              },
              provider,
              model,
              version: apiVersion,
            }),
          })
        } catch (error) {
          console.error('Agent streaming error:', error)
          try {
            await stream.writeSSE({
              data: JSON.stringify({
                error: error instanceof Error ? error.message : 'Agent streaming error',
                done: true,
              }),
            })
          } catch (writeError) {
            console.error('Error writing error message to stream:', writeError)
          }
        } finally {
          try {
            await stream.close()
          } catch (closeError) {
            console.error('Error closing stream:', closeError)
          }
        }
      })
    }

    // Non-streaming response
    const runResult = await runAgent(runOptions)
    const response = createAgentResponse(runResult.result, runResult.steps, runResult.turns, provider, model, {
      input_tokens: runResult.usage.promptTokens,
      output_tokens: runResult.usage.completionTokens,
      total_tokens: runResult.usage.totalTokens,
    })

    return c.json(createFinalResponse(response, apiVersion), 200)
  } catch (error) {
    return handleError(c, error, 'Failed to run agent')
  }
}

router.openapi(
  createRoute({
    path: '/run',
    method: 'post',
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: {
          'application/json': {
            schema: agentRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description:
          'Runs a tool-using agent to complete the task and returns the final answer with the tool calls it made. When config.stream is true, agent lifecycle events are streamed over SSE.',
        content: {
          'application/json': {
            schema: agentResponseSchema,
          },
        },
      },
      401: {
        description: 'Unauthorized - Bearer token required',
        content: {
          'application/json': {
            schema: z.object({
              error: z.string(),
            }),
          },
        },
      },
    },
    summary: 'Run an agent task',
    description:
      'This endpoint runs an autonomous agent loop. ' +
      'The agent calls tools across multiple turns to complete the task. Pick a scenario to select the toolset: ' +
      'general (calculator, date/time, weather), customer-support (account, subscription, billing, tickets), ' +
      'real-estate (listing search, property details, viewing slots, appointment booking), or the key of a custom agent ' +
      'created via the Admin API. Supported providers: OpenRouter and the official OpenAI API.',
    tags: ['Agents'],
  }),
  handleAgentRunRequest as any
)

async function handleAgentChatRequest(c: Context) {
  let parsed
  try {
    parsed = agentChatRequestSchema.parse(await c.req.json())
  } catch (error) {
    return handleError(c, error, 'Invalid agent chat request')
  }

  const { payload, config } = parsed
  const isStreaming = config.stream || false

  // Resolve an existing session or start a new one
  let session: AgentSession
  if (payload.sessionId) {
    const existing = getAgentSession(payload.sessionId)
    if (!existing) {
      return c.json({ error: 'Session not found or expired. Start a new chat by omitting sessionId.' }, 404)
    }
    if (existing.runtime.agent.state.isStreaming) {
      return c.json({ error: 'The agent is still processing the previous message for this session.' }, 409)
    }
    session = existing
  } else {
    if (!scenarioExists(payload.scenario)) {
      return c.json({ error: `Unknown scenario "${payload.scenario}". Check GET /api/v1/agent/scenarios for available keys.` }, 400)
    }
    try {
      session = createAgentSession({
        provider: config.provider as AgentProviderName,
        model: config.model,
        scenario: payload.scenario,
        systemPrompt: payload.systemPrompt,
      })
    } catch (error) {
      return handleError(c, error, 'Failed to start agent chat session')
    }
  }

  // Sessions keep their original provider/model/scenario
  const provider = session.runtime.provider
  const model = session.runtime.model
  const scenario = session.runtime.scenario
  const sessionId = session.sessionId

  const sendOptions = {
    message: payload.message,
    maxTurns: payload.maxTurns,
  }

  try {
    // Stream agent lifecycle events over SSE
    if (isStreaming) {
      c.header('Content-Type', 'text/event-stream')
      c.header('Cache-Control', 'no-cache')
      c.header('Connection', 'keep-alive')

      return streamSSE(c, async (stream) => {
        try {
          const runResult = await sendAgentMessage(session.runtime, {
            ...sendOptions,
            onEvent: async (event) => {
              await stream.writeSSE({
                data: JSON.stringify({ ...event, sessionId, scenario, provider, model, version: apiVersion }),
              })
            },
          })

          session.lastActivityAt = Date.now()
          await stream.writeSSE({
            data: JSON.stringify({
              done: true,
              sessionId,
              scenario,
              reply: runResult.result,
              steps: runResult.steps,
              turns: runResult.turns,
              usage: {
                input_tokens: runResult.usage.promptTokens,
                output_tokens: runResult.usage.completionTokens,
                total_tokens: runResult.usage.totalTokens,
              },
              provider,
              model,
              version: apiVersion,
            }),
          })
        } catch (error) {
          console.error('Agent chat streaming error:', error)
          try {
            await stream.writeSSE({
              data: JSON.stringify({
                error: error instanceof Error ? error.message : 'Agent chat streaming error',
                sessionId,
                done: true,
              }),
            })
          } catch (writeError) {
            console.error('Error writing error message to stream:', writeError)
          }
        } finally {
          try {
            await stream.close()
          } catch (closeError) {
            console.error('Error closing stream:', closeError)
          }
        }
      })
    }

    // Non-streaming response
    const runResult = await sendAgentMessage(session.runtime, sendOptions)
    session.lastActivityAt = Date.now()

    return c.json(
      createFinalResponse(
        {
          sessionId,
          scenario,
          reply: runResult.result,
          steps: runResult.steps,
          turns: runResult.turns,
          provider,
          model,
          usage: {
            input_tokens: runResult.usage.promptTokens,
            output_tokens: runResult.usage.completionTokens,
            total_tokens: runResult.usage.totalTokens,
          },
        },
        apiVersion
      ),
      200
    )
  } catch (error) {
    return handleError(c, error, 'Failed to process agent chat message')
  }
}

router.openapi(
  createRoute({
    path: '/chat',
    method: 'post',
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: {
          'application/json': {
            schema: agentChatRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description:
          'Sends a user message to a multi-turn agent chat session and returns the assistant reply with the tool calls it made. Omit payload.sessionId to start a new session; reuse the returned sessionId to continue the conversation with full context. When config.stream is true, agent lifecycle events are streamed over SSE.',
        content: {
          'application/json': {
            schema: agentChatResponseSchema,
          },
        },
      },
      404: {
        description: 'Session not found or expired',
        content: {
          'application/json': {
            schema: z.object({ error: z.string() }),
          },
        },
      },
      409: {
        description: 'The session is still processing a previous message',
        content: {
          'application/json': {
            schema: z.object({ error: z.string() }),
          },
        },
      },
      401: {
        description: 'Unauthorized - Bearer token required',
        content: {
          'application/json': {
            schema: z.object({ error: z.string() }),
          },
        },
      },
    },
    summary: 'Chat with an agent (multi-turn session)',
    description:
      'This endpoint holds a multi-turn conversation with a tool-using agent. ' +
      'The agent keeps the full conversation transcript in an in-memory session, so follow-up messages have complete context. ' +
      'Sessions expire after 30 minutes of inactivity. Scenario, provider, and model are fixed when the session is created.',
    tags: ['Agents'],
  }),
  handleAgentChatRequest as any
)

router.openapi(
  createRoute({
    path: '/sessions/{sessionId}',
    method: 'get',
    security: [{ BearerAuth: [] }],
    request: {
      params: z.object({
        sessionId: z.string().describe('Chat session id returned by POST /agent/chat'),
      }),
    },
    responses: {
      200: {
        description: 'Returns the session metadata and simplified conversation transcript.',
        content: {
          'application/json': {
            schema: agentSessionResponseSchema,
          },
        },
      },
      404: {
        description: 'Session not found or expired',
        content: {
          'application/json': {
            schema: z.object({ error: z.string() }),
          },
        },
      },
    },
    summary: 'Get an agent chat session',
    description: 'This endpoint returns the transcript and metadata of an active agent chat session.',
    tags: ['Agents'],
  }),
  ((c: Context) => {
    const sessionId = c.req.param('sessionId')
    const session = getAgentSession(sessionId)
    if (!session) {
      return c.json({ error: 'Session not found or expired' }, 404)
    }
    return c.json(getAgentSessionInfo(session), 200)
  }) as any
)

router.openapi(
  createRoute({
    path: '/sessions/{sessionId}',
    method: 'delete',
    security: [{ BearerAuth: [] }],
    request: {
      params: z.object({
        sessionId: z.string().describe('Chat session id returned by POST /agent/chat'),
      }),
    },
    responses: {
      200: {
        description: 'Deletes the chat session and its transcript.',
        content: {
          'application/json': {
            schema: agentSessionDeleteResponseSchema,
          },
        },
      },
      404: {
        description: 'Session not found or expired',
        content: {
          'application/json': {
            schema: z.object({ error: z.string() }),
          },
        },
      },
    },
    summary: 'End an agent chat session',
    description: 'This endpoint ends an agent chat session and discards its in-memory transcript.',
    tags: ['Agents'],
  }),
  ((c: Context) => {
    const sessionId = c.req.param('sessionId')
    const deleted = deleteAgentSession(sessionId)
    if (!deleted) {
      return c.json({ error: 'Session not found or expired' }, 404)
    }
    return c.json({ deleted: true, sessionId }, 200)
  }) as any
)

router.openapi(
  createRoute({
    path: '/scenarios',
    method: 'get',
    security: [{ BearerAuth: [] }],
    responses: {
      200: {
        description: 'Returns the available agent scenarios with their tools and sample tasks.',
        content: {
          'application/json': {
            schema: agentScenariosResponseSchema,
          },
        },
      },
    },
    summary: 'List agent scenarios',
    description:
      'This endpoint lists all agent scenarios — built-in (general, customer-support, real-estate) and custom agents created via the Admin API — including each scenario\'s toolset and sample tasks.',
    tags: ['Agents'],
  }),
  (c) => c.json({ scenarios: getAgentScenarioCatalog() }, 200)
)

router.openapi(
  createRoute({
    path: '/tools',
    method: 'get',
    security: [{ BearerAuth: [] }],
    responses: {
      200: {
        description: 'Returns the tools available to the agent.',
        content: {
          'application/json': {
            schema: agentToolsResponseSchema,
          },
        },
      },
    },
    summary: 'List agent tools',
    description: 'This endpoint lists the built-in tools the agent can use while completing tasks.',
    tags: ['Agents'],
  }),
  (c) => c.json({ tools: getAgentToolCatalog() }, 200)
)

export default {
  handler: router,
  mountPath: 'agent',
}
