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

export const adminToolItemSchema = agentToolInfoSchema.extend({
  builtIn: z.boolean(),
  source: z.enum(['built-in', 'custom', 'mcp']),
  parameters: toolParametersSchema.optional(),
  http: z
    .object({
      method: z.enum(['GET', 'POST']),
      url: z.string(),
      headers: z.record(z.string()).optional(),
    })
    .optional(),
  serverName: z.string().optional().describe('MCP server the tool was discovered from'),
})

export const adminToolsResponseSchema = z.object({
  tools: z.array(adminToolItemSchema),
})

export const customAgentSchema = z.object({
  key: slugSchema.describe('Unique agent key used as payload.scenario, e.g. "travel-planner"'),
  label: z.string().min(1).max(100).describe('Human-readable name'),
  description: z.string().max(1000).default('').describe('What this agent does'),
  systemPrompt: z.string().min(1).max(8000).describe('System prompt that shapes the agent behavior'),
  tools: z.array(z.string()).min(1).describe('Tool names from the built-in, custom, and MCP tool registries'),
  skills: z
    .array(z.string())
    .default([])
    .describe('Skill names from the skill store; descriptions are always visible to the agent, full content loads on demand'),
  sampleTasks: z.array(z.string()).default([]).describe('Example tasks shown in the demos'),
})

export const adminAgentsResponseSchema = z.object({
  agents: z.array(customAgentSchema),
})

export const skillSchema = z.object({
  name: slugSchema.describe('Unique skill name, e.g. "refund-policy"'),
  description: z
    .string()
    .min(1)
    .max(1024)
    .describe('What the skill does and when to use it. Always visible to agents that have the skill.'),
  content: z.string().min(1).max(50000).describe('Full skill instructions (markdown). Loaded on demand via the use_skill tool.'),
})

export const adminSkillsResponseSchema = z.object({
  skills: z.array(skillSchema),
})

export const mcpServerSchema = z.object({
  name: slugSchema.describe('Unique server name; discovered tools are registered as mcp_<name>_<tool>'),
  url: z.string().url().describe('MCP server endpoint URL'),
  transport: z.enum(['streamable-http', 'sse']).default('streamable-http').describe('MCP transport'),
  headers: z.record(z.string()).optional().describe('Extra request headers, e.g. an Authorization header'),
})

export const mcpToolInfoSchema = z.object({
  name: z.string(),
  label: z.string(),
  description: z.string(),
  serverName: z.string(),
  originalName: z.string(),
})

export const mcpServerStatusSchema = mcpServerSchema.extend({
  connected: z.boolean(),
  toolCount: z.number(),
  tools: z.array(mcpToolInfoSchema),
  error: z.string().optional(),
})

export const adminMcpServersResponseSchema = z.object({
  servers: z.array(mcpServerStatusSchema),
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
