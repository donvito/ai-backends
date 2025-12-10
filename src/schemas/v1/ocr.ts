import { z } from 'zod'

export const ocrRequestSchema = z.object({
  imageUrl: z.string().url().describe('URL of the image to process'),
  prompt: z.string().optional().default('Extract all text from this image. Provide the extracted text in a clear, organized format.').describe('Custom prompt for OCR processing'),
  model: z.enum(['glm-4.6v', 'glm-4.6v-flash']).optional().default('glm-4.6v').describe('The ZAI vision model to use'),
  thinking: z.boolean().optional().default(false).describe('Enable thinking mode for more detailed analysis')
})

export const ocrResponseSchema = z.object({
  text: z.string().describe('Extracted text from the image'),
  model: z.string().describe('The model used for OCR'),
  provider: z.string().describe('The provider used'),
  thinking: z.string().optional().describe('Model thinking process if enabled'),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
    total_tokens: z.number()
  }).optional().describe('Token usage information')
})

export const ocrErrorSchema = z.object({
  error: z.string().describe('Error message'),
  details: z.string().optional().describe('Additional error details')
})
