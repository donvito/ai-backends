import { z } from 'zod/v3';
import { llmRequestSchema } from './llm'

/**
 * Body sent by the client for outline generation.
 */
export const payloadSchema = z.object({
  text: z.string().min(1, 'Text must not be empty'),
  maxDepth: z.number().min(1).max(5).optional().describe('Maximum depth of outline levels (default: 3)'),
  style: z.enum(['numbered', 'bulleted', 'mixed']).optional().describe('Outline style (default: numbered)'),
  includeIntro: z.boolean().optional().describe('Include an introduction paragraph (default: false)'),
  includeConclusion: z.boolean().optional().describe('Include a conclusion paragraph (default: false)'),
})

export const outlineRequestSchema = z.object({
  payload: payloadSchema,
  config: llmRequestSchema
})

/**
 * Successful response returned to the client.
 */
export const outlineResponseSchema = z.object({
  outline: z.string().describe('The generated outline in markdown format'),
  provider: z.string().optional().describe('The AI service that was actually used'),
  model: z.string().optional().describe('The model that was actually used'),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
    total_tokens: z.number(),
  })
})

export function createOutlineResponse(
  outline: string,
  provider?: string,
  model?: string,
  usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 }
): z.infer<typeof outlineResponseSchema> {
  return {
    outline,
    provider,
    model,
    usage,
  };
}

export type OutlineReq = z.infer<typeof outlineRequestSchema>
export type OutlineRes = z.infer<typeof outlineResponseSchema>

