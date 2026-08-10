import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { Context } from 'hono'
import {
  adminAgentsResponseSchema,
  adminKeysResponseSchema,
  adminMcpServersResponseSchema,
  adminSkillsResponseSchema,
  adminToolsResponseSchema,
  customAgentSchema,
  customToolSchema,
  mcpServerSchema,
  mcpServerStatusSchema,
  providerKeyInfoSchema,
  setProviderKeySchema,
  skillSchema,
  toolTestRequestSchema,
  toolTestResponseSchema,
} from '../../schemas/v1/admin'
import {
  clearProviderKey,
  deleteCustomAgent,
  deleteCustomTool,
  deleteMcpServer,
  deleteSkill,
  getCustomAgent,
  getCustomTool,
  getMcpServer,
  getProviderKeyInfos,
  getSkill,
  listCustomAgents,
  listCustomTools,
  listMcpServers,
  listSkills,
  setProviderKey,
  upsertCustomAgent,
  upsertCustomTool,
  upsertMcpServer,
  upsertSkill,
} from '../../services/admin-store'
import { executeHttpTool } from '../../services/agent-custom-tools'
import {
  getToolRegistry,
  isBuiltInScenarioKey,
  isBuiltInToolName,
} from '../../services/agent-scenarios'
import { demoAgentTools } from '../../services/agent-tools'
import { customerSupportTools } from '../../services/agent-tools-customer-support'
import { realEstateTools } from '../../services/agent-tools-real-estate'
import {
  connectMcpServer,
  disconnectMcpServer,
  getMcpServerStatus,
  getMcpToolsSync,
  warmUpMcpServers,
} from '../../services/mcp'

// Reconnect persisted MCP servers in the background at startup
warmUpMcpServers()

const router = new OpenAPIHono()

const errorSchema = z.object({ error: z.string() })

const errorResponses = {
  400: {
    description: 'Invalid request',
    content: { 'application/json': { schema: errorSchema } },
  },
  401: {
    description: 'Unauthorized - Bearer token required',
    content: { 'application/json': { schema: errorSchema } },
  },
  404: {
    description: 'Not found',
    content: { 'application/json': { schema: errorSchema } },
  },
} as const

function badRequest(c: Context, message: string) {
  return c.json({ error: message }, 400)
}

function validateAgentTools(toolNames: string[]): string | null {
  const registry = getToolRegistry()
  const missing = toolNames.filter((name) => !registry.has(name))
  if (missing.length > 0) {
    return `Unknown tool(s): ${missing.join(', ')}. Check GET /api/v1/admin/tools for available tools.`
  }
  return null
}

