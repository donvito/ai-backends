import { z } from 'zod'
import { llmRequestSchema } from './llm'

/**
 * Body sent by the client for legal document review.
 */
export const textDocReviewPayloadSchema = z.object({
  text: z.string().min(1, 'Document text must not be empty').describe('The legal document, contract, or lease agreement text to review'),
  reviewRules: z.string().min(1, 'Review rules must not be empty').describe('Custom review instructions, rules, or criteria to apply (e.g., "Check for unfair termination clauses", "Identify hidden fees")'),
  documentType: z.enum(['contract', 'lease', 'legal', 'agreement', 'terms', 'policy', 'other'])
    .optional()
    .default('other')
    .describe('Type of document being reviewed'),
})

export const textDocReviewRequestSchema = z.object({
  payload: textDocReviewPayloadSchema,
  config: llmRequestSchema
})

/**
 * A single review finding/issue in a legal document
 */
export const textDocReviewFindingSchema = z.object({
  category: z.string().describe('Category of the finding (e.g., Red Flag, Risk, Unfavorable Term, Missing Clause, Ambiguity, Compliance)'),
  severity: z.enum(['low', 'medium', 'high', 'critical']).describe('Severity level: critical for deal-breakers, high for significant risks, medium for concerns, low for minor issues'),
  clause: z.string().optional().describe('The relevant clause or section text'),
  issue: z.string().describe('Description of the issue or concern'),
  recommendation: z.string().describe('Recommended action or suggested revision'),
  legalImplication: z.string().optional().describe('Potential legal or financial implications if not addressed'),
})

/**
 * Successful response returned to the client.
 */
export const textDocReviewResponseSchema = z.object({
  summary: z.string().describe('Executive summary of the document review'),
  overallRisk: z.enum(['low', 'medium', 'high', 'critical']).optional().describe('Overall risk assessment of the document'),
  score: z.number().min(0).max(100).optional().describe('Document quality/fairness score (0-100, higher is better for the reviewing party)'),
  findings: z.array(textDocReviewFindingSchema).describe('List of specific findings, red flags, and concerns'),
  missingClauses: z.array(z.string()).optional().describe('Important clauses or protections that are missing'),
  positiveTerms: z.array(z.string()).optional().describe('Favorable terms and protections present in the document'),
  negotiationPoints: z.array(z.string()).optional().describe('Key points to negotiate or discuss'),
  provider: z.string().optional().describe('The AI service that was actually used'),
  model: z.string().optional().describe('The model that was actually used'),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
    total_tokens: z.number(),
  })
})

export function createTextDocReviewResponse(
  summary: string,
  findings: z.infer<typeof textDocReviewFindingSchema>[],
  overallRisk?: 'low' | 'medium' | 'high' | 'critical',
  score?: number,
  missingClauses?: string[],
  positiveTerms?: string[],
  negotiationPoints?: string[],
  provider?: string,
  model?: string,
  usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 }
): z.infer<typeof textDocReviewResponseSchema> {
  return {
    summary,
    overallRisk,
    score,
    findings,
    missingClauses,
    positiveTerms,
    negotiationPoints,
    provider,
    model,
    usage,
  };
}

export type TextDocReviewReq = z.infer<typeof textDocReviewRequestSchema>
export type TextDocReviewRes = z.infer<typeof textDocReviewResponseSchema>
export type TextDocReviewFinding = z.infer<typeof textDocReviewFindingSchema>
