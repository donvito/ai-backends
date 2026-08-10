import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { CustomToolDefinition } from './admin-store';
import { fetchWithBackoff } from './agent-tools';

/**
 * Builds runnable agent tools from admin-defined HTTP tool definitions.
 *
 * A custom tool performs one HTTP request when the agent calls it:
 * - `{placeholders}` in the URL are replaced with matching argument values
 * - GET: remaining arguments are appended as query parameters
 * - POST: remaining arguments are sent as a JSON body
 * The response body text is returned to the model (truncated).
 */

const MAX_RESULT_CHARS = 4000;
const REQUEST_TIMEOUT_MS = 30000;

export function buildHttpTool(definition: CustomToolDefinition): AgentTool<any> {
  return {
    name: definition.name,
    label: definition.label,
    description: definition.description,
    // The stored JSON Schema object is structurally compatible with the
    // TypeBox schemas the agent runtime validates arguments against.
    parameters: definition.parameters as any,
    execute: async (_toolCallId, params, signal) => {
      const result = await executeHttpTool(definition, params ?? {}, signal);
      return {
        content: [{ type: 'text' as const, text: result.text }],
        details: result.details,
      };
    },
  };
}

export interface HttpToolExecution {
  text: string;
  details: {
    url: string;
    method: string;
    status: number;
    truncated: boolean;
  };
}

export async function executeHttpTool(
  definition: CustomToolDefinition,
  args: Record<string, unknown> | unknown,
  signal?: AbortSignal
): Promise<HttpToolExecution> {
  const argsRecord: Record<string, unknown> =
    args && typeof args === 'object' && !Array.isArray(args) ? { ...(args as Record<string, unknown>) } : {};

  // Substitute {placeholders} in the URL with argument values
  let url = definition.http.url;
  for (const [key, value] of Object.entries(argsRecord)) {
    const placeholder = `{${key}}`;
    if (url.includes(placeholder)) {
      url = url.split(placeholder).join(encodeURIComponent(String(value)));
      delete argsRecord[key];
    }
  }

  const method = definition.http.method;
  const headers: Record<string, string> = { ...(definition.http.headers || {}) };
  let body: string | undefined;

  if (method === 'GET') {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(argsRecord)) {
      query.append(key, String(value));
    }
    const queryString = query.toString();
    if (queryString) {
      url += (url.includes('?') ? '&' : '?') + queryString;
    }
  } else {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    body = JSON.stringify(argsRecord);
  }

  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const combinedSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;

  const response = await fetchWithBackoff(url, combinedSignal, { method, headers, body });
  const rawText = await response.text();
  const truncated = rawText.length > MAX_RESULT_CHARS;
  const text = truncated ? rawText.slice(0, MAX_RESULT_CHARS) + '… [truncated]' : rawText;

  if (!response.ok) {
    throw new Error(`Tool request failed with status ${response.status}: ${text.slice(0, 500)}`);
  }

  return {
    text: text || '(empty response)',
    details: { url, method, status: response.status, truncated },
  };
}
