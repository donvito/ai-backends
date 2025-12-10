import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { Context } from 'hono'
import { handleError, handleValidationError } from '../../utils/errorHandler'
import { ocrRequestSchema, ocrResponseSchema, ocrErrorSchema } from '../../schemas/v1/ocr'
import { zaiConfig } from '../../config/services'
import zaiProvider from '../../services/zai'

const router = new OpenAPIHono()

async function handleOcrRequest(c: Context) {
  try {
    const body = await c.req.json()
    const { imageUrl, prompt, jsonSchema, model } = ocrRequestSchema.parse(body)

    console.log('[OCR] Request received:', { imageUrl: imageUrl.substring(0, 50) + '...', prompt, model, hasSchema: !!jsonSchema })

    if (!zaiConfig.enabled || !zaiConfig.apiKey) {
      return handleValidationError(c, 'ZAI provider is not configured. Please set ZAI_API_KEY in your environment.')
    }

    const result = await zaiProvider.extractFromImage(imageUrl, prompt, jsonSchema, model)

    console.log('[OCR] Response received:', {
      hasRawText: !!result.rawText,
      rawTextLength: result.rawText?.length || 0,
      hasExtractedData: !!result.extractedData,
      parseError: result.parseError
    })

    return c.json(result, 200)
  } catch (error) {
    console.error('[OCR] Endpoint error:', error)
    return handleError(c, error, 'Failed to extract data from image')
  }
}

router.openapi(
  createRoute({
    path: '/',
    method: 'post',
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: { 'application/json': { schema: ocrRequestSchema } }
      }
    },
    responses: {
      200: {
        description: 'Returns the extracted data from the image.',
        content: { 'application/json': { schema: ocrResponseSchema } }
      },
      400: {
        description: 'Bad Request - Invalid input',
        content: { 'application/json': { schema: ocrErrorSchema } }
      },
      401: {
        description: 'Unauthorized - Bearer token required',
        content: { 'application/json': { schema: { type: 'object', properties: { error: { type: 'string' } } } } }
      },
      500: {
        description: 'Server error - Failed to extract data',
        content: { 'application/json': { schema: ocrErrorSchema } }
      }
    },
    summary: 'Extract structured data from image using OCR',
    description: 'This endpoint receives an image URL and extraction instructions, then uses ZAI GLM-4.6V vision models to extract structured data. Optionally provide a JSON schema to format the output.',
    tags: ['API']
  }),
  handleOcrRequest as any
)

export default {
  handler: router,
  mountPath: 'ocr'
}
