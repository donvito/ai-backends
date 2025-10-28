import { z } from 'zod/v3';
import { llmRequestSchema } from './llm'

/**
 * Request schema for the planner endpoint
 */
export const plannerRequestSchema = z.object({
  payload: z.object({
    task: z.string().describe('The task or goal to create a plan for'),
    context: z.string().optional().describe('Additional context or constraints for the plan'),
    maxSteps: z.number().optional().default(10).describe('Maximum number of steps to include'),
    detailLevel: z.enum(['basic', 'detailed', 'comprehensive']).optional().default('detailed').describe('Level of detail for the plan'),
    includeTimeEstimates: z.boolean().optional().default(true).describe('Whether to include time estimates'),
    includeRisks: z.boolean().optional().default(true).describe('Whether to identify potential risks'),
    domain: z.string().optional().describe('Domain or field of the task (e.g., "software development", "project management")')
  }),
  config: llmRequestSchema
})

/**
 * Response schema for the planner endpoint
 */
export const plannerResponseSchema = z.object({
  plan: z.string().describe('The generated plan as formatted text'),
  metadata: z.object({
    generatedAt: z.string().describe('ISO timestamp of when the plan was generated'),
    provider: z.string().describe('AI provider used'),
    model: z.string().describe('Model used for generation'),
    processingTime: z.number().optional().describe('Time taken to generate plan in milliseconds')
  }),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
    total_tokens: z.number()
  }).optional(),
  apiVersion: z.string().optional()
})

/**
 * Helper function to create a planner response
 */
export function createPlannerResponse(
  plan: string,
  provider: string,
  model: string,
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  },
  processingTime?: number
): z.infer<typeof plannerResponseSchema> {
  return {
    plan,
    metadata: {
      generatedAt: new Date().toISOString(),
      provider,
      model,
      processingTime
    },
    usage
  }
}

// Export type definitions
export type PlannerRequest = z.infer<typeof plannerRequestSchema>
export type PlannerResponse = z.infer<typeof plannerResponseSchema>
