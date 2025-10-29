import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { Context } from 'hono'
import { handleError, handleValidationError } from '../../utils/errorHandler'
import { ocrRequestSchema, ocrResponseSchema, ocrErrorSchema } from '../../schemas/v1/ocr'
import { ocrPrompt } from '../../utils/prompts'
import { serviceRegistry } from '../../services/registry'

const router = new OpenAPIHono()

async function handleOcrRequest(c: Context) {
  try {
    const { images, service, model, stream = false, temperature = 0, language, preserveFormatting = true } = await c.req.json()
    
    if (!images || !Array.isArray(images) || images.length === 0) {
      return handleValidationError(c, 'Images are required and must be a non-empty array')
    }

    // Get the provider
    const provider = serviceRegistry.get(service);
    if (!provider) {
      return handleError(c, new Error(`Provider not registered: ${service}`), 'Provider not available')
    }

    if (typeof provider.describeImage !== 'function') {
      return handleError(
        c, 
        new Error(`OCR capabilities not supported for service: ${service}`),
        'OCR not supported'
      )
    }

    // Generate OCR prompt
    const prompt = ocrPrompt(language, preserveFormatting)

    // Call the vision model with OCR-specific instructions
    const result = await provider.describeImage(images, model, stream, temperature, prompt)
    
    const response = {
      ...result,
      usage: {
        input_tokens: result.prompt_eval_count || 0,
        output_tokens: result.eval_count || 0,
        total_tokens: (result.prompt_eval_count || 0) + (result.eval_count || 0),
      },
      service: service
    }

    return c.json(response, 200)
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
        content: { 'application/json': { schema: ocrRequestSchema } }
      }
    },
    responses: {
      200: { 
        description: 'Returns the extracted text from the image(s).', 
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
    summary: 'Extract text from images (OCR)',
    description: 'This endpoint receives one or more images and uses an LLM with vision capabilities to extract all visible text (Optical Character Recognition).',
    tags: ['API']
  }),
  handleOcrRequest as any
)

export default {
  handler: router,
  mountPath: 'ocr'
}
