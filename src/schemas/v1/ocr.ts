import { z } from 'zod/v3';
import { llmRequestSchema } from './llm'

/**
 * Body sent by the client for OCR request.
 */
export const ocrPayloadSchema = z.object({
  images: z.array(z.string()).min(1, 'At least one image is required').describe('Array of base64 encoded images for OCR'),
  language: z.string().optional().default('auto').describe('Language hint for OCR (e.g., "en", "es", "fr", "auto" for auto-detection)'),
  extractStructuredData: z.boolean().optional().default(false).describe('Whether to extract structured data (JSON) from the image'),
})

export const ocrRequestSchema = z.object({
  payload: ocrPayloadSchema,
  config: llmRequestSchema
})

/**
 * Successful response returned to the client.
 */
export const ocrResponseSchema = z.object({
  text: z.string().describe('The extracted text from the image'),
  confidence: z.number().optional().describe('Confidence score of the OCR extraction (0-1)'),
  structuredData: z.record(z.any()).optional().describe('Extracted structured data if extractStructuredData was true'),
  language: z.string().optional().describe('Detected language of the text'),
  provider: z.string().optional().describe('The AI service that was actually used'),
  model: z.string().optional().describe('The model that was actually used'),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
    total_tokens: z.number(),
  }).optional()
})

export const ocrErrorSchema = z.object({
  error: z.string().describe('Error message'),
  supportedModels: z.object({
    ollama: z.array(z.string()).optional().describe('Available Ollama vision models')
  }).optional().describe('List of supported models by service')
})

export function createOcrResponse(
  text: string,
  provider?: string,
  model?: string,
  confidence?: number,
  language?: string,
  structuredData?: Record<string, any>,
  usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 }
): z.infer<typeof ocrResponseSchema> {
  return {
    text,
    provider,
    model,
    confidence,
    language,
    structuredData,
    usage,
  };
}

export type OcrReq = z.infer<typeof ocrRequestSchema>
export type OcrRes = z.infer<typeof ocrResponseSchema>
