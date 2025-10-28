import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { Context } from 'hono'
import { processStructuredOutputRequest } from '../../services/ai'
import { keywordsPrompt } from '../../utils/prompts'
import { handleError } from '../../utils/errorHandler'
import { keywordsRequestSchema, keywordsResponseSchema, createKeywordsResponse } from '../../schemas/v1/keywords'
import { apiVersion } from './versionConfig'
import { createFinalResponse } from './finalResponse'

const router = new OpenAPIHono()

const responseSchema = z.object({
  keywords: z.array(z.string()).describe('List of keywords extracted from the text')
})

async function handleKeywordsRequest(c: Context) {
  try {
    const { payload, config } = await c.req.json()
    const prompt = keywordsPrompt(payload.text, payload.maxKeywords)
    const temperature = config.temperature || 0
    const result = await processStructuredOutputRequest(
      prompt,
      responseSchema,
      config,
      temperature
    )
    const keywords = result.object.keywords
    const finalResponse = createKeywordsResponse(
      keywords,
      config.provider,
      {
        input_tokens: result.usage.inputTokens,
        output_tokens: result.usage.outputTokens,
        total_tokens: result.usage.totalTokens
      }
    )
    const finalResponseWithVersion = createFinalResponse(finalResponse, apiVersion)
    return c.json(finalResponseWithVersion, 200)
  } catch (error) {
    return handleError(c, error, 'Failed to extract keywords from text')
  }
}

router.openapi(
  createRoute({
    path: '/',
    method: 'post',
    request: {
      body: {
        content: {
          'application/json': {
            schema: keywordsRequestSchema
          }
        }
      }
    },
    responses: {
      200: {
        description: 'Returns the extracted keywords.',
        content: {
          'application/json': {
            schema: keywordsResponseSchema
          }
        }
      }
    },
    summary: 'Extract keywords from text',
    description: 'This endpoint receives a text and uses an LLM to extract keywords from the text.',
    tags: ['API']
  }),
  handleKeywordsRequest as any
)

export default {
  handler: router,
  mountPath: 'keywords'
}


