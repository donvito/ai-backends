import { z } from 'zod/v3';
import { llmRequestSchema } from './llm'

/**
 * Body sent by the client.
 */
export const payloadSchema = z.object({
  text: z.string().min(1, 'Text must not be empty'),  
  maxLength: z.number().min(0).optional(),
})

export const summarizeRequestSchema = z.object({
  payload: payloadSchema,
  config: llmRequestSchema
})


/**
 * Successful response returned to the client.
 */
export const summarizeResponseSchema = z.object({
  summary: z.string(),
  provider: z.string().optional().describe('The AI service that was actually used'),
  model: z.string().optional().describe('The model that was actually used'),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
    total_tokens: z.number(),
  })
})

export function createSummarizeResponse(
  summary: string, 
  provider?: string,
  model?: string,
  usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 }
): z.infer<typeof summarizeResponseSchema> {
  return {
    summary,
    provider,
    model,
    usage,
  };
}

export type SummarizeReq = z.infer<typeof summarizeRequestSchema>
export type SummarizeRes = z.infer<typeof summarizeResponseSchema>