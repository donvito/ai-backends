import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { Context } from 'hono'
import { composePrompt } from '../../utils/prompts'
import { handleError } from '../../utils/errorHandler'
import { composeRequestSchema, composeResponseSchema, createComposeResponse } from '../../schemas/v1/compose'
import { processTextOutputRequest } from '../../services/ai'
import { apiVersion } from './versionConfig'
import { createFinalResponse } from './finalResponse'
import {handleStreaming} from "../../utils/streamingHandler";

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
      return handleStreaming(c, result, provider, model, apiVersion)
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
