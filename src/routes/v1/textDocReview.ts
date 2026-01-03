import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { Context } from 'hono'
import { z } from 'zod'
import { textDocReviewPrompt } from '../../utils/prompts'
import { handleError } from '../../utils/errorHandler'
import { createTextDocReviewResponse, textDocReviewRequestSchema, textDocReviewResponseSchema } from '../../schemas/v1/textDocReview'
import { processStructuredOutputRequest } from '../../services/ai'
import { createFinalResponse } from './finalResponse'
import { apiVersion } from './versionConfig'

// Schema for the AI response
const aiResponseSchema = z.object({
  summary: z.string(),
  overallRisk: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  score: z.number().min(0).max(100).optional(),
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

const router = new OpenAPIHono()

async function handleTextDocReviewRequest(c: Context) {
  try {
    const { payload, config } = await c.req.json()
    const { text, reviewRules, documentType } = payload

    const prompt = textDocReviewPrompt(text, reviewRules, documentType || 'other')

    const result = await processStructuredOutputRequest(
      prompt,
      aiResponseSchema,
      config
    )

    const { summary, overallRisk, score, findings, missingClauses, positiveTerms, negotiationPoints } = result.object
    const { usage } = result

    const finalResponse = createTextDocReviewResponse(
      summary,
      findings,
      overallRisk,
      score,
      missingClauses,
      positiveTerms,
      negotiationPoints,
      config.provider,
      config.model,
      usage
    )

    const finalResponseWithVersion = createFinalResponse(finalResponse, apiVersion)
    return c.json(finalResponseWithVersion, 200)
  } catch (error) {
    return handleError(c, error, 'Failed to review document')
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
            schema: textDocReviewRequestSchema
          }
        }
      }
    },
    responses: {
      200: {
        description: 'Returns document review results with findings, risks, and recommendations.',
        content: {
          'application/json': {
            schema: textDocReviewResponseSchema
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
      }
    },
    summary: 'Review legal documents, contracts, and leases',
    description: 'This endpoint reviews legal documents, contracts, lease agreements, and other legal texts according to custom rules and criteria. Returns structured feedback with red flags, risks, missing clauses, and negotiation points.',
    tags: ['API']
  }),
  handleTextDocReviewRequest as any
)

export default {
  handler: router,
  mountPath: 'text-doc-review'
}
