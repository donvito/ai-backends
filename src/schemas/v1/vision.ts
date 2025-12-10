import { z } from 'zod'
import { llmRequestSchema } from './llm'

/**
 * Vision payload schema - endpoint-specific parameters
 */
export const visionPayloadSchema = z.object({
  imageUrl: z.string().url().describe('URL of the image to analyze'),
  prompt: z.string().describe('Question or prompt about the image'),
  thinking: z.boolean().optional().default(false).describe('Enable thinking mode for more detailed analysis')
})

/**
 * Vision request schema following the standard payload/config pattern
 */
export const visionRequestSchema = z.object({
  payload: visionPayloadSchema,
  config: llmRequestSchema
})

export const visionResponseSchema = z.object({
  text: z.string().describe('Response from the vision model'),
  thinking: z.string().optional().describe('Model thinking process if enabled'),
  model: z.string().describe('The model used'),
  provider: z.string().describe('The provider used'),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
    total_tokens: z.number()
  }).optional().describe('Token usage information')
})

export const visionErrorSchema = z.object({
  error: z.string().describe('Error message'),
  details: z.string().optional().describe('Additional error details')
})

export type VisionRequest = z.infer<typeof visionRequestSchema>
export type VisionResponse = z.infer<typeof visionResponseSchema>
