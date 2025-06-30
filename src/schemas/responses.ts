import { z } from '@hono/zod-openapi'

// Standardized usage schema - matches TokenUsage interface
export const usageSchema = z.object({
  input_tokens: z.number(),
  output_tokens: z.number(),
  total_tokens: z.number()
})

export const errorResponseSchema = z.object({
  error: z.string(),
  statusCode: z.number().optional()
})

export const summaryResponseSchema = z.object({
  summary: z.string(),
  usage: usageSchema
})