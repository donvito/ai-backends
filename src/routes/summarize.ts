import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { Context } from 'hono'
import { generateResponse, OpenAIError } from '../services/openai'
import { summarizePrompt } from '../utils/prompts'
import { handleError, handleValidationError, APIError } from '../utils/errorHandler'
import { summarizeRequestSchema } from '../schemas/summarize'
import { usageSchema } from '../schemas/responses'

const router = new OpenAPIHono()

const responseSchema = z.object({
  summary: z.string().describe('The summary of the text'),
  usage: usageSchema
})

const summarizeOutputSchema = z.object({
  summary: z.string()
})

/**
 * Handler for text summarization endpoint
 */
async function handleSummarizeRequest(c: Context) {
  try {
    const body = await c.req.json()
    const validatedBody = summarizeRequestSchema.parse(body)
    const { text, maxLength } = validatedBody

    // Generate the prompt with instructions for JSON output
    const prompt = `${summarizePrompt(text, maxLength)}

Please respond with a JSON object in this format:
{
  "summary": "your summary here"
}`

    // Get response using our service
    const { data, usage } = await generateResponse(
      prompt,
      summarizeOutputSchema
    )

    return c.json({ 
      summary: data.summary,
      usage
    }, 200)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(c, 'Invalid request body')
    }
    if (error instanceof OpenAIError) {
      return handleError(c, new APIError(error.message, error.statusCode, 'OPENAI_ERROR'))
    }
    return handleError(c, error, 'Failed to summarize text')
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
            schema: summarizeRequestSchema
          }
        }
      }
    },
    responses: {
      200: {
        description: 'Returns the summarized text.',
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
  handleSummarizeRequest
)  

export default {
  handler: router,
  mountPath: 'summarize'
}
