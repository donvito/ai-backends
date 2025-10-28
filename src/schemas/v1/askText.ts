import { z } from 'zod/v3';
import { llmRequestSchema } from './llm'

/**
 * Payload sent by the client for askText endpoint.
 */
export const askTextPayloadSchema = z.object({
  text: z.string().min(1, 'Text must not be empty').describe('The text context to base the answer on'),
  question: z.string().min(1, 'Question must not be empty').describe('The question to answer based on the text'),
})

/**
 * Request schema for askText endpoint.
 */
export const askTextRequestSchema = z.object({
  payload: askTextPayloadSchema,
  config: llmRequestSchema
})

/**
 * Successful response returned to the client.
 */
export const askTextResponseSchema = z.object({
  answer: z.string().describe('The answer to the question based on the provided text'),
  provider: z.string().optional().describe('The AI service that was actually used'),
  model: z.string().optional().describe('The model that was actually used'),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
    total_tokens: z.number(),
  }).describe('Token usage information')
})

/**
 * Helper function to create askText response
 */
export function createAskTextResponse(
  answer: string,
  provider?: string,
  model?: string,
  usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 }
): z.infer<typeof askTextResponseSchema> {
  return {
    answer,
    provider,
    model,
    usage,
  }
}

export type AskTextReq = z.infer<typeof askTextRequestSchema>
export type AskTextRes = z.infer<typeof askTextResponseSchema>
