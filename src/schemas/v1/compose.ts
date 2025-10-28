import { z } from 'zod/v3';
import { llmRequestSchema } from './llm'

/**
 * Body sent by the client for compose endpoint
 */
export const payloadSchema = z.object({
  topic: z.string().min(1, 'Topic must not be empty'),
  maxLength: z.number().min(0).optional(),
})

export const composeRequestSchema = z.object({
  payload: payloadSchema,
  config: llmRequestSchema
})

/**
 * Successful response returned to the client for compose endpoint
 */
export const composeResponseSchema = z.object({
  text: z.string(),
  provider: z.string().optional().describe('The AI service that was actually used'),
  model: z.string().optional().describe('The model that was actually used'),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
    total_tokens: z.number(),
  })
})

export function createComposeResponse(
  text: string,
  provider?: string,
  model?: string,
  usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 }
): z.infer<typeof composeResponseSchema> {
  return {
    text,
    provider,
    model,
    usage,
  }
}

export type ComposeReq = z.infer<typeof composeRequestSchema>
export type ComposeRes = z.infer<typeof composeResponseSchema>
