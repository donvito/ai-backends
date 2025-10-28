import { z } from 'zod/v3';
import { llmRequestSchema } from './llm'

/**
 * Body sent by the client.
 */
export const payloadSchema = z.object({
  text: z.string().min(1, 'Text must not be empty'),
  maxKeywords: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(1).optional(),
})

export const keywordsRequestSchema = z.object({
  payload: payloadSchema,
  config: llmRequestSchema
})

/**
 * Successful response returned to the client.
 */
export const keywordsResponseSchema = z.object({
  keywords: z.array(z.string()),
  provider: z.string().optional().describe('The AI service that was actually used'),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
    total_tokens: z.number(),
  }),
})

export type KeywordsReq = z.infer<typeof keywordsRequestSchema>
export type KeywordsRes = z.infer<typeof keywordsResponseSchema> 

export function createKeywordsResponse(
  keywords: string[], 
  provider?: string,
  usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 }
): z.infer<typeof keywordsResponseSchema> {
  return {
    keywords,
    provider,
    usage
  };
}