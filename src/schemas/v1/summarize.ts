import { z } from 'zod'
import { llmRequestSchema } from './llm'

/**
 * Body sent by the client.
 */
export const payloadSchema = z.object({
  text: z.string().min(1, 'Text must not be empty'),  
  maxLength: z.number().min(0).optional(),
})

// Enhanced request schema that includes useAgent
export const enhancedLlmRequestSchema = llmRequestSchema.extend({
  useAgent: z.boolean().optional().default(false)
})

export const summarizeRequestSchema = z.object({
  payload: payloadSchema,
  config: enhancedLlmRequestSchema
})

/**
 * Standard response schema
 */
export const standardSummarizeResponseSchema = z.object({
  summary: z.string(),
  provider: z.string().optional().describe('The AI service that was actually used'),
  model: z.string().optional().describe('The model that was actually used'),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
    total_tokens: z.number(),
  })
})

/**
 * Agent-enhanced response schema
 */
export const agentSummarizeResponseSchema = z.object({
  summary: z.string(),
  analysis: z.object({
    documentType: z.string(),
    complexity: z.string(),
    keyThemes: z.array(z.string()),
    sentiment: z.object({
      overall: z.string(),
      confidence: z.number(),
      emotions: z.array(z.string())
    }),
    keywords: z.array(z.string())
  }).optional(),
  insights: z.array(z.string()).optional(),
  actionItems: z.array(z.string()).optional(),
  provider: z.string().optional().describe('The AI service that was actually used'),
  model: z.string().optional().describe('The model that was actually used'),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
    total_tokens: z.number(),
  })
})

/**
 * Union response schema that can handle both standard and agent responses
 */
export const summarizeResponseSchema = z.union([
  standardSummarizeResponseSchema,
  agentSummarizeResponseSchema
])

export function createSummarizeResponse(
  summary: string, 
  provider?: string,
  model?: string,
  usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 }
): z.infer<typeof standardSummarizeResponseSchema> {
  return {
    summary,
    provider,
    model,
    usage,
  };
}

export function createAgentSummarizeResponse(
  summary: string,
  analysis: any,
  insights: string[],
  actionItems: string[],
  provider?: string,
  model?: string,
  usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 }
): z.infer<typeof agentSummarizeResponseSchema> {
  return {
    summary,
    analysis,
    insights,
    actionItems,
    provider,
    model,
    usage,
  };
}

export type SummarizeReq = z.infer<typeof summarizeRequestSchema>
export type SummarizeRes = z.infer<typeof summarizeResponseSchema>
export type StandardSummarizeRes = z.infer<typeof standardSummarizeResponseSchema>
export type AgentSummarizeRes = z.infer<typeof agentSummarizeResponseSchema>
