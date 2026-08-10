import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { McpServerDefinition } from './admin-store';
import { listMcpServers } from './admin-store';

/**
 * MCP (Model Context Protocol) client bridge.
 *
 * Connects to MCP servers over Streamable HTTP or SSE, discovers their tools,
 * and exposes them as agent tools named `mcp_<server>_<tool>`. Discovery is
 * cached in memory so the (synchronous) tool registry can include MCP tools;
 * connect happens at registration, on boot warm-up, and on manual refresh.
 */

export interface McpToolInfo {
  name: string;
  label: string;
  description: string;
  serverName: string;
  originalName: string;
}

interface McpConnection {
  definition: McpServerDefinition;
  client: Client;
  tools: Map<string, AgentTool<any>>;
  toolInfos: McpToolInfo[];
  connectedAt: number;
}

const connections = new Map<string, McpConnection>();
const connectionErrors = new Map<string, string>();

function sanitizeToolName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function mcpToolName(serverName: string, originalToolName: string): string {
  return `mcp_${serverName}_${sanitizeToolName(originalToolName)}`.slice(0, 64);
}

function createTransport(definition: McpServerDefinition) {
  const url = new URL(definition.url);
  const requestInit = definition.headers ? { headers: definition.headers } : undefined;
  if (definition.transport === 'sse') {
    return new SSEClientTransport(url, { requestInit });
  }
  return new StreamableHTTPClientTransport(url, { requestInit });
}

function extractTextContent(content: unknown): string {
  if (!Array.isArray(content)) return typeof content === 'string' ? content : JSON.stringify(content);
  return content
    .filter((block): block is { type: string; text: string } =>
      !!block && typeof block === 'object' && (block as any).type === 'text' && typeof (block as any).text === 'string')
    .map((block) => block.text)
    .join('\n');
}

function buildMcpTool(serverName: string, mcpTool: { name: string; description?: string; inputSchema?: unknown }): AgentTool<any> {
  const bridgedName = mcpToolName(serverName, mcpTool.name);
  return {
    name: bridgedName,
    label: `${mcpTool.name} (MCP: ${serverName})`,
    description: mcpTool.description || `MCP tool ${mcpTool.name} from server ${serverName}`,
    // MCP inputSchema is JSON Schema, structurally compatible with the
    // TypeBox schemas the agent runtime validates arguments against.
    parameters: (mcpTool.inputSchema as any) || { type: 'object', properties: {} },
    execute: async (_toolCallId, params) => {
      const result = await callMcpTool(serverName, mcpTool.name, (params as Record<string, unknown>) ?? {});
      return {
        content: [{ type: 'text' as const, text: result }],
        details: { server: serverName, tool: mcpTool.name },
      };
    },
  };
}

async function callMcpTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<string> {
  let connection = connections.get(serverName);
  if (!connection) {
    throw new Error(`MCP server "${serverName}" is not connected. Refresh it in the admin dashboard.`);
  }

  const invoke = async (target: McpConnection) => {
    const result = await target.client.callTool({ name: toolName, arguments: args });
    const text = extractTextContent(result.content) || '(empty result)';
    if (result.isError) {
      throw new Error(`MCP tool error: ${text.slice(0, 500)}`);
    }
    return text;
  };

  try {
    return await invoke(connection);
  } catch (error) {
    // Transport-level failures: reconnect once and retry. Tool-level errors
    // (isError results) are rethrown as-is by invoke.
    if (error instanceof Error && error.message.startsWith('MCP tool error:')) {
      throw error;
    }
    console.warn(`[WARN] MCP call to ${serverName}/${toolName} failed; reconnecting once:`, error);
    connection = await connectMcpServer(connection.definition);
    return invoke(connection);
  }
}

/**
 * Connect (or reconnect) to an MCP server and discover its tools.
 */
export async function connectMcpServer(definition: McpServerDefinition): Promise<McpConnection> {
  await disconnectMcpServer(definition.name);

  const client = new Client({ name: 'ai-backends', version: '1.0.0' });
  try {
    await client.connect(createTransport(definition));
    const { tools: mcpTools } = await client.listTools();

    const tools = new Map<string, AgentTool<any>>();
    const toolInfos: McpToolInfo[] = [];
    for (const mcpTool of mcpTools) {
      const tool = buildMcpTool(definition.name, mcpTool);
      tools.set(tool.name, tool);
      toolInfos.push({
        name: tool.name,
        label: tool.label,
        description: tool.description,
        serverName: definition.name,
        originalName: mcpTool.name,
      });
    }

    const connection: McpConnection = {
      definition,
      client,
      tools,
      toolInfos,
      connectedAt: Date.now(),
    };
    connections.set(definition.name, connection);
    connectionErrors.delete(definition.name);
    return connection;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    connectionErrors.set(definition.name, message);
    try {
      await client.close();
    } catch {
      // ignore close failures on a connection that never came up
    }
    throw new Error(`Failed to connect to MCP server "${definition.name}" (${definition.url}): ${message}`);
  }
}

export async function disconnectMcpServer(name: string): Promise<void> {
  const existing = connections.get(name);
  if (existing) {
    connections.delete(name);
    try {
      await existing.client.close();
    } catch (error) {
      console.warn(`[WARN] Error closing MCP connection "${name}":`, error);
    }
  }
  connectionErrors.delete(name);
}

/** All bridged MCP tools from currently connected servers (synchronous cache). */
export function getMcpToolsSync(): Map<string, AgentTool<any>> {
  const merged = new Map<string, AgentTool<any>>();
  for (const connection of connections.values()) {
    for (const [name, tool] of connection.tools) {
      merged.set(name, tool);
    }
  }
  return merged;
}

export interface McpServerStatus extends McpServerDefinition {
  connected: boolean;
  toolCount: number;
  tools: McpToolInfo[];
  error?: string;
}

export function getMcpServerStatus(definition: McpServerDefinition): McpServerStatus {
  const connection = connections.get(definition.name);
  const error = connectionErrors.get(definition.name);
  return {
    ...definition,
    connected: !!connection,
    toolCount: connection ? connection.toolInfos.length : 0,
    tools: connection ? connection.toolInfos : [],
    ...(error ? { error } : {}),
  };
}

/**
 * Connect to all persisted MCP servers in the background (boot warm-up).
 * Failures are recorded per server and surfaced via getMcpServerStatus.
 */
export function warmUpMcpServers(): void {
  const servers = listMcpServers();
  if (servers.length === 0) return;
  void Promise.allSettled(
    servers.map(async (server) => {
      try {
        const connection = await connectMcpServer(server);
        console.log(`MCP server "${server.name}" connected (${connection.toolInfos.length} tool(s))`);
      } catch (error) {
        console.warn(`[WARN] MCP warm-up failed for "${server.name}":`, error instanceof Error ? error.message : error);
      }
    })
  );
}
