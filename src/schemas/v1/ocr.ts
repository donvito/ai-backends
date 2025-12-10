import { z } from 'zod'

export const ocrRequestSchema = z.object({
  imageUrl: z.string().url().describe('URL of the image to extract data from'),
  prompt: z.string().optional().default('Extract all information from this image.').describe('Instructions for what data to extract'),
  jsonSchema: z.record(z.any()).optional().describe('Optional JSON schema to structure the output'),
  model: z.enum(['glm-4.6v', 'glm-4.6v-flash']).optional().default('glm-4.6v').describe('The ZAI vision model to use')
})

export const ocrResponseSchema = z.object({
  rawText: z.string().describe('Raw text response from the model'),
  extractedData: z.record(z.any()).nullable().describe('Parsed JSON data if extraction was successful'),
  parseError: z.string().optional().describe('Error message if JSON parsing failed'),
  model: z.string().describe('The model used'),
  provider: z.string().describe('The provider used'),
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
