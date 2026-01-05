import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { Context } from 'hono'
import { textDocReviewPrompt } from '../../utils/prompts'
import { handleError } from '../../utils/errorHandler'
import { pdfLegalDocReviewRequestSchema, pdfLegalDocReviewResponseSchema, createPdfLegalDocReviewResponse } from '../../schemas/v1/pdfLegalDocReview'
import { processStructuredOutputRequest } from '../../services/ai'
import { apiVersion } from './versionConfig'
import { createFinalResponse } from './finalResponse'
import { extractPDF, truncateText } from '../../utils/pdfExtractor'

const router = new OpenAPIHono()

// Maximum text length to send to the LLM (to avoid token limits)
const MAX_PDF_TEXT_LENGTH = 50000

// Schema for the AI response
const aiResponseSchema = z.object({
  summary: z.string(),
  overallRisk: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  score: z.coerce.number().min(0).max(100).optional(),
  findings: z.array(z.object({
    category: z.string(),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    clause: z.string().optional(),
    issue: z.string(),
    recommendation: z.string(),
    legalImplication: z.string().optional()
  })),
  missingClauses: z.array(z.string()).optional(),
  positiveTerms: z.array(z.string()).optional(),
  negotiationPoints: z.array(z.string()).optional()
})

async function handlePdfLegalDocReviewRequest(c: Context) {
  try {
    const { payload, config } = await c.req.json()
    const provider = config.provider
    const model = config.model
    const { url, reviewRules, documentType } = payload

    // Extract PDF content
    const pdfData = await extractPDF(url)

    if (!pdfData.text || pdfData.text.length === 0) {
      throw new Error('No text content found in the PDF')
    }

    // Truncate text if it's too long
    const textToReview = truncateText(pdfData.text, MAX_PDF_TEXT_LENGTH)

    // Create the prompt
    const prompt = textDocReviewPrompt(textToReview, reviewRules, documentType || 'other')

    // Process the request
    const result = await processStructuredOutputRequest(
      prompt,
      aiResponseSchema,
      config,
      config.temperature ?? 0
    )

    const { summary, overallRisk, score, findings, missingClauses, positiveTerms, negotiationPoints } = result.object
    const { usage } = result

    const finalResponse = createPdfLegalDocReviewResponse(
      summary,
      findings,
      overallRisk,
      score,
      missingClauses,
      positiveTerms,
      negotiationPoints,
      provider,
      model,
      {
        title: pdfData.title,
        author: pdfData.author,
        pages: pdfData.pages,
        extractedTextLength: pdfData.text.length,
      },
      {
        input_tokens: usage.promptTokens,
        output_tokens: usage.completionTokens,
        total_tokens: usage.totalTokens,
      }
    )

    const finalResponseWithVersion = createFinalResponse(finalResponse, apiVersion)

    return c.json(finalResponseWithVersion, 200)
  } catch (error) {
    return handleError(c, error, 'Failed to review PDF document')
  }
}

router.openapi(
  createRoute({
    path: '/',
    method: 'post',
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: {
          'application/json': {
            schema: pdfLegalDocReviewRequestSchema
          }
        }
      }
    },
    responses: {
      200: {
        description: 'Returns the reviewed PDF document with findings, risks, and recommendations.',
        content: {
          'application/json': {
            schema: pdfLegalDocReviewResponseSchema
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
    summary: 'Review PDF legal documents, contracts, and leases',
    description: 'This endpoint receives a PDF URL containing a legal document, contract, lease agreement, or other legal text and reviews it according to custom rules and criteria. Returns structured feedback with red flags, risks, missing clauses, and negotiation points.',
    tags: ['API']
  }),
  handlePdfLegalDocReviewRequest as any
)

export default {
  handler: router,
  mountPath: 'pdf-legal-doc-review'
}
