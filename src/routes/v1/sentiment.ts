import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { Context } from 'hono'
import { z } from 'zod/v3';
import { sentimentPrompt } from '../../utils/prompts'
import { handleError } from '../../utils/errorHandler'
import { createSentimentResponse, sentimentRequestSchema, sentimentResponseSchema } from '../../schemas/v1/sentiment'
import { processStructuredOutputRequest } from '../../services/ai'
import { createFinalResponse } from './finalResponse'
import { apiVersion } from './versionConfig'

const responseSchema = z.object({
  sentiment: z.string(),
  confidence: z.number().min(0).max(1),
  emotions: z.array(z.object({
    emotion: z.string(),
    score: z.number().min(0).max(1)
  }))
})

const router = new OpenAPIHono()

async function handleSentimentRequest(c: Context) {
  try {
    const { payload, config } = await c.req.json()
    const prompt = sentimentPrompt(payload.text)
    const result = await processStructuredOutputRequest(
      prompt,
      responseSchema,
      config
    )
    const { sentiment, confidence, emotions } = result.object
    const { usage } = result
    const finalResponse = createSentimentResponse(
      sentiment,
      confidence,
      emotions,
      config.provider,
      config.model,
      usage
    )
    const finalResponseWithVersion = createFinalResponse(finalResponse, apiVersion)
    return c.json(finalResponseWithVersion, 200)
  } catch (error) {
    return handleError(c, error, 'Failed to analyze sentiment')
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
            schema: sentimentRequestSchema
          }
        }
      }
    },
    responses: {
      200: {
        description: 'Returns sentiment analysis results.',
        content: {
          'application/json': {
            schema: sentimentResponseSchema
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
    summary: 'Analyze sentiment of text',
    description: 'This endpoint receives a text and uses an LLM to analyze the sentiment of the text.',
    tags: ['API']
  }),
  handleSentimentRequest as any
)

export default {
  handler: router,
  mountPath: 'sentiment'
}


