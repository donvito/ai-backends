import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { Context } from 'hono'
import { rewritePrompt } from '../../utils/prompts'
import { handleError } from '../../utils/errorHandler'
import { processTextOutputRequest } from '../../services/ai'
import { apiVersion } from './versionConfig'
import { createFinalResponse } from './finalResponse'
import { rewriteRequestSchema, rewriteResponseSchema, createRewriteResponse } from '../../schemas/v1/rewrite'
import { canonicalizeTone } from '../../schemas/v1/rewrite'
import {handleStreaming} from "../../utils/streamingHandler";

const router = new OpenAPIHono()

async function handleRewriteRequest(c: Context) {
  try {
    const { payload, config } = await c.req.json()
    const provider = config.provider
    const model = config.model
    const isStreaming = config.stream || false
    
    // Case-insensitive handling for instruction using validated payload
    const normalizedInstruction = payload.instruction
    
    // Use centralized tone canonicalization (already handled by schema validation)
    const normalizedTone = payload.tone ? canonicalizeTone(payload.tone) : undefined

    const prompt = rewritePrompt(payload.text, normalizedInstruction, { maxLength: payload.maxLength, tone: normalizedTone })

    if (isStreaming) {
      const result = await processTextOutputRequest(prompt, config)
      return handleStreaming(c, result, provider, model, apiVersion)
    }

    // Non-streaming response
    const result = await processTextOutputRequest(prompt, config)
    const finalResponse = createRewriteResponse(result.text, provider, model, {
      input_tokens: result.usage.promptTokens,
      output_tokens: result.usage.completionTokens,
      total_tokens: result.usage.totalTokens,
    })

    const finalResponseWithVersion = createFinalResponse(finalResponse, apiVersion)
    return c.json(finalResponseWithVersion, 200)
  } catch (error) {
    return handleError(c, error, 'Failed to rewrite text')
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
            schema: rewriteRequestSchema
          }
        }
      }
    },
    responses: {
      200: {
        description: 'Returns the rewritten text.',
        content: {
          'application/json': {
            schema: rewriteResponseSchema
          }
        }
      },
      401: {
        description: 'Unauthorized - Bearer token required',
        content: {
          'application/json': {
            schema: z.object({ error: z.string() })
          }
        }
      }
    },
    summary: 'Rewrite text',
    description: 'This endpoint accepts text and an optional instruction, then uses an LLM to rewrite the text accordingly.',
    tags: ['API']
  }),
  handleRewriteRequest as any
)

export default {
  handler: router,
  mountPath: 'rewrite'
}
