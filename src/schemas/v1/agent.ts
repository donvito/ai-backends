import { z } from 'zod'
import { DEFAULT_MAX_TURNS, MAX_TURNS_LIMIT } from '../../services/pi-agent'

/**
 * Providers supported by the Agents API. Agents need tool-calling support,
 * so only OpenRouter and the official OpenAI API are enabled for now.
 */
export const agentProviderSchema = z.enum(['openrouter', 'openai'])

/**
 * Demo scenarios that select the agent's toolset and default system prompt.
 */
export const agentScenarioSchema = z.enum(['general', 'customer-support', 'real-estate'])

export const agentPayloadSchema = z.object({
  task: z.string().min(1, 'Task must not be empty').describe('The task for the agent to complete'),
  scenario: agentScenarioSchema
    .optional()
    .default('general')
    .describe('Scenario selecting the toolset and default system prompt (general, customer-support, real-estate)'),
  systemPrompt: z.string().optional().describe('Optional system prompt override for the agent'),
  maxTurns: z
    .number()
    .int()
    .min(1)
    .max(MAX_TURNS_LIMIT)
    .optional()
    .default(DEFAULT_MAX_TURNS)
    .describe(`Maximum number of agent turns (LLM calls) before stopping. Defaults to ${DEFAULT_MAX_TURNS}.`),
})

export const agentConfigSchema = z.object({
  provider: agentProviderSchema.describe('AI provider to use for the agent (must support tool calling)'),
  model: z.string().min(1).describe('Specific model to use, e.g. deepseek/deepseek-v4-flash'),
  stream: z.boolean().optional().default(false).describe('Stream agent events over SSE'),
})

export const agentRequestSchema = z.object({
  payload: agentPayloadSchema,
  config: agentConfigSchema,
})

export const agentStepSchema = z.object({
  toolCallId: z.string(),
  toolName: z.string(),
  args: z.unknown().describe('Arguments the model passed to the tool'),
  result: z.string().describe('Text result returned by the tool'),
  isError: z.boolean(),
})

export const agentResponseSchema = z.object({
  result: z.string().describe('Final answer produced by the agent'),
  steps: z.array(agentStepSchema).describe('Tool calls executed during the run'),
  turns: z.number().describe('Number of agent turns (LLM calls) used'),
  provider: z.string().optional().describe('The AI service that was actually used'),
  model: z.string().optional().describe('The model that was actually used'),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
    total_tokens: z.number(),
  }),
})

export const agentToolInfoSchema = z.object({
  name: z.string(),
  label: z.string(),
  description: z.string(),
})

export const agentToolsResponseSchema = z.object({
  tools: z.array(agentToolInfoSchema),
})

export const agentScenarioInfoSchema = z.object({
  key: agentScenarioSchema,
  label: z.string(),
  description: z.string(),
  sampleTasks: z.array(z.string()),
  tools: z.array(agentToolInfoSchema),
})

export const agentScenariosResponseSchema = z.object({
  scenarios: z.array(agentScenarioInfoSchema),
})

export function createAgentResponse(
  result: string,
  steps: z.infer<typeof agentStepSchema>[],
  turns: number,
  provider?: string,
  model?: string,
  usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 }
): z.infer<typeof agentResponseSchema> {
  return {
    result,
    steps,
    turns,
    provider,
    model,
    usage,
  }
}

export type AgentReq = z.infer<typeof agentRequestSchema>
export type AgentRes = z.infer<typeof agentResponseSchema>
