import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { Context } from 'hono'
import { handleError, handleValidationError } from '../../utils/errorHandler'
import { ocrRequestSchema, ocrResponseSchema, ocrErrorSchema } from '../../schemas/v1/ocr'
import { zaiConfig } from '../../config/services'

const router = new OpenAPIHono()

interface ZAIMessage {
  role: string
  content: Array<{
    type: string
    text?: string
    image_url?: {
      url: string
    }
  }>
}

interface ZAIRequestBody {
  model: string
  messages: ZAIMessage[]
  thinking?: {
    type: string
  }
}

interface ZAIChoice {
  message: {
    content: string
    reasoning_content?: string
  }
}

interface ZAIResponse {
  choices: ZAIChoice[]
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

async function handleOcrRequest(c: Context) {
  try {
    const body = await c.req.json()
    const { imageUrl, prompt, model, thinking } = ocrRequestSchema.parse(body)

    if (!zaiConfig.enabled || !zaiConfig.apiKey) {
      return handleValidationError(c, 'ZAI provider is not configured. Please set ZAI_API_KEY in your environment.')
    }

    const baseUrl = (zaiConfig.baseURL || 'https://api.z.ai/api/paas/v4').replace(/\/$/, '')

    const requestBody: ZAIRequestBody = {
      model: model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: imageUrl
              }
            },
            {
              type: 'text',
              text: prompt
            }
          ]
        }
      ]
    }

    if (thinking) {
      requestBody.thinking = { type: 'enabled' }
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${zaiConfig.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('ZAI OCR API error:', errorText)
      return c.json({
        error: 'Failed to process image',
        details: errorText
      }, 500)
    }

    const data = await response.json() as ZAIResponse

    const result = {
      text: data.choices?.[0]?.message?.content || '',
      model: model,
      provider: 'zai',
      thinking: data.choices?.[0]?.message?.reasoning_content,
      usage: data.usage ? {
        input_tokens: data.usage.prompt_tokens,
        output_tokens: data.usage.completion_tokens,
        total_tokens: data.usage.total_tokens
      } : undefined
    }

    return c.json(result, 200)
  } catch (error) {
    console.error('OCR endpoint error:', error)
    return handleError(c, error, 'Failed to process OCR request')
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
        description: 'Returns the extracted text from the image.',
        content: { 'application/json': { schema: ocrResponseSchema } }
      },
      400: {
        description: 'Bad Request - Invalid input or missing image URL',
        content: { 'application/json': { schema: ocrErrorSchema } }
      },
      401: {
        description: 'Unauthorized - Bearer token required',
        content: { 'application/json': { schema: { type: 'object', properties: { error: { type: 'string' } } } } }
      },
      500: {
        description: 'Server error - Failed to process image',
        content: { 'application/json': { schema: ocrErrorSchema } }
      }
    },
    summary: 'Extract text from image using OCR',
    description: 'This endpoint receives an image URL and uses ZAI GLM-4.6V vision models to extract text and analyze the image content.',
    tags: ['API']
  }),
  handleOcrRequest as any
)

export default {
  handler: router,
  mountPath: 'ocr'
}
