import { z } from 'zod'
import { llmRequestSchema } from './llm'

/**
 * Schema for JSON schema definition that users can provide
 */
export const jsonSchemaSchema = z.record(z.any()).describe('JSON Schema definition for the synthetic data structure')

/**
 * Payload sent by the client for synthetic data generation endpoint.
 */
export const syntheticDataPayloadSchema = z.object({
  prompt: z.string().min(1, 'Prompt must not be empty').describe('Description of the synthetic data to generate'),
  schema: jsonSchemaSchema.describe('JSON schema that defines the structure of the generated data'),
  count: z.number().min(1).max(100).default(1).describe('Number of synthetic data records to generate (1-100)')
})

/**
 * Request schema for synthetic data generation endpoint.
 */
export const syntheticDataRequestSchema = z.object({
  payload: syntheticDataPayloadSchema,
  config: llmRequestSchema
})

/**
 * Successful response returned to the client.
 */
export const syntheticDataResponseSchema = z.object({
  data: z.any().describe('The generated synthetic data following the provided JSON schema'),
  provider: z.string().optional().describe('The AI service that was actually used'),
  model: z.string().optional().describe('The model that was actually used'),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
    total_tokens: z.number(),
  }).describe('Token usage information'),
  metadata: z.object({
    count: z.number().describe('Number of records generated'),
    validation_passed: z.boolean().describe('Whether the generated data passed schema validation')
  }).describe('Generation metadata')
})

/**
 * Helper function to create synthetic data response
 */
export function createSyntheticDataResponse(
  data: any,
  provider?: string,
  model?: string,
  usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
  metadata = { 
    count: 1, 
    validation_passed: true 
  }
): z.infer<typeof syntheticDataResponseSchema> {
  return {
    data,
    provider,
    model,
    usage,
    metadata,
  }
}

export type SyntheticDataReq = z.infer<typeof syntheticDataRequestSchema>
export type SyntheticDataRes = z.infer<typeof syntheticDataResponseSchema>

