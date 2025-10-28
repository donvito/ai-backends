import { z } from 'zod/v3';
import { llmRequestSchema } from './llm'

/**
 * Body sent by the client.
 */
export const payloadSchema = z.object({
  text: z.string().describe('Text to translate'),
  targetLanguage: z.string().describe('Target language e.g.  "english", "tagalog", "japanese", "korean", "chinese", "french", "spanish"'),
})

export const translateRequestSchema = z.object({
  payload: payloadSchema,
  config: llmRequestSchema
})

/**
 * Successful response returned to the client.
 */
export const translateResponseSchema = z.object({
  translation: z.string(),
  provider: z.string().optional().describe('The AI service that was actually used'),
  model: z.string().optional().describe('The model that was actually used'),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
    total_tokens: z.number(),
  }),
})

export function createTranslateResponse(
  translation: string, 
  provider?: string,
  model?: string,
  usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 }
): z.infer<typeof translateResponseSchema> {
  return {
    translation,
    provider,
    model,
    usage
  };
}