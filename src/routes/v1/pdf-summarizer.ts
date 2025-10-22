import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { Context } from 'hono'
import { pdfSummarizePrompt } from '../../utils/prompts'
import { handleError } from '../../utils/errorHandler'
import { pdfSummarizerRequestSchema, pdfSummarizerResponseSchema, createPdfSummarizerResponse } from '../../schemas/v1/pdf-summarizer'
import { processTextOutputRequest } from '../../services/ai'
import { apiVersion } from './versionConfig'
import { createFinalResponse } from './finalResponse'
import { extractPDF, truncateText } from '../../utils/pdfExtractor'
import { handleStreamingWithPdfMetadata} from "../../utils/streamingHandler";

const router = new OpenAPIHono()

// Maximum text length to send to the LLM (to avoid token limits)
const MAX_PDF_TEXT_LENGTH = 50000

async function handlePdfSummarizerRequest(c: Context) {
  try {
    const { payload, config } = await c.req.json()
    const provider = config.provider
    const model = config.model
    const isStreaming = config.stream || false
    
    // Extract PDF content
    const pdfData = await extractPDF(payload.url)
    
    if (!pdfData.text || pdfData.text.length === 0) {
      throw new Error('No text content found in the PDF')
    }
    
    // Truncate text if it's too long
    const textToSummarize = truncateText(pdfData.text, MAX_PDF_TEXT_LENGTH)
    
    // Create the prompt
    const prompt = pdfSummarizePrompt(textToSummarize, payload.maxLength)
    
    // Handle streaming response
    if (isStreaming) {
      const result = await processTextOutputRequest(prompt, config)
        return handleStreamingWithPdfMetadata(c, result, provider, model, apiVersion, pdfData)
    }
    
    // Handle non-streaming response
    const result = await processTextOutputRequest(prompt, config)
    const finalResponse = createPdfSummarizerResponse(
      result.text, 
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
    return handleError(c, error, 'Failed to summarize PDF')
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
            schema: pdfSummarizerRequestSchema
          }
        }
      }
    },
    responses: {
      200: {
        description: 'Returns the summarized PDF content.',
        content: {
          'application/json': {
            schema: pdfSummarizerResponseSchema
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
    summary: 'Summarize PDF document',
    description: 'This endpoint receives a PDF URL and uses an LLM to summarize the document\'s content.',
    tags: ['API']
  }),
  handlePdfSummarizerRequest as any
)

export default {
  handler: router,
  mountPath: 'pdf-summarizer'
}

