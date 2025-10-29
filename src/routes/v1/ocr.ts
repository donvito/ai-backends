import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { Context } from 'hono'
import { extractOCRText } from '../../services/ai'
import { handleError, handleValidationError } from '../../utils/errorHandler'
import { ocrRequestSchema, ocrResponseSchema, ocrErrorSchema } from '../../schemas/v1/ocr'

const router = new OpenAPIHono()

async function handleOCRRequest(c: Context) {
  try {
    const { images, service, model, stream = false, temperature = 0 } = await c.req.json()
    if (!images || !Array.isArray(images) || images.length === 0) {
      return handleValidationError(c, 'Images are required and must be a non-empty array')
    }
    const response = await extractOCRText(images, service, model, stream, temperature)
    
    // Format response to include text field for easier access
    const formattedResponse = {
      ...response,
      text: response.message.content
    }
    
    return c.json(formattedResponse, 200)
  } catch (error) {
    return handleError(c, error, 'Failed to extract text from images')
  }
}

router.openapi(
  createRoute({
    path: '/',
    method: 'post',
    security: [ { BearerAuth: [] } ],
    request: {
      body: {
        content: { 'application/json': { schema: ocrRequestSchema } }
      }
    },
    responses: {
      200: { 
        description: 'Returns the extracted text from the images.', 
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
    summary: 'Extract text from images using OCR',
    description: 'This endpoint receives images and uses a vision-capable LLM to extract all visible text from the images using Optical Character Recognition (OCR).',
    tags: ['API']
  }),
  handleOCRRequest as any
)

export default {
  handler: router,
  mountPath: 'ocr'
}
