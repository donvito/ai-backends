import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { handleError } from '../../utils/errorHandler'
import {
  agentRequestSchema,
  agentResponseSchema,
  agentScenariosResponseSchema,
  agentToolsResponseSchema,
  createAgentResponse,
} from '../../schemas/v1/agent'
import { getAgentToolCatalog } from '../../services/agent-tools'
import { getAgentScenarioCatalog } from '../../services/agent-scenarios'
import { runAgent, type AgentProviderName } from '../../services/pi-agent'
import { apiVersion } from './versionConfig'
import { createFinalResponse } from './finalResponse'

const router = new OpenAPIHono()

async function handleAgentRunRequest(c: Context) {
  try {
    const body = await c.req.json()
    const parsed = agentRequestSchema.parse(body)
    const { payload, config } = parsed
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
          'Runs a tool-using agent (powered by pi core) to complete the task and returns the final answer with the tool calls it made. When config.stream is true, agent lifecycle events are streamed over SSE.',
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
      'This endpoint runs an autonomous agent loop using pi core (@earendil-works/pi-agent-core). ' +
      'The agent calls tools across multiple turns to complete the task. Pick a scenario to select the toolset: ' +
      'general (calculator, date/time, weather), customer-support (account, subscription, billing, tickets), ' +
      'or real-estate (listing search, property details, viewing slots, appointment booking). ' +
      'Supported providers: OpenRouter and the official OpenAI API.',
    tags: ['Agents'],
  }),
  handleAgentRunRequest as any
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
      'This endpoint lists the demo scenarios available for the agent (general, customer-support, real-estate), including each scenario\'s toolset and sample tasks.',
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
