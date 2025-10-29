import { z } from 'zod/v3';

export const supportedOCRServices = ['ollama'] as const;
export const supportedOCROutputFormats = ['plain', 'markdown'] as const;

export const ocrRequestSchema = z.object({
  service: z.enum(supportedOCRServices).default('ollama').describe('The AI service to use for OCR (currently only ollama is supported).'),
  model: z.string().optional().describe('Optional model override to use for OCR processing.'),
  temperature: z.number().min(0).max(1).optional().default(0).describe('Sets the temperature for the OCR model response (defaults to 0).'),
  language: z.string().optional().describe('Optional language hint for the OCR output (defaults to detected language).'),
  format: z.enum(supportedOCROutputFormats).optional().default('plain').describe('Desired output format. Use plain for raw text or markdown to preserve structure.'),
  images: z.array(z.string().min(1)).min(1).describe('Array of base64-encoded image data or data URLs to process. Minimum one image is required.')
});

export const ocrResponseSchema = z.object({
  text: z.string().describe('Extracted text content detected in the image(s).'),
  service: z.enum(supportedOCRServices).describe('Service that processed the OCR request.'),
  model: z.string().describe('Model used to perform OCR.'),
  created_at: z.string().optional().describe('Timestamp from the provider indicating when the OCR response was generated.'),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
    total_tokens: z.number()
  }).optional().describe('Token usage metrics, when provided by the provider.')
});

export const ocrErrorSchema = z.object({
  error: z.string().describe('Error message.'),
  supportedServices: z.array(z.string()).optional().describe('List of services that currently support OCR operations.')
});
