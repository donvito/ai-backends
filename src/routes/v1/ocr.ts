import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { Context } from 'hono'
import { performOCR } from '../../services/ai'
import { handleError, handleValidationError } from '../../utils/errorHandler'
import { ocrRequestSchema, ocrResponseSchema, ocrErrorSchema, createOcrResponse } from '../../schemas/v1/ocr'
import { createFinalResponse } from './finalResponse'
import { apiVersion } from './versionConfig'

const router = new OpenAPIHono()

async function handleOcrRequest(c: Context) {
  try {
    const { payload, config } = await c.req.json()
    const { images, language = 'auto', extractStructuredData = false } = payload
    const provider = config.provider
    const model = config.model
    const temperature = config.temperature || 0.3

    if (!images || !Array.isArray(images) || images.length === 0) {
      return handleValidationError(c, 'Images are required and must be a non-empty array')
    }

    const result = await performOCR(images, provider, model, language, extractStructuredData, temperature)

    const response = createOcrResponse(
      result.text,
      result.service,
      model,
      undefined,
      result.language,
      result.structuredData,
      result.usage
    )

    const finalResponseWithVersion = createFinalResponse(response, apiVersion)

    return c.json(finalResponseWithVersion, 200)
  } catch (error) {
    return handleError(c, error, 'Failed to perform OCR')
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
        description: 'Returns the extracted text from the image via OCR.',
        content: { 'application/json': { schema: ocrResponseSchema } }
      },
      400: {
        description: 'Bad Request - Invalid input, missing images, unsupported service, or unsupported model',
        content: { 'application/json': { schema: ocrErrorSchema } }
      },
      401: {
        description: 'Unauthorized - Bearer token required',
        content: { 'application/json': { schema: { type: 'object', properties: { error: { type: 'string' } } } } }
      }
    },
    summary: 'Perform OCR on images',
    description: 'This endpoint receives one or more images and uses an LLM with vision capabilities to extract text via OCR (Optical Character Recognition). It can also extract structured data from forms, tables, and invoices if requested.',
    tags: ['API']
  }),
  handleOcrRequest as any
)

export default {
  handler: router,
  mountPath: 'ocr'
}
