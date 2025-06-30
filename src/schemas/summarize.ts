import { z } from 'zod'
import { usageSchema } from './responses'

/**
 * Body sent by the client.
 */
export const summarizeRequestSchema = z.object({
  text: z.string().min(1, 'Text must not be empty'),
  maxLength: z.number().int().positive().optional(),
})

/**
 * Successful response returned to the client.
 */
export const summarizeResponseSchema = z.object({
  summary: z.string(),
  usage: usageSchema,
})

export type SummarizeReq = z.infer<typeof summarizeRequestSchema>
export type SummarizeRes = z.infer<typeof summarizeResponseSchema>