import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { Context } from 'hono'
import { handleError, handleValidationError } from '../../utils/errorHandler'
import { ocrRequestSchema, ocrResponseSchema, ocrErrorSchema } from '../../schemas/v1/ocr'
import { generateOCRResponse } from '../../services/ai'
import { apiVersion } from './versionConfig'
import { createFinalResponse } from './finalResponse'

const router = new OpenAPIHono()

async function handleOCRRequest(c: Context) {
  try {
    const { service, model, temperature = 0, stream = false, images } = await c.req.json()

    if (!images || !Array.isArray(images) || images.length === 0) {
      return handleValidationError(c, 'Images are required and must be a non-empty array')
    }

    const response = await generateOCRResponse(images, service, model, stream, temperature)
    const finalResponse = createFinalResponse(response, apiVersion)

    return c.json(finalResponse, 200)
  } catch (error) {
    return handleError(c, error, 'Failed to perform OCR')
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
        description: 'Returns the extracted text from the image.',
        content: {
          'application/json': {
            schema: ocrResponseSchema
          }
        }
      },
      400: {
        description: 'Bad Request - Invalid input, missing images, unsupported service, or unsupported model',
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
    summary: 'Extract text from image (OCR)',
    description: 'This endpoint receives an image and uses an LLM with vision capabilities to extract text from the image.',
    tags: ['API']
  }),
  handleOCRRequest as any
)

export default {
  handler: router,
  mountPath: 'ocr'
}