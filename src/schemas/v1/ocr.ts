import { z } from 'zod/v3';

const supportedServices = ['ollama', 'openai', 'anthropic', 'google', 'openrouter', 'aigateway'] as const

export const ocrRequestSchema = z.object({
  service: z.enum(supportedServices).describe('The AI service to use for OCR (ollama, openai, anthropic, google, openrouter, or aigateway)'),
  model: z.string().describe('The model to use for OCR extraction'),
  temperature: z.number().optional().default(0).describe('The temperature of the response'),
  stream: z.boolean().optional().default(false).describe('Whether to stream the response'),
  images: z.array(z.string()).describe('Array of base64 encoded images containing text to extract')
})

export const ocrResponseSchema = z.object({
  model: z.string().describe('The model used for OCR extraction'),
  created_at: z.string().describe('ISO timestamp of when the response was created'),
  text: z.string().describe('The extracted text from the images'),
  message: z.object({
    role: z.string().describe('The role of the response'),
    content: z.string().describe('The extracted text content')
  }),
  done_reason: z.string().describe('Reason why generation stopped'),
  done: z.boolean().describe('Whether the generation is complete'),
  total_duration: z.number().optional().describe('Total duration in nanoseconds'),
  load_duration: z.number().optional().describe('Model load duration in nanoseconds'),
  prompt_eval_count: z.number().optional().describe('Number of tokens in the prompt'),
  prompt_eval_duration: z.number().optional().describe('Prompt evaluation duration in nanoseconds'),
  eval_count: z.number().optional().describe('Number of tokens in the response'),
  eval_duration: z.number().optional().describe('Response generation duration in nanoseconds'),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
    total_tokens: z.number(),
  }).optional().describe('Token usage information'),
  service: z.string().optional().describe('The AI service that was actually used')
})

export const ocrErrorSchema = z.object({
  error: z.string().describe('Error message'),
  supportedModels: z.record(z.string(), z.array(z.string())).optional().describe('List of supported models by service')
})
