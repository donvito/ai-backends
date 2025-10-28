import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { Context } from 'hono'
import { outlinePrompt } from '../../utils/prompts'
import { handleError } from '../../utils/errorHandler'
import { outlineRequestSchema, outlineResponseSchema } from '../../schemas/v1/outline'
import { createOutlineResponse } from '../../schemas/v1/outline'
import { processTextOutputRequest } from '../../services/ai'
import { apiVersion } from './versionConfig'
import { createFinalResponse } from './finalResponse'
import {handleStreaming} from "../../utils/streamingHandler";

const router = new OpenAPIHono()

async function handleOutlineRequest(c: Context) {
  try {
    const { payload, config } = await c.req.json()
    const provider = config.provider
    const model = config.model
    const isStreaming = config.stream || false
    const prompt = outlinePrompt(
      payload.text,
      payload.maxDepth,
      payload.style,
      payload.includeIntro,
      payload.includeConclusion
    )
    
    // Handle streaming response
    if (isStreaming) {
      const result = await processTextOutputRequest(prompt, config)
      return handleStreaming(c, result, provider, model, apiVersion)
    }
    
    // Handle non-streaming response
    const result = await processTextOutputRequest(prompt, config)
    const finalResponse = createOutlineResponse(result.text, provider, model, {
      input_tokens: result.usage.inputTokens,
      output_tokens: result.usage.outputTokens,
      total_tokens: result.usage.totalTokens,
    })

    const finalResponseWithVersion = createFinalResponse(finalResponse, apiVersion)

    return c.json(finalResponseWithVersion, 200)
  } catch (error) {
    return handleError(c, error, 'Failed to create outline')
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
            schema: outlineRequestSchema
          }
        }
      }
    },
    responses: {
      200: {
        description: 'Returns the generated outline.',
        content: {
          'application/json': {
            schema: outlineResponseSchema
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
    summary: 'Create outline from text',
    description: 'This endpoint receives a text and uses an LLM to create a structured outline.',
    tags: ['API']
  }),
  handleOutlineRequest as any
)

export default {
  handler: router,
  mountPath: 'outline'
}



