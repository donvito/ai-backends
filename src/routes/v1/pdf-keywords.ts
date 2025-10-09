import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { Context } from 'hono'
import { processStructuredOutputRequest } from '../../services/ai'
import { keywordsPrompt } from '../../utils/prompts'
import { handleError } from '../../utils/errorHandler'
import { pdfKeywordsRequestSchema, pdfKeywordsResponseSchema, createPdfKeywordsResponse } from '../../schemas/v1/pdf-keywords'
import { apiVersion } from './versionConfig'
import { createFinalResponse } from './finalResponse'
import { extractPDF, truncateText } from '../../utils/pdfExtractor'

const router = new OpenAPIHono()

const responseSchema = z.object({
  keywords: z.array(z.string()).describe('List of keywords extracted from the PDF text')
})

// Maximum text length to send to the LLM (to avoid token limits)
const MAX_PDF_TEXT_LENGTH = 50000

async function handlePdfKeywordsRequest(c: Context) {
  try {
    const body = await c.req.json()
    
    // Validate the request body against the schema
    const validationResult = pdfKeywordsRequestSchema.safeParse(body)
    if (!validationResult.success) {
      return c.json({ error: 'Invalid request format', details: validationResult.error.errors }, 400)
    }
    
    const { payload, config } = validationResult.data
    const provider = config.provider
    const model = config.model
    
    // Extract PDF content
    const pdfData = await extractPDF(payload.url)
    
    if (!pdfData.text || pdfData.text.length === 0) {
      throw new Error('No text content found in the PDF')
    }
    
    // Truncate text if it's too long
    const textToAnalyze = truncateText(pdfData.text, MAX_PDF_TEXT_LENGTH)
    
    // Create the prompt
    const prompt = keywordsPrompt(textToAnalyze, payload.maxKeywords)
    const temperature = config.temperature || 0
    
    // Process the structured output request
    const result = await processStructuredOutputRequest(
      prompt,
      responseSchema,
      config,
      temperature
    )
    
    const keywords = result.object.keywords
    const finalResponse = createPdfKeywordsResponse(
      keywords,
      provider,
      model,
      {
        title: pdfData.title,
        author: pdfData.author,
        pages: pdfData.pages,
        extractedTextLength: pdfData.text.length,
      },
      {
        input_tokens: result.usage.promptTokens,
        output_tokens: result.usage.completionTokens,
        total_tokens: result.usage.totalTokens,
      }
    )

    const finalResponseWithVersion = createFinalResponse(finalResponse, apiVersion)

    return c.json(finalResponseWithVersion, 200)
  } catch (error) {
    return handleError(c, error, 'Failed to extract keywords from PDF')
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
            schema: pdfKeywordsRequestSchema
          }
        }
      }
    },
    responses: {
      200: {
        description: 'Returns the extracted keywords from the PDF.',
        content: {
          'application/json': {
            schema: pdfKeywordsResponseSchema
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
        description: 'Bad request - Invalid URL or PDF cannot be processed',
        content: {
          'application/json': {
            schema: z.object({
              error: z.string()
            })
          }
        }
      }
    },
    summary: 'Extract keywords from PDF document',
    description: 'This endpoint receives a PDF URL and uses an LLM to extract keywords from the document\'s content.',
    tags: ['API']
  }),
  handlePdfKeywordsRequest as any
)

export default {
  handler: router,
  mountPath: 'pdf-keywords'
}

