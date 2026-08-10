import { z } from 'zod'
import { DEFAULT_MAX_TURNS, MAX_TURNS_LIMIT } from '../../services/pi-agent'

/**
 * Providers supported by the Agents API. Agents need tool-calling support,
 * so only OpenRouter and the official OpenAI API are enabled for now.
 */
export const agentProviderSchema = z.enum(['openrouter', 'openai'])

/**
 * Scenario key selecting the agent's toolset and default system prompt.
 * Built-in: general, customer-support, real-estate. Custom agents created via
 * the Admin API are addressed by their key as well.
 */
export const agentScenarioSchema = z.string().min(1)

export const agentPayloadSchema = z.object({
  task: z.string().min(1, 'Task must not be empty').describe('The task for the agent to complete'),
  scenario: agentScenarioSchema
    .optional()
    .default('general')
    .describe(
      'Scenario selecting the toolset and default system prompt: general, customer-support, real-estate, or the key of a custom agent'
    ),
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

export const agentChatPayloadSchema = z.object({
  message: z.string().min(1, 'Message must not be empty').describe('The user message to send to the agent'),
  sessionId: z
    .string()
    .optional()
    .describe('Existing chat session id. Omit to start a new session; the response returns the id to reuse.'),
  scenario: agentScenarioSchema
    .optional()
    .default('general')
    .describe('Scenario for a NEW session (ignored when sessionId is provided)'),
  systemPrompt: z.string().optional().describe('Optional system prompt override for a NEW session'),
  maxTurns: z
    .number()
    .int()
    .min(1)
    .max(MAX_TURNS_LIMIT)
    .optional()
    .default(DEFAULT_MAX_TURNS)
    .describe(`Maximum agent turns (LLM calls) for this message. Defaults to ${DEFAULT_MAX_TURNS}.`),
})

export const agentChatRequestSchema = z.object({
  payload: agentChatPayloadSchema,
  config: agentConfigSchema,
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
  builtIn: z.boolean(),
})

export const agentScenariosResponseSchema = z.object({
  scenarios: z.array(agentScenarioInfoSchema),
})

export const agentChatResponseSchema = z.object({
  sessionId: z.string().describe('Chat session id. Send it with the next message to continue the conversation.'),
  scenario: agentScenarioSchema,
  reply: z.string().describe('Assistant reply to the user message'),
  steps: z.array(agentStepSchema).describe('Tool calls executed while answering this message'),
  turns: z.number().describe('Agent turns (LLM calls) used for this message'),
  provider: z.string().optional(),
  model: z.string().optional(),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
    total_tokens: z.number(),
  }),
})

export const agentTranscriptEntrySchema = z.object({
  role: z.enum(['user', 'assistant', 'tool']),
  text: z.string(),
  toolName: z.string().optional(),
  isError: z.boolean().optional(),
})

export const agentSessionResponseSchema = z.object({
  sessionId: z.string(),
  provider: z.string(),
  model: z.string(),
  scenario: agentScenarioSchema,
  createdAt: z.string(),
  lastActivityAt: z.string(),
  messages: z.array(agentTranscriptEntrySchema),
})

export const agentSessionDeleteResponseSchema = z.object({
  deleted: z.boolean(),
  sessionId: z.string(),
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
