import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { Context } from 'hono'
import { askTextPrompt } from '../../utils/prompts'
import { handleError } from '../../utils/errorHandler'
import { 
  askTextRequestSchema, 
  askTextResponseSchema, 
  createAskTextResponse 
} from '../../schemas/v1/askText'
import { processTextOutputRequest } from '../../services/ai'
import { apiVersion } from './versionConfig'
import { createFinalResponse } from './finalResponse'
import {handleStreaming} from "../../utils/streamingHandler";

const router = new OpenAPIHono()

/**
 * Handler for askText requests
 * Receives text and a question, then uses an LLM to answer the question based on the text
 */
async function handleAskTextRequest(c: Context) {
  try {
    const { payload, config } = await c.req.json()
    const provider = config.provider
    const model = config.model
    const isStreaming = config.stream || false
    
    // Create prompt combining text and question
    const prompt = askTextPrompt(payload.text, payload.question)
    
    // Handle streaming response
    if (isStreaming) {
      const result = await processTextOutputRequest(prompt, config)
      return handleStreaming(c, result, provider, model, apiVersion)
    }
    
    // Handle non-streaming response (existing logic)
    const result = await processTextOutputRequest(prompt, config)
    
    // Create response with answer and metadata
    const finalResponse = createAskTextResponse(
      result.text, 
      provider, 
      model, 
      {
        input_tokens: result.usage.inputTokens,
        output_tokens: result.usage.outputTokens,
        total_tokens: result.usage.totalTokens,
      }
    )
    
    // Add API version to response
    const finalResponseWithVersion = createFinalResponse(finalResponse, apiVersion)
    
    return c.json(finalResponseWithVersion, 200)
  } catch (error) {
    return handleError(c, error, 'Failed to answer question based on text')
  }
}

// Define OpenAPI route
router.openapi(
  createRoute({
    path: '/',
    method: 'post',
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: {
          'application/json': {
            schema: askTextRequestSchema
          }
        }
      }
    },
    responses: {
      200: {
        description: 'Returns an answer to the question based on the provided text.',
        content: {
          'application/json': {
            schema: askTextResponseSchema
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
      },
      400: {
        description: 'Bad Request - Invalid input',
        content: {
          'application/json': {
            schema: z.object({
              error: z.string()
            })
          }
        }
      },
      500: {
        description: 'Internal Server Error',
        content: {
          'application/json': {
            schema: z.object({
              error: z.string()
            })
          }
        }
      }
    },
    summary: 'Answer questions based on provided text',
    description: 'This endpoint receives a text and a question, then uses an LLM to generate an answer based solely on the provided text context.',
    tags: ['API']
  }),
  handleAskTextRequest as any
)

export default {
  handler: router,
  mountPath: 'ask-text'
}
