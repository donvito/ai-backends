import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { Context } from 'hono'
import { performOCROnImages } from '../../services/ai'
import { handleError, handleValidationError } from '../../utils/errorHandler'
import { ocrRequestSchema, ocrResponseSchema, ocrErrorSchema, supportedOCRServices } from '../../schemas/v1/ocr'

const router = new OpenAPIHono()

async function handleOCRRequest(c: Context) {
  try {
    const { images, service = 'ollama', model, temperature = 0, language, format = 'plain' } = await c.req.json()

    if (!images || !Array.isArray(images) || images.length === 0) {
      return handleValidationError(c, 'images', 'Images are required and must be a non-empty array')
    }

    const result = await performOCROnImages(images, service, model, {
      temperature,
      language,
      format
    })

    return c.json(result, 200)
  } catch (error) {
    if (error instanceof Error && (
      error.message.includes('OCR capabilities not supported') ||
      error.message.includes('At least one image is required') ||
      error.message.includes('Provider not registered')
    )) {
      return c.json({
        error: error.message,
        supportedServices: Array.from(supportedOCRServices)
      }, 400)
    }

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
        content: {
          'application/json': {
            schema: ocrRequestSchema
          }
        }
      }
    },
    responses: {
      200: {
        description: 'Returns extracted text from the provided image(s).',
        content: {
          'application/json': {
            schema: ocrResponseSchema
          }
        }
      },
      400: {
        description: 'Bad Request - Invalid input or unsupported service',
        content: {
          'application/json': {
            schema: ocrErrorSchema
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
    summary: 'Extract text from images',
    description: 'This endpoint performs Optical Character Recognition (OCR) on one or more base64-encoded images and returns the extracted text.',
    tags: ['API']
  }),
  handleOCRRequest as any
)

export default {
  handler: router,
  mountPath: 'ocr'
}
