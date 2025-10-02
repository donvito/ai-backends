import { z } from 'zod'
import { llmRequestSchema } from './llm'

/**
 * Body sent by the client.
 */
export const payloadSchema = z.object({
  url: z.string().url('URL must be valid'),
  targetLanguage: z.string().describe('Target language e.g. "english", "tagalog", "japanese", "korean", "chinese", "french", "spanish"'),
})

export const pdfTranslateRequestSchema = z.object({
  payload: payloadSchema,
  config: llmRequestSchema
})

/**
 * Successful response returned to the client.
 */
export const pdfTranslateResponseSchema = z.object({
  translation: z.string(),
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

export function createPdfTranslateResponse(
  translation: string, 
  provider?: string,
  model?: string,
  pdfMetadata?: {
    title?: string,
    author?: string,
    pages?: number,
    extractedTextLength: number,
  },
  usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 }
): z.infer<typeof pdfTranslateResponseSchema> {
  return {
    translation,
    provider,
    model,
    pdfMetadata,
    usage,
  };
}

export type PdfTranslateReq = z.infer<typeof pdfTranslateRequestSchema>
export type PdfTranslateRes = z.infer<typeof pdfTranslateResponseSchema>
