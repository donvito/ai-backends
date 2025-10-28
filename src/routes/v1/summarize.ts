import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { Context } from 'hono'
import { summarizePrompt } from '../../utils/prompts'
import { handleError } from '../../utils/errorHandler'
import { summarizeRequestSchema, summarizeResponseSchema } from '../../schemas/v1/summarize'
import { createSummarizeResponse } from '../../schemas/v1/summarize'
import { processTextOutputRequest } from '../../services/ai'
import { apiVersion } from './versionConfig'
import { createFinalResponse } from './finalResponse'
import { handleStreaming } from "../../utils/streamingHandler";

const router = new OpenAPIHono()

async function handleSummarizeRequest(c: Context) {
  try {
    const { payload, config } = await c.req.json()
    const provider = config.provider
    const model = config.model
    const isStreaming = config.stream || false
    const prompt = summarizePrompt(payload.text, payload.maxLength)
    
    // Handle streaming response
    if (isStreaming) {
      const result = await processTextOutputRequest(prompt, config)
        return handleStreaming(c, result, provider, model, apiVersion)
    }
    
    // Handle non-streaming response (existing logic)
    const result = await processTextOutputRequest(prompt, config)
    const finalResponse = createSummarizeResponse(result.text, provider, model, {
      input_tokens: result.usage.inputTokens,
      output_tokens: result.usage.outputTokens,
      total_tokens: result.usage.totalTokens,
    })

    const finalResponseWithVersion = createFinalResponse(finalResponse, apiVersion)

    return c.json(finalResponseWithVersion, 200)
  } catch (error) {
    return handleError(c, error, 'Failed to summarize text')
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
            schema: summarizeRequestSchema
          }
        }
      }
    },
    responses: {
      200: {
        description: 'Returns the summarized text.',
        content: {
          'application/json': {
            schema: summarizeResponseSchema
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
    summary: 'Summarize text',
    description: 'This endpoint receives a text and uses an LLM to summarize the text.',
    tags: ['API']
  }),
  handleSummarizeRequest as any
)

export default {
  handler: router,
  mountPath: 'summarize'
}


