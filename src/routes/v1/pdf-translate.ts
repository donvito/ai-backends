import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { pdfTranslatePrompt } from '../../utils/prompts'
import { handleError } from '../../utils/errorHandler'
import { pdfTranslateRequestSchema, pdfTranslateResponseSchema, createPdfTranslateResponse } from '../../schemas/v1/pdf-translate'
import { processTextOutputRequest } from '../../services/ai'
import { apiVersion } from './versionConfig'
import { createFinalResponse } from './finalResponse'
import { writeTextStreamSSE } from './streamUtils'
import { extractPDF, truncateText } from '../../utils/pdfExtractor'

const router = new OpenAPIHono()

// Maximum text length to send to the LLM (to avoid token limits)
const MAX_PDF_TEXT_LENGTH = 50000

async function handlePdfTranslateRequest(c: Context) {
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
    const textToTranslate = truncateText(pdfData.text, MAX_PDF_TEXT_LENGTH)
    
    // Create the prompt
    const prompt = pdfTranslatePrompt(textToTranslate, payload.targetLanguage)
    
    // Handle streaming response
    if (isStreaming) {
      const result = await processTextOutputRequest(prompt, config)
      
      // Set SSE headers
      c.header('Content-Type', 'text/event-stream')
      c.header('Cache-Control', 'no-cache')
      c.header('Connection', 'keep-alive')
      
      return streamSSE(c, async (stream) => {
        try {
          await writeTextStreamSSE(
            stream,
            result,
            { 
              provider, 
              model, 
              version: apiVersion
            },
            {
              extraDone: {
                pdfMetadata: {
                  title: pdfData.title,
                  author: pdfData.author,
                  pages: pdfData.pages,
                  extractedTextLength: pdfData.text.length,
                }
              }
            }
          )
        } catch (error) {
          console.error('Streaming error:', error)
          try {
            await stream.writeSSE({
              data: JSON.stringify({
                error: error instanceof Error ? error.message : 'Streaming error',
                done: true
              })
            })
          } catch (writeError) {
            console.error('Error writing error message to stream:', writeError)
          }
        } finally {
          try {
            await stream.close()
          } catch (closeError) {
            console.error('Error closing stream:', closeError)
          }
        }
      })
    }
    
    // Handle non-streaming response
    const result = await processTextOutputRequest(prompt, config)
    const finalResponse = createPdfTranslateResponse(
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
    return handleError(c, error, 'Failed to translate PDF')
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
            schema: pdfTranslateRequestSchema
          }
        }
      }
    },
    responses: {
      200: {
        description: 'Returns the translated PDF content.',
        content: {
          'application/json': {
            schema: pdfTranslateResponseSchema
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
    summary: 'Translate PDF document',
    description: 'This endpoint receives a PDF URL and uses an LLM to translate the document\'s content to the target language.',
    tags: ['API']
  }),
  handlePdfTranslateRequest as any
)

export default {
  handler: router,
  mountPath: 'pdf-translate'
}
