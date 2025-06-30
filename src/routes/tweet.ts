import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { Context } from 'hono'
import { generateTweet, OpenAIError } from '../services/openai'
import { handleError, handleValidationError, APIError } from '../utils/errorHandler'
import { tweetRequestSchema, tweetResponseSchema } from '../schemas/tweet'

const router = new OpenAPIHono()

/**
 * Handler for tweet creation endpoint
 */
async function handleTweetRequest(c: Context) {
  try {
    const body = await c.req.json()
    const validatedBody = tweetRequestSchema.parse(body)
    const { topic } = validatedBody

    // Generate the tweet using our service
    const { tweet, characterCount, author, usage } = await generateTweet(topic)

    return c.json({ 
      tweet,
      characterCount,
      author,
      usage
    }, 200)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(c, 'Invalid request body')
    }
    if (error instanceof OpenAIError) {
      return handleError(c, new APIError(error.message, error.statusCode, 'OPENAI_ERROR'))
    }
    return handleError(c, error, 'Failed to generate tweet')
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
            schema: tweetRequestSchema
          }
        }
      }
    },
    responses: {
      200: {
        description: 'Returns the generated tweet.',
        content: {
          'application/json': {
            schema: tweetResponseSchema
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
    tags: ['Content Generation']
  }), 
  handleTweetRequest
)  

export default {
  handler: router,
  mountPath: 'tweet'  // This will be mounted at /api/tweet
} 