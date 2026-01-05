import { z } from 'zod'
import { llmRequestSchema } from './llm'

/**
 * Body sent by the client for PDF legal document review.
 */
export const pdfLegalDocReviewPayloadSchema = z.object({
  url: z.string().url('URL must be valid').describe('URL of the PDF document to review'),
  reviewRules: z.string().min(1, 'Review rules must not be empty').describe('Custom review instructions, rules, or criteria to apply (e.g., "Check for unfair termination clauses", "Identify hidden fees")'),
  documentType: z.enum(['contract', 'lease', 'legal', 'agreement', 'terms', 'policy', 'other'])
    .optional()
    .default('other')
    .describe('Type of document being reviewed'),
})

export const pdfLegalDocReviewRequestSchema = z.object({
  payload: pdfLegalDocReviewPayloadSchema,
  config: llmRequestSchema
})

/**
 * A single review finding/issue in a legal document
 */
export const pdfLegalDocReviewFindingSchema = z.object({
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
export const pdfLegalDocReviewResponseSchema = z.object({
  summary: z.string().describe('Executive summary of the document review'),
  overallRisk: z.enum(['low', 'medium', 'high', 'critical']).optional().describe('Overall risk assessment of the document'),
  score: z.number().min(0).max(100).optional().describe('Document quality/fairness score (0-100, higher is better for the reviewing party)'),
  findings: z.array(pdfLegalDocReviewFindingSchema).describe('List of specific findings, red flags, and concerns'),
  missingClauses: z.array(z.string()).optional().describe('Important clauses or protections that are missing'),
  positiveTerms: z.array(z.string()).optional().describe('Favorable terms and protections present in the document'),
  negotiationPoints: z.array(z.string()).optional().describe('Key points to negotiate or discuss'),
  provider: z.string().optional().describe('The AI service that was actually used'),
  model: z.string().optional().describe('The model that was actually used'),
  pdfMetadata: z.object({
    title: z.string().optional(),
    author: z.string().optional(),
    pages: z.number().optional(),
    extractedTextLength: z.number().describe('Number of characters extracted from the PDF'),
  }).optional(),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
    total_tokens: z.number(),
  })
})

export function createPdfLegalDocReviewResponse(
  summary: string,
  findings: z.infer<typeof pdfLegalDocReviewFindingSchema>[],
  overallRisk?: 'low' | 'medium' | 'high' | 'critical',
  score?: number,
  missingClauses?: string[],
  positiveTerms?: string[],
  negotiationPoints?: string[],
  provider?: string,
  model?: string,
  pdfMetadata?: {
    title?: string,
    author?: string,
    pages?: number,
    extractedTextLength: number,
  },
  usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 }
): z.infer<typeof pdfLegalDocReviewResponseSchema> {
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
    pdfMetadata,
    usage,
  };
}

export type PdfLegalDocReviewReq = z.infer<typeof pdfLegalDocReviewRequestSchema>
export type PdfLegalDocReviewRes = z.infer<typeof pdfLegalDocReviewResponseSchema>
export type PdfLegalDocReviewFinding = z.infer<typeof pdfLegalDocReviewFindingSchema>
