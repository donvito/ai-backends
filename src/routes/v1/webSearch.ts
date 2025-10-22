import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { Context } from 'hono'
import { handleError } from '../../utils/errorHandler'
import {
  webSearchRequestSchema,
  webSearchResponseSchema,
  createWebSearchResponse
} from '../../schemas/v1/webSearch'
import { processTextOutputRequest } from '../../services/ai'
import { webSearchResultsPrompt } from '../../utils/prompts'
import { apiVersion } from './versionConfig'
import { createFinalResponse } from './finalResponse'
import {handleStreaming} from "../../utils/streamingHandler";

const router = new OpenAPIHono()

export interface FirecrawlResult {
  url: string
  title: string
  description: string
  position: number,
  markdown: string,
}

interface FirecrawlResponse {
  success: boolean
  data: {
    web: FirecrawlResult[]
  }
  creditsUsed: number
}

/**
 * Call Firecrawl API to perform web search
 */
async function callFirecrawlAPI(query: string, options: {
  sources?: string[]
  limit?: number
}): Promise<FirecrawlResponse> {
  const url = 'https://api.firecrawl.dev/v2/search'
  const apiKey = process.env.FIRECRAWL_API_KEY

  if (!apiKey) {
    throw new Error('FIRECRAWL_API_KEY environment variable is not set')
  }

  const body = {
    query,
    sources: options.sources || ['web'],
    categories: [],
    limit: options.limit || 10,
    scrapeOptions: {
      onlyMainContent: false,
      maxAge: 172800000,
      parsers: [],
      formats: ["markdown", "summary", "links"]
    }
  }

  // Create AbortController for timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => {
    controller.abort()
  }, 30000) // 30 second timeout

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    })

    // Clear timeout if fetch succeeds
    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`Firecrawl API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return data as FirecrawlResponse
  } catch (error) {
    // Clear timeout if fetch fails
    clearTimeout(timeoutId)

    // Handle timeout specifically
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Firecrawl API request timed out after 30 seconds. Please try again.')
    }

    // Re-throw other errors
    throw error
  }
}


/**
 * Handler for webSearch requests
 * Performs web search using Firecrawl API and converts results to natural language
 */
async function handleWebSearchRequest(c: Context) {
  try {
    const { payload, config } = await c.req.json()
    const provider = config.provider
    const model = config.model
    const isStreaming = config.stream || false

    // Call Firecrawl API to get search results
    const firecrawlResponse = await callFirecrawlAPI(payload.query, {
      sources: payload.sources,
      limit: payload.limit
    })

    if (!firecrawlResponse.success) {
      throw new Error('Firecrawl API returned unsuccessful response')
    }

    const searchResults = firecrawlResponse.data.web

    // Validate that searchResults is an array with items
    if (!Array.isArray(searchResults) || searchResults.length === 0) {
      return handleError(c, new Error('No search results found. Please try a different search query.'), 'No search results available')
    }

    // Create prompt for converting search results to natural language
    const prompt = webSearchResultsPrompt(searchResults)

    // Handle streaming response
    if (isStreaming) {
      const result = await processTextOutputRequest(prompt, config)
      return handleStreaming(c, result, provider, model, apiVersion)
    }

    // Handle non-streaming response
    const result = await processTextOutputRequest(prompt, config)

    // Create response with natural language summary only
    const finalResponse = createWebSearchResponse(
      result.text,
      provider,
      model,
      {
        input_tokens: result.usage.promptTokens,
        output_tokens: result.usage.completionTokens,
        total_tokens: result.usage.totalTokens,
      }
    )

    // Add API version to response
    const finalResponseWithVersion = createFinalResponse(finalResponse, apiVersion)

    return c.json(finalResponseWithVersion, 200)
  } catch (error) {
    return handleError(c, error, 'Failed to perform web search')
  }
}

// Define OpenAPI route
router.openapi(
  createRoute({
    path: '/',
    method: 'post',
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: {
          'application/json': {
            schema: webSearchRequestSchema
          }
        }
      }
    },
    responses: {
      200: {
        description: 'Returns a natural language summary of web search results.',
        content: {
          'application/json': {
            schema: webSearchResponseSchema
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
      },
      400: {
        description: 'Bad Request - Invalid input',
        content: {
          'application/json': {
            schema: z.object({
              error: z.string()
            })
          }
        }
      },
      500: {
        description: 'Internal Server Error',
        content: {
          'application/json': {
            schema: z.object({
              error: z.string()
            })
          }
        }
      }
    },
    summary: 'Perform web search and summarize results',
    description: 'This endpoint performs a web search using the Firecrawl API and converts the results into a natural language summary using an LLM.',
    tags: ['API']
  }),
  handleWebSearchRequest as any
)

export default {
  handler: router,
  mountPath: 'web-search'
}