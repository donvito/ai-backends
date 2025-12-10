import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { Context } from 'hono'
import { handleError, handleValidationError } from '../../utils/errorHandler'
import { visionRequestSchema, visionResponseSchema, visionErrorSchema } from '../../schemas/v1/vision'
import { zaiConfig } from '../../config/services'
import zaiProvider from '../../services/zai'

const router = new OpenAPIHono()

async function handleVisionRequest(c: Context) {
  try {
    const body = await c.req.json()
    const { payload, config } = visionRequestSchema.parse(body)
    const { imageUrl, prompt, thinking } = payload
    const { provider, model } = config

    console.log('[Vision] Request received:', { 
      imageUrl: imageUrl.substring(0, 50) + '...', 
      prompt: prompt.substring(0, 50) + '...', 
      provider,
      model,
      thinking 
    })

    // Currently only ZAI provider supports vision
    if (provider !== 'zai') {
      return handleValidationError(c, 'Vision currently only supports the ZAI provider. Please set provider to "zai".')
    }

    if (!zaiConfig.enabled || !zaiConfig.apiKey) {
      return handleValidationError(c, 'ZAI provider is not configured. Please set ZAI_API_KEY in your environment.')
    }

    const result = await zaiProvider.analyzeImage(imageUrl, prompt, model, thinking)

    return c.json(result, 200)
  } catch (error) {
    console.error('[Vision] Endpoint error:', error)
    return handleError(c, error, 'Failed to analyze image')
  }
}

router.openapi(
  createRoute({
    path: '/',
    method: 'post',
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: { 'application/json': { schema: visionRequestSchema } }
      }
    },
    responses: {
      200: {
        description: 'Returns the vision analysis result.',
        content: { 'application/json': { schema: visionResponseSchema } }
      },
      400: {
        description: 'Bad Request - Invalid input',
        content: { 'application/json': { schema: visionErrorSchema } }
      },
      401: {
        description: 'Unauthorized - Bearer token required',
        content: { 'application/json': { schema: { type: 'object', properties: { error: { type: 'string' } } } } }
      },
      500: {
        description: 'Server error - Failed to analyze image',
        content: { 'application/json': { schema: visionErrorSchema } }
      }
    },
    summary: 'Analyze an image with vision AI',
    description: 'This endpoint receives an image URL and a prompt, then uses ZAI GLM-4.6V vision models to answer questions about the image, detect objects, and provide coordinates.',
    tags: ['API']
  }),
  handleVisionRequest as any
)

export default {
  handler: router,
  mountPath: 'vision'
}
