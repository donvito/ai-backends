import { z } from 'zod'

export const visionProvidersEnum = z.enum(['anthropic', 'openai', 'openrouter', 'google'])
  .describe('Vision-capable AI provider')

export const understandImagePayloadSchema = z.object({
  imageUrl: z.string().min(1, 'Image URL must not be empty').describe(
    'URL of the image to analyze (https://...) or a base64 data URL (data:image/jpeg;base64,...)'
  ),
  question: z.string().min(1, 'Question must not be empty').describe(
    'Question to ask about the image'
  ),
})

export const understandImageConfigSchema = z.object({
  provider: visionProvidersEnum,
  model: z.string().describe('Model to use (must support vision/image input)'),
  temperature: z.number().optional().default(0),
})

export const understandImageRequestSchema = z.object({
  payload: understandImagePayloadSchema,
  config: understandImageConfigSchema,
})

export const understandImageResponseSchema = z.object({
  answer: z.string().describe('The answer to the question about the image'),
  provider: z.string().optional().describe('The AI provider that was used'),
  model: z.string().optional().describe('The model that was used'),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
    total_tokens: z.number(),
  }).describe('Token usage information'),
})

export const understandImageErrorSchema = z.object({
  error: z.string().describe('Error message'),
})

export function createUnderstandImageResponse(
  answer: string,
  provider?: string,
  model?: string,
  usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 }
): z.infer<typeof understandImageResponseSchema> {
  return { answer, provider, model, usage }
}

export type UnderstandImageReq = z.infer<typeof understandImageRequestSchema>
export type UnderstandImageRes = z.infer<typeof understandImageResponseSchema>
