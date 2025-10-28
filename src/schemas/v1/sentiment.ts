import { z } from 'zod/v3';
import { llmRequestSchema } from './llm';

export const payloadSchema = z.object({
  text: z.string().min(1, 'Text must not be empty').max(10000, 'Text must not exceed 10,000 characters'),
  categories: z.array(z.string()).optional(),  
})

export const sentimentRequestSchema = z.object({
  payload: payloadSchema,
  config: llmRequestSchema
})

/**
 * Sentiment response schema
 */
export const sentimentResponseSchema = z.object({
  sentiment: z.string(),
  confidence: z.number().min(0).max(1),
  emotions: z.array(
    z.object({
      emotion: z.string(),
      score: z.number(),
    })
  ),
  provider: z.string().describe('The AI service that was actually used'),
  model: z.string().describe('The model that was actually used'),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
    total_tokens: z.number(),
  }),
});

export function createSentimentResponse(
  sentiment: string,
  confidence: number,
  emotions: { emotion: string; score: number }[],
  provider: string,
  model: string,
  usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 }
): z.infer<typeof sentimentResponseSchema> {
  return {
    sentiment,
    confidence,
    emotions,
    provider,
    model,
    usage
  };
}

export type SentimentReq = z.infer<typeof sentimentRequestSchema>;
export type SentimentRes = z.infer<typeof sentimentResponseSchema>;

