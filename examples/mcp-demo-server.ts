/**
 * Minimal MCP (Model Context Protocol) demo server over Streamable HTTP.
 *
 * Use it to try the MCP integration in the admin dashboard:
 *
 *   bun run examples/mcp-demo-server.ts        # listens on http://localhost:3900/mcp
 *
 * Then register it in the dashboard (MCP Servers tab) or via the API:
 *
 *   curl -X POST http://localhost:3000/api/v1/admin/mcp-servers \
 *     -H 'Content-Type: application/json' \
 *     -d '{ "name": "demo", "url": "http://localhost:3900/mcp", "transport": "streamable-http" }'
 *
 * The discovered tools are registered as mcp_demo_roll_dice and
 * mcp_demo_lookup_order and can be attached to agents.
 */
import { createServer } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

const PORT = Number(process.env.MCP_DEMO_PORT || 3900);

// Tiny in-memory "order database" so agents have something real to look up
const orders: Record<string, { orderId: string; item: string; status: string; eta: string }> = {
  'ORD-100': { orderId: 'ORD-100', item: 'Mechanical keyboard', status: 'shipped', eta: '2026-08-12' },
  'ORD-101': { orderId: 'ORD-101', item: 'USB-C dock', status: 'processing', eta: '2026-08-15' },
  'ORD-102': { orderId: 'ORD-102', item: '4K monitor', status: 'delivered', eta: '2026-08-05' },
};

function buildServer(): McpServer {
  const server = new McpServer({ name: 'ai-backends-demo', version: '1.0.0' });

  // Note: inputSchema shapes are cast because the repo pins zod 3.24 while the
  // MCP SDK types target zod >=3.25; the objects are runtime-compatible.
  server.registerTool(
    'roll_dice',
    {
      description: 'Roll one or more six-sided dice and return the results.',
      inputSchema: { count: z.number().int().min(1).max(10).describe('Number of dice to roll') } as any,
    },
    async ({ count }: { count: number }) => {
      const rolls = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * 6));
      return {
        content: [{ type: 'text' as const, text: `Rolled ${count} dice: ${rolls.join(', ')} (total ${rolls.reduce((a, b) => a + b, 0)})` }],
      };
    }
  );

  server.registerTool(
    'lookup_order',
    {
      description: 'Look up the status of an order by order id (e.g. ORD-100).',
      inputSchema: { orderId: z.string().describe('Order id, e.g. ORD-100') } as any,
    },
    async ({ orderId }: { orderId: string }) => {
      const order = orders[orderId.toUpperCase()];
      if (!order) {
        return { content: [{ type: 'text' as const, text: `No order found with id ${orderId}. Known demo orders: ${Object.keys(orders).join(', ')}` }] };
      }
      return {
        content: [{ type: 'text' as const, text: `Order ${order.orderId}: ${order.item} — status ${order.status}, ETA ${order.eta}` }],
      };
    }
  );

  return server;
}

// Stateless mode: a fresh server + transport per request
const httpServer = createServer(async (req, res) => {
  if (!req.url?.startsWith('/mcp')) {
    res.writeHead(404).end('Not found. MCP endpoint is at /mcp');
    return;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const rawBody = Buffer.concat(chunks).toString('utf-8');
  const body = rawBody ? JSON.parse(rawBody) : undefined;

  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => {
    void transport.close();
    void server.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, body);
});

httpServer.listen(PORT, () => {
  console.log(`MCP demo server listening on http://localhost:${PORT}/mcp`);
  console.log('Tools: roll_dice, lookup_order');
});