function validateAgentSkills(skillNames: string[]): string | null {
  const missing = skillNames.filter((name) => !getSkill(name))
  if (missing.length > 0) {
    return `Unknown skill(s): ${missing.join(', ')}. Check GET /api/v1/admin/skills for available skills.`
  }
  return null
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

router.openapi(
  createRoute({
    path: '/agents',
    method: 'get',
    security: [{ BearerAuth: [] }],
    responses: {
      200: {
        description: 'Lists custom agents created via this API. Built-in scenarios are listed by GET /api/v1/agent/scenarios.',
        content: { 'application/json': { schema: adminAgentsResponseSchema } },
      },
      401: errorResponses[401],
    },
    summary: 'List custom agents',
    description: 'This endpoint lists all custom agents. Run them with the Agents API by passing the agent key as payload.scenario.',
    tags: ['Admin'],
  }),
  ((c: Context) => {
    const agents = listCustomAgents().map((agent) => ({ ...agent, skills: agent.skills ?? [] }))
    return c.json({ agents }, 200)
  }) as any
)

router.openapi(
  createRoute({
    path: '/agents',
    method: 'post',
    security: [{ BearerAuth: [] }],
    request: {
      body: { content: { 'application/json': { schema: customAgentSchema } } },
    },
    responses: {
      201: {
        description: 'Custom agent created. Use its key as payload.scenario on the Agents API.',
        content: { 'application/json': { schema: customAgentSchema } },
      },
      ...errorResponses,
    },
    summary: 'Create a custom agent',
    description:
      'This endpoint creates a custom agent from a system prompt and a list of tool names (built-in or custom). The agent becomes immediately runnable via POST /api/v1/agent/run and /api/v1/agent/chat using its key as payload.scenario.',
    tags: ['Admin'],
  }),
  (async (c: Context) => {
    let input
    try {
      input = customAgentSchema.parse(await c.req.json())
    } catch (error) {
      return badRequest(c, error instanceof z.ZodError ? error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ') : 'Invalid request body')
    }
    if (isBuiltInScenarioKey(input.key)) {
      return badRequest(c, `"${input.key}" is a built-in scenario key and cannot be used for a custom agent.`)
    }
    const toolError = validateAgentTools(input.tools)
    if (toolError) return badRequest(c, toolError)
    const skillError = validateAgentSkills(input.skills)
    if (skillError) return badRequest(c, skillError)
    try {
      return c.json(upsertCustomAgent(input, { create: true }), 201)
    } catch (error) {
      return badRequest(c, error instanceof Error ? error.message : 'Failed to create agent')
    }
  }) as any
)

router.openapi(
  createRoute({
    path: '/agents/{key}',
    method: 'put',
    security: [{ BearerAuth: [] }],
    request: {
      params: z.object({ key: z.string() }),
      body: { content: { 'application/json': { schema: customAgentSchema } } },
    },
    responses: {
      200: {
        description: 'Custom agent updated.',
        content: { 'application/json': { schema: customAgentSchema } },
      },
      ...errorResponses,
    },
    summary: 'Update a custom agent',
    description: 'This endpoint updates an existing custom agent. The key in the body must match the key in the path.',
    tags: ['Admin'],
  }),
  (async (c: Context) => {
    const key = c.req.param('key')
    if (!getCustomAgent(key)) {
      return c.json({ error: `No custom agent with key "${key}"` }, 404)
    }
    let input
    try {
      input = customAgentSchema.parse(await c.req.json())
    } catch (error) {
      return badRequest(c, error instanceof z.ZodError ? error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ') : 'Invalid request body')
    }
    if (input.key !== key) {
      return badRequest(c, 'The agent key cannot be changed. Create a new agent instead.')
    }
    const toolError = validateAgentTools(input.tools)
    if (toolError) return badRequest(c, toolError)
    const skillError = validateAgentSkills(input.skills)
    if (skillError) return badRequest(c, skillError)
    return c.json(upsertCustomAgent(input), 200)
  }) as any
)

router.openapi(
  createRoute({
    path: '/agents/{key}',
    method: 'delete',
    security: [{ BearerAuth: [] }],
    request: {
      params: z.object({ key: z.string() }),
    },
    responses: {
      200: {
        description: 'Custom agent deleted.',
        content: { 'application/json': { schema: z.object({ deleted: z.boolean(), key: z.string() }) } },
      },
      401: errorResponses[401],
      404: errorResponses[404],
    },
    summary: 'Delete a custom agent',
    description: 'This endpoint deletes a custom agent. Active chat sessions using it keep running until they expire.',
    tags: ['Admin'],
  }),
  ((c: Context) => {
    const key = c.req.param('key')
    if (!deleteCustomAgent(key)) {
      return c.json({ error: `No custom agent with key "${key}"` }, 404)
    }
    return c.json({ deleted: true, key }, 200)
  }) as any
)

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

router.openapi(
  createRoute({
    path: '/tools',
    method: 'get',
    security: [{ BearerAuth: [] }],
    responses: {
      200: {
        description: 'Lists all tools: built-in (read-only) and custom HTTP tools (full definitions).',
        content: { 'application/json': { schema: adminToolsResponseSchema } },
      },
      401: errorResponses[401],
    },
    summary: 'List all tools',
    description:
      'This endpoint lists every tool agents can use: the built-in toolsets, custom HTTP tools created via this API, and tools discovered from connected MCP servers.',
    tags: ['Admin'],
  }),
  ((c: Context) => {
    const builtIn = [...demoAgentTools, ...customerSupportTools, ...realEstateTools].map((tool) => ({
      name: tool.name,
      label: tool.label,
      description: tool.description,
      builtIn: true as const,
      source: 'built-in' as const,
    }))
    const custom = listCustomTools().map((tool) => ({ ...tool, builtIn: false as const, source: 'custom' as const }))
    const mcp = [...getMcpToolsSync().values()].map((tool) => ({
      name: tool.name,
      label: tool.label,
      description: tool.description,
      builtIn: false as const,
      source: 'mcp' as const,
      serverName: tool.name.split('_')[1],
    }))
    return c.json({ tools: [...builtIn, ...custom, ...mcp] }, 200)
  }) as any
)

router.openapi(
  createRoute({
    path: '/tools',
    method: 'post',
    security: [{ BearerAuth: [] }],
    request: {
      body: { content: { 'application/json': { schema: customToolSchema } } },
    },
    responses: {
      201: {
        description: 'Custom HTTP tool created.',
        content: { 'application/json': { schema: customToolSchema } },
      },
      ...errorResponses,
    },
    summary: 'Create a custom HTTP tool',
    description:
      'This endpoint creates a tool that performs one HTTP request when the agent calls it. {placeholders} in the URL are replaced with matching arguments; remaining arguments are sent as query parameters (GET) or a JSON body (POST). The response body text is returned to the model.',
    tags: ['Admin'],
  }),
  (async (c: Context) => {
    let input
    try {
      input = customToolSchema.parse(await c.req.json())
    } catch (error) {
      return badRequest(c, error instanceof z.ZodError ? error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ') : 'Invalid request body')
    }
    if (isBuiltInToolName(input.name)) {
      return badRequest(c, `"${input.name}" is a built-in tool name and cannot be overridden.`)
    }
    try {
      return c.json(upsertCustomTool(input, { create: true }), 201)
    } catch (error) {
      return badRequest(c, error instanceof Error ? error.message : 'Failed to create tool')
    }
  }) as any
)

router.openapi(
  createRoute({
    path: '/tools/{name}',
    method: 'put',
    security: [{ BearerAuth: [] }],
    request: {
      params: z.object({ name: z.string() }),
      body: { content: { 'application/json': { schema: customToolSchema } } },
    },
    responses: {
      200: {
        description: 'Custom HTTP tool updated.',
        content: { 'application/json': { schema: customToolSchema } },
      },
      ...errorResponses,
    },
    summary: 'Update a custom HTTP tool',
    description: 'This endpoint updates an existing custom tool. The tool name in the body must match the name in the path. Built-in tools cannot be edited.',
    tags: ['Admin'],
  }),
  (async (c: Context) => {
    const name = c.req.param('name')
    if (!getCustomTool(name)) {
      return c.json({ error: `No custom tool named "${name}"` }, 404)
    }
    let input
    try {
      input = customToolSchema.parse(await c.req.json())
    } catch (error) {
      return badRequest(c, error instanceof z.ZodError ? error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ') : 'Invalid request body')
    }
    if (input.name !== name) {
      return badRequest(c, 'The tool name cannot be changed. Create a new tool instead.')
    }
    return c.json(upsertCustomTool(input), 200)
  }) as any
)

router.openapi(
  createRoute({
    path: '/tools/{name}',
    method: 'delete',
    security: [{ BearerAuth: [] }],
    request: {
      params: z.object({ name: z.string() }),
    },
    responses: {
      200: {
        description: 'Custom HTTP tool deleted.',
        content: { 'application/json': { schema: z.object({ deleted: z.boolean(), name: z.string() }) } },
      },
      400: errorResponses[400],
      401: errorResponses[401],
      404: errorResponses[404],
    },
    summary: 'Delete a custom HTTP tool',
    description: 'This endpoint deletes a custom tool. Deletion is blocked while any custom agent still references the tool.',
    tags: ['Admin'],
  }),
  ((c: Context) => {
    const name = c.req.param('name')
    if (isBuiltInToolName(name)) {
      return badRequest(c, 'Built-in tools cannot be deleted.')
    }
    try {
      if (!deleteCustomTool(name)) {
        return c.json({ error: `No custom tool named "${name}"` }, 404)
      }
    } catch (error) {
      return badRequest(c, error instanceof Error ? error.message : 'Failed to delete tool')
    }
    return c.json({ deleted: true, name }, 200)
  }) as any
)

router.openapi(
  createRoute({
    path: '/tools/{name}/test',
    method: 'post',
    security: [{ BearerAuth: [] }],
    request: {
      params: z.object({ name: z.string() }),
      body: { content: { 'application/json': { schema: toolTestRequestSchema } } },
    },
    responses: {
      200: {
        description: 'The tool executed successfully; returns the text the model would receive.',
        content: { 'application/json': { schema: toolTestResponseSchema } },
      },
      ...errorResponses,
    },
    summary: 'Test a tool',
    description: 'This endpoint executes a tool once with the provided arguments and returns the result, so you can verify a tool works before agents use it.',
    tags: ['Admin'],
  }),
  (async (c: Context) => {
    const name = c.req.param('name')
    let args: Record<string, unknown> = {}
    try {
      const body = toolTestRequestSchema.parse(await c.req.json().catch(() => ({})))
      args = body.args
    } catch (error) {
      return badRequest(c, 'Invalid request body')
    }

    try {
      const customTool = getCustomTool(name)
      if (customTool) {
        const result = await executeHttpTool(customTool, args)
        return c.json({ result: result.text, details: result.details }, 200)
      }
      const registry = getToolRegistry()
      const tool = registry.get(name)
      if (!tool) {
        return c.json({ error: `No tool named "${name}"` }, 404)
      }
      const result = await tool.execute('admin-test', args as any)
      const text = result.content
        .filter((block): block is Extract<typeof block, { type: 'text' }> => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
      return c.json({ result: text, details: result.details }, 200)
    } catch (error) {
      return badRequest(c, error instanceof Error ? error.message : 'Tool execution failed')
    }
  }) as any
)

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

router.openapi(
  createRoute({
    path: '/skills',
    method: 'get',
    security: [{ BearerAuth: [] }],
    responses: {
      200: {
        description: 'Lists all skills.',
        content: { 'application/json': { schema: adminSkillsResponseSchema } },
      },
      401: errorResponses[401],
    },
    summary: 'List skills',
    description:
      'This endpoint lists all skills. Attach skills to agents via the agent skills field; agents see skill descriptions and load full instructions on demand through the use_skill tool.',
    tags: ['Admin'],
  }),
  (c) => c.json({ skills: listSkills() }, 200)
)

router.openapi(
  createRoute({
    path: '/skills',
    method: 'post',
    security: [{ BearerAuth: [] }],
    request: {
      body: { content: { 'application/json': { schema: skillSchema } } },
    },
    responses: {
      201: {
        description: 'Skill created.',
        content: { 'application/json': { schema: skillSchema } },
      },
      ...errorResponses,
    },
    summary: 'Create a skill',
    description:
      'This endpoint creates a skill (Agent Skills style): a name, a description that is always visible to agents that have the skill, and full markdown instructions loaded on demand.',
    tags: ['Admin'],
  }),
  (async (c: Context) => {
    let input
    try {
      input = skillSchema.parse(await c.req.json())
    } catch (error) {
      return badRequest(c, error instanceof z.ZodError ? error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ') : 'Invalid request body')
    }
    try {
      return c.json(upsertSkill(input, { create: true }), 201)
    } catch (error) {
      return badRequest(c, error instanceof Error ? error.message : 'Failed to create skill')
    }
  }) as any
)

router.openapi(
  createRoute({
    path: '/skills/{name}',
    method: 'put',
    security: [{ BearerAuth: [] }],
    request: {
      params: z.object({ name: z.string() }),
      body: { content: { 'application/json': { schema: skillSchema } } },
    },
    responses: {
      200: {
        description: 'Skill updated.',
        content: { 'application/json': { schema: skillSchema } },
      },
      ...errorResponses,
    },
    summary: 'Update a skill',
    description: 'This endpoint updates an existing skill. The skill name in the body must match the name in the path.',
    tags: ['Admin'],
  }),
  (async (c: Context) => {
    const name = c.req.param('name')
    if (!getSkill(name)) {
      return c.json({ error: `No skill named "${name}"` }, 404)
    }
    let input
    try {
      input = skillSchema.parse(await c.req.json())
    } catch (error) {
      return badRequest(c, error instanceof z.ZodError ? error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ') : 'Invalid request body')
    }
    if (input.name !== name) {
      return badRequest(c, 'The skill name cannot be changed. Create a new skill instead.')
    }
    return c.json(upsertSkill(input), 200)
  }) as any
)

router.openapi(
  createRoute({
    path: '/skills/{name}',
    method: 'delete',
    security: [{ BearerAuth: [] }],
    request: {
      params: z.object({ name: z.string() }),
    },
    responses: {
      200: {
        description: 'Skill deleted.',
        content: { 'application/json': { schema: z.object({ deleted: z.boolean(), name: z.string() }) } },
      },
      400: errorResponses[400],
      401: errorResponses[401],
      404: errorResponses[404],
    },
    summary: 'Delete a skill',
    description: 'This endpoint deletes a skill. Deletion is blocked while any agent still references the skill.',
    tags: ['Admin'],
  }),
  ((c: Context) => {
    const name = c.req.param('name')
    try {
      if (!deleteSkill(name)) {
        return c.json({ error: `No skill named "${name}"` }, 404)
      }
    } catch (error) {
      return badRequest(c, error instanceof Error ? error.message : 'Failed to delete skill')
    }
    return c.json({ deleted: true, name }, 200)
  }) as any
)

// ---------------------------------------------------------------------------
// MCP servers
// ---------------------------------------------------------------------------

router.openapi(
  createRoute({
    path: '/mcp-servers',
    method: 'get',
    security: [{ BearerAuth: [] }],
    responses: {
      200: {
        description: 'Lists registered MCP servers with connection status and discovered tools.',
        content: { 'application/json': { schema: adminMcpServersResponseSchema } },
      },
      401: errorResponses[401],
    },
    summary: 'List MCP servers',
    description:
      'This endpoint lists registered MCP (Model Context Protocol) servers, whether each is connected, and the tools discovered from it.',
    tags: ['Admin'],
  }),
  ((c: Context) => {
    return c.json({ servers: listMcpServers().map(getMcpServerStatus) }, 200)
  }) as any
)

router.openapi(
  createRoute({
    path: '/mcp-servers',
    method: 'post',
    security: [{ BearerAuth: [] }],
    request: {
      body: { content: { 'application/json': { schema: mcpServerSchema } } },
    },
    responses: {
      201: {
        description:
          'MCP server registered. The response includes connection status and discovered tools; if the connection failed, the server is still saved and the error is reported.',
        content: { 'application/json': { schema: mcpServerStatusSchema } },
      },
      ...errorResponses,
    },
    summary: 'Register an MCP server',
    description:
      'This endpoint registers an MCP server (Streamable HTTP or SSE transport) and connects to it. Discovered tools are registered as mcp_<server>_<tool> and can be attached to agents like any other tool.',
    tags: ['Admin'],
  }),
  (async (c: Context) => {
    let input
    try {
      input = mcpServerSchema.parse(await c.req.json())
    } catch (error) {
      return badRequest(c, error instanceof z.ZodError ? error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ') : 'Invalid request body')
    }
    try {
      upsertMcpServer(input, { create: true })
    } catch (error) {
      return badRequest(c, error instanceof Error ? error.message : 'Failed to register MCP server')
    }
    try {
      await connectMcpServer(input)
    } catch (error) {
      console.warn('[WARN] MCP server registered but connection failed:', error)
    }
    return c.json(getMcpServerStatus(input), 201)
  }) as any
)

router.openapi(
  createRoute({
    path: '/mcp-servers/{name}',
    method: 'put',
    security: [{ BearerAuth: [] }],
    request: {
      params: z.object({ name: z.string() }),
      body: { content: { 'application/json': { schema: mcpServerSchema } } },
    },
    responses: {
      200: {
        description: 'MCP server updated and reconnected.',
        content: { 'application/json': { schema: mcpServerStatusSchema } },
      },
      ...errorResponses,
    },
    summary: 'Update an MCP server',
    description: 'This endpoint updates an MCP server configuration and reconnects to it. The name in the body must match the path.',
    tags: ['Admin'],
  }),
  (async (c: Context) => {
    const name = c.req.param('name')
    if (!getMcpServer(name)) {
      return c.json({ error: `No MCP server named "${name}"` }, 404)
    }
    let input
    try {
      input = mcpServerSchema.parse(await c.req.json())
    } catch (error) {
      return badRequest(c, error instanceof z.ZodError ? error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ') : 'Invalid request body')
    }
    if (input.name !== name) {
      return badRequest(c, 'The MCP server name cannot be changed. Register a new server instead.')
    }
    upsertMcpServer(input)
    try {
      await connectMcpServer(input)
    } catch (error) {
      console.warn('[WARN] MCP server updated but reconnection failed:', error)
    }
    return c.json(getMcpServerStatus(input), 200)
  }) as any
)

router.openapi(
  createRoute({
    path: '/mcp-servers/{name}',
    method: 'delete',
    security: [{ BearerAuth: [] }],
    request: {
      params: z.object({ name: z.string() }),
    },
    responses: {
      200: {
        description: 'MCP server removed and disconnected.',
        content: { 'application/json': { schema: z.object({ deleted: z.boolean(), name: z.string() }) } },
      },
      400: errorResponses[400],
      401: errorResponses[401],
      404: errorResponses[404],
    },
    summary: 'Remove an MCP server',
    description: 'This endpoint disconnects and removes an MCP server. Removal is blocked while any agent still references its tools.',
    tags: ['Admin'],
  }),
  (async (c: Context) => {
    const name = c.req.param('name')
    try {
      if (!deleteMcpServer(name)) {
        return c.json({ error: `No MCP server named "${name}"` }, 404)
      }
    } catch (error) {
      return badRequest(c, error instanceof Error ? error.message : 'Failed to remove MCP server')
    }
    await disconnectMcpServer(name)
    return c.json({ deleted: true, name }, 200)
  }) as any
)

router.openapi(
  createRoute({
    path: '/mcp-servers/{name}/refresh',
    method: 'post',
    security: [{ BearerAuth: [] }],
    request: {
      params: z.object({ name: z.string() }),
    },
    responses: {
      200: {
        description: 'Reconnected to the MCP server and re-discovered its tools.',
        content: { 'application/json': { schema: mcpServerStatusSchema } },
      },
      400: errorResponses[400],
      401: errorResponses[401],
      404: errorResponses[404],
    },
    summary: 'Refresh an MCP server connection',
    description: 'This endpoint reconnects to an MCP server and refreshes its discovered tool list.',
    tags: ['Admin'],
  }),
  (async (c: Context) => {
    const name = c.req.param('name')
    const definition = getMcpServer(name)
    if (!definition) {
      return c.json({ error: `No MCP server named "${name}"` }, 404)
    }
    try {
      await connectMcpServer(definition)
    } catch (error) {
      return badRequest(c, error instanceof Error ? error.message : 'Failed to connect to MCP server')
    }
    return c.json(getMcpServerStatus(definition), 200)
  }) as any
)

// ---------------------------------------------------------------------------
// Provider API keys
// ---------------------------------------------------------------------------

router.openapi(
  createRoute({
    path: '/keys',
    method: 'get',
    security: [{ BearerAuth: [] }],
    responses: {
      200: {
        description: 'Lists provider API key status. Keys are masked; full values are never returned.',
        content: { 'application/json': { schema: adminKeysResponseSchema } },
      },
      401: errorResponses[401],
    },
    summary: 'List provider API key status',
    description: 'This endpoint shows which providers have API keys configured and whether the active key comes from the environment or the dashboard.',
    tags: ['Admin'],
  }),
  (c) => c.json({ keys: getProviderKeyInfos() }, 200)
)

router.openapi(
  createRoute({
    path: '/keys/{provider}',
    method: 'put',
    security: [{ BearerAuth: [] }],
    request: {
      params: z.object({ provider: z.string() }),
      body: { content: { 'application/json': { schema: setProviderKeySchema } } },
    },
    responses: {
      200: {
        description: 'API key set. Takes effect immediately for new requests.',
        content: { 'application/json': { schema: providerKeyInfoSchema } },
      },
      400: errorResponses[400],
      401: errorResponses[401],
    },
    summary: 'Set a provider API key',
    description: 'This endpoint sets or replaces the API key for a provider at runtime. The key is persisted to the admin config file and overrides the environment variable.',
    tags: ['Admin'],
  }),
  (async (c: Context) => {
    const provider = c.req.param('provider')
    let input
    try {
      input = setProviderKeySchema.parse(await c.req.json())
    } catch (error) {
      return badRequest(c, 'Invalid request body: apiKey is required')
    }
    try {
      return c.json(setProviderKey(provider, input.apiKey), 200)
    } catch (error) {
      return badRequest(c, error instanceof Error ? error.message : 'Failed to set key')
    }
  }) as any
)

router.openapi(
  createRoute({
    path: '/keys/{provider}',
    method: 'delete',
    security: [{ BearerAuth: [] }],
    request: {
      params: z.object({ provider: z.string() }),
    },
    responses: {
      200: {
        description: 'Dashboard key override removed; the provider falls back to its environment variable (if set).',
        content: { 'application/json': { schema: providerKeyInfoSchema } },
      },
      400: errorResponses[400],
      401: errorResponses[401],
    },
    summary: 'Clear a provider API key override',
    description: 'This endpoint removes the dashboard-configured key for a provider and reverts to the environment variable.',
    tags: ['Admin'],
  }),
  ((c: Context) => {
    const provider = c.req.param('provider')
    try {
      return c.json(clearProviderKey(provider), 200)
    } catch (error) {
      return badRequest(c, error instanceof Error ? error.message : 'Failed to clear key')
    }
  }) as any
)

export default {
  handler: router,
  mountPath: 'admin',
}
