import { z } from 'zod'
import { agentToolInfoSchema } from './agent'

/**
 * Schemas for the Admin API: custom agents, custom (HTTP) tools, and
 * provider API keys.
 */

const slugSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z][a-z0-9-]*$/, 'Must be a lowercase slug (letters, numbers, dashes), e.g. "travel-planner"')

/** JSON Schema for tool arguments. Only object schemas are supported. */
export const toolParametersSchema = z.object({
  type: z.literal('object'),
  properties: z.record(z.any()).default({}),
  required: z.array(z.string()).optional(),
})

export const customToolSchema = z.object({
  name: slugSchema.describe('Unique tool name the model calls, e.g. "get-exchange-rate"'),
  label: z.string().min(1).max(100).describe('Human-readable label shown in UIs'),
  description: z.string().min(1).max(1000).describe('Tells the model what the tool does and when to use it'),
  parameters: toolParametersSchema.describe('JSON Schema (object) describing the tool arguments'),
  http: z.object({
    method: z.enum(['GET', 'POST']).describe('HTTP method for the request'),
    url: z
      .string()
      .url()
      .describe('Target URL. {placeholders} are replaced with matching argument values; remaining args go to query params (GET) or the JSON body (POST)'),
    headers: z.record(z.string()).optional().describe('Extra request headers, e.g. an Authorization header'),
  }),
})

export const customToolInfoSchema = customToolSchema.extend({
  builtIn: z.literal(false),
})

export const adminToolsResponseSchema = z.object({
  tools: z.array(
    z.union([
      customToolInfoSchema,
      agentToolInfoSchema.extend({ builtIn: z.literal(true) }),
    ])
  ),
})

export const customAgentSchema = z.object({
  key: slugSchema.describe('Unique agent key used as payload.scenario, e.g. "travel-planner"'),
  label: z.string().min(1).max(100).describe('Human-readable name'),
  description: z.string().max(1000).default('').describe('What this agent does'),
  systemPrompt: z.string().min(1).max(8000).describe('System prompt that shapes the agent behavior'),
  tools: z.array(z.string()).min(1).describe('Tool names from the built-in and custom tool registries'),
  sampleTasks: z.array(z.string()).default([]).describe('Example tasks shown in the demos'),
})

export const adminAgentsResponseSchema = z.object({
  agents: z.array(customAgentSchema),
})

export const providerKeyInfoSchema = z.object({
  provider: z.string(),
  configured: z.boolean(),
  source: z.enum(['dashboard', 'env', 'none']),
  maskedKey: z.string().optional(),
})

export const adminKeysResponseSchema = z.object({
  keys: z.array(providerKeyInfoSchema),
})

export const setProviderKeySchema = z.object({
  apiKey: z.string().min(1).describe('The API key value to use for this provider'),
})

export const toolTestRequestSchema = z.object({
  args: z.record(z.any()).default({}).describe('Arguments to call the tool with'),
})

export const toolTestResponseSchema = z.object({
  result: z.string(),
  details: z.any().optional(),
})

export type CustomToolInput = z.infer<typeof customToolSchema>
export type CustomAgentInput = z.infer<typeof customAgentSchema>
