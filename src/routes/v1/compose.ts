import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { composePrompt } from '../../utils/prompts'
import { handleError } from '../../utils/errorHandler'
import { composeRequestSchema, composeResponseSchema, createComposeResponse } from '../../schemas/v1/compose'
import { processTextOutputRequest } from '../../services/ai'
import { apiVersion } from './versionConfig'
import { createFinalResponse } from './finalResponse'

const router = new OpenAPIHono()

async function handleComposeRequest(c: Context) {
  try {
    const { payload, config } = await c.req.json()
    const provider = config.provider
    const model = config.model
    const isStreaming = config.stream || false

    const prompt = composePrompt(payload.topic, payload.maxLength)

    if (isStreaming) {
      const result = await processTextOutputRequest(prompt, config)

      c.header('Content-Type', 'text/event-stream')
      c.header('Cache-Control', 'no-cache')
      c.header('Connection', 'keep-alive')

      return streamSSE(c, async (stream) => {
        try {
          const textStream = result.textStream
          if (!textStream) {
            throw new Error('Streaming not supported for this provider/model')
          }

          for await (const chunk of textStream) {
            await stream.writeSSE({
              data: JSON.stringify({
                chunk: chunk,
                provider: provider,
                model: model,
                version: apiVersion
              })
            })
          }

          const usage = await result.usage
          if (usage) {
            await stream.writeSSE({
              data: JSON.stringify({
                done: true,
                usage: {
                  input_tokens: usage.promptTokens,
                  output_tokens: usage.completionTokens,
                  total_tokens: usage.totalTokens
                },
                provider: provider,
                model: model,
                version: apiVersion
              })
            })
          }
        } catch (error) {
          try {
            await stream.writeSSE({
              data: JSON.stringify({
                error: error instanceof Error ? error.message : 'Streaming error',
                done: true
              })
            })
          } catch {}
        } finally {
          try { await stream.close() } catch {}
        }
      })
    }

    const result = await processTextOutputRequest(prompt, config)
    const finalResponse = createComposeResponse(result.text, provider, model, {
      input_tokens: result.usage.promptTokens,
      output_tokens: result.usage.completionTokens,
      total_tokens: result.usage.totalTokens,
    })

    const finalResponseWithVersion = createFinalResponse(finalResponse, apiVersion)
    return c.json(finalResponseWithVersion, 200)
  } catch (error) {
    return handleError(c, error, 'Failed to compose text')
  }
}

router.openapi(
  createRoute({
    path: '/',
    method: 'post',
    security: [ { BearerAuth: [] } ],
    request: {
      body: {
        content: {
          'application/json': {
            schema: composeRequestSchema
          }
        }
      }
    },
    responses: {
      200: {
        description: 'Returns composed text for the provided topic.',
        content: {
          'application/json': {
            schema: composeResponseSchema
          }
        }
      },
      401: {
        description: 'Unauthorized - Bearer token required',
        content: {
          'application/json': {
            schema: z.object({
              error: z.string()
            })
          }
        }
      }
    },
    summary: 'Compose text',
    description: 'This endpoint receives a topic and uses an LLM to compose text about it.',
    tags: ['API']
  }),
  handleComposeRequest as any
)

export default {
  handler: router,
  mountPath: 'compose'
}
