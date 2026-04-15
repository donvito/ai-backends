import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { Context } from 'hono'
import { handleError } from '../../utils/errorHandler'
import {
  understandImageRequestSchema,
  understandImageResponseSchema,
  understandImageErrorSchema,
  createUnderstandImageResponse,
} from '../../schemas/v1/understandImage'
import { generateImageUnderstandingResponse } from '../../services/ai'
import { apiVersion } from './versionConfig'
import { createFinalResponse } from './finalResponse'

const router = new OpenAPIHono()

async function handleUnderstandImageRequest(c: Context) {
  try {
    const body = await c.req.json()
    const { payload, config } = understandImageRequestSchema.parse(body)
    const { imageUrl, question } = payload
    const { provider, model, temperature = 0 } = config

    const result = await generateImageUnderstandingResponse(imageUrl, question, {
      provider,
      model,
      temperature,
    })

    const response = createUnderstandImageResponse(
      result.text,
      provider,
      model,
      {
        input_tokens: result.usage.promptTokens,
        output_tokens: result.usage.completionTokens,
        total_tokens: result.usage.totalTokens,
      }
    )

    return c.json(createFinalResponse(response, apiVersion), 200)
  } catch (error) {
    return handleError(c, error, 'Failed to understand image')
  }
}

router.openapi(
  createRoute({
    path: '/',
    method: 'post',
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: {
          'application/json': {
            schema: understandImageRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Returns an answer to the question about the image.',
        content: {
          'application/json': {
            schema: understandImageResponseSchema,
          },
        },
      },
      400: {
        description: 'Bad Request - Invalid input or unsupported provider',
        content: {
          'application/json': {
            schema: understandImageErrorSchema,
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
      500: {
        description: 'Internal Server Error',
        content: {
          'application/json': {
            schema: understandImageErrorSchema,
          },
        },
      },
    },
    summary: 'Understand and analyze an image',
    description:
      'This endpoint accepts an image (URL or base64 data URL) and a question, then uses a vision-capable LLM to analyze the image and answer the question. Supported providers: anthropic, openai, openrouter, google.',
    tags: ['API'],
  }),
  handleUnderstandImageRequest as any
)

export default {
  handler: router,
  mountPath: 'understand-image',
}
