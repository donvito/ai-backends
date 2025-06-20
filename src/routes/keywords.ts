import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { Context } from 'hono'
import { generateResponse, OpenAIError } from '../services/openai'
import { keywordsPrompt } from '../utils/prompts'
import { handleError, handleValidationError, APIError } from '../utils/errorHandler'
import { keywordsRequestSchema } from '../schemas/keywords'
import { usageSchema } from '../schemas/responses'

const router = new OpenAPIHono()

const responseSchema = z.object({
  keywords: z.array(z.string()).describe('List of keywords extracted from the text'),
  usage: usageSchema
})

const keywordsOutputSchema = z.object({
  keywords: z.array(z.string())
})

/**
 * Handler for keywords extraction endpoint
 */
async function handleKeywordsRequest(c: Context) {
  try {
    const body = await c.req.json()
    const validatedBody = keywordsRequestSchema.parse(body)
    const { text, maxKeywords } = validatedBody

    // Generate the prompt with instructions for JSON output
    const prompt = `${keywordsPrompt(text, maxKeywords)}

Please respond with a JSON object in this format:
{
  "keywords": ["keyword1", "keyword2", "keyword3"]
}`

    // Get response using our service
    const { data, usage } = await generateResponse(
      prompt,
      keywordsOutputSchema
    )

    return c.json({ 
      keywords: data.keywords,
      usage
    }, 200)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(c, 'Invalid request body')
    }
    if (error instanceof OpenAIError) {
      return handleError(c, new APIError(error.message, error.statusCode, 'OPENAI_ERROR'))
    }
    return handleError(c, error, 'Failed to extract keywords from text')
  }
} 

router.openapi(
  createRoute({
    path: '/',
    method: 'post',
    request: {
      body: {
        content: {
          'application/json': {
            schema: keywordsRequestSchema
          }
        }
      }
    },
    responses: {
      200: {
        description: 'Returns the extracted keywords.',
        content: {
          'application/json': {
            schema: responseSchema
          }
        }
      },
      400: {
        description: 'Bad request - validation error'
      },
      500: {
        description: 'Internal server error'
      }
    },
    tags: ['Text Processing']
  }), 
  handleKeywordsRequest
)  

export default {
  handler: router,
  mountPath: 'keywords'
} 