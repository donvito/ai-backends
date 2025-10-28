import { z } from 'zod/v3';
import { llmRequestSchema } from './llm'

/**
 * Payload sent by the client for webSearch endpoint.
 */
export const webSearchPayloadSchema = z.object({
  query: z.string().min(1, 'Query must not be empty').describe('The search query'),
  limit: z.number().min(1, 'Limit must be at least 1').max(20, 'Limit must be no more than 20').optional().default(10).describe('Maximum number of results to return (1-20)'),
  sources: z.array(z.string()).optional().default(['web']).describe('The sources to search from')
})

/**
 * Request schema for webSearch endpoint.
 */
export const webSearchRequestSchema = z.object({
  payload: webSearchPayloadSchema,
  config: llmRequestSchema
})

/**
 * Successful response returned to the client.
 */
export const webSearchResponseSchema = z.object({
  searchResult: z.string().describe('A natural language summary of the search results'),
  provider: z.string().optional().describe('The AI service that was actually used'),
  model: z.string().optional().describe('The model that was actually used'),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
    total_tokens: z.number(),
  }).describe('Token usage information')
})

/**
 * Helper function to create webSearch response
 */
export function createWebSearchResponse(
  searchResult: string,
  provider?: string,
  model?: string,
  usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 }
): z.infer<typeof webSearchResponseSchema> {
  return {
    searchResult,
    provider,
    model,
    usage,
  }
}

export type WebSearchReq = z.infer<typeof webSearchRequestSchema>
export type WebSearchRes = z.infer<typeof webSearchResponseSchema>