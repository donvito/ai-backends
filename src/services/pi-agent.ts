import { Agent } from '@earendil-works/pi-agent-core';
import type { Api, AssistantMessage, Model } from '@earendil-works/pi-ai';
import { openaiConfig, openrouterConfig } from '../config/services';
import { demoAgentTools } from './agent-tools';
import type { TokenUsage } from './pi-ai';
import { agentStreamFn, createOpenAICompatibleModel, createOpenAIResponsesModel } from './pi-ai';

/**
 * Agent runner built on @earendil-works/pi-agent-core (pi core).
 *
 * Runs a tool-using agent loop against OpenRouter (OpenAI-compatible chat
 * completions API) or the official OpenAI API (Responses API) and surfaces
 * lifecycle events for streaming plus an aggregated result.
 */

export type AgentProviderName = 'openrouter' | 'openai';

const OPENROUTER_BASE_URL = openrouterConfig.baseURL || 'https://openrouter.ai/api/v1';

export const DEFAULT_AGENT_SYSTEM_PROMPT = [
  'You are a helpful assistant that completes tasks using the tools available to you.',
  'Use tools whenever they can provide accurate data instead of guessing.',
  'Think step by step, call tools as needed, and finish with a clear, concise answer to the task.',
].join(' ');

export const DEFAULT_MAX_TURNS = 6;
export const MAX_TURNS_LIMIT = 10;

/** Simplified, JSON-serializable events emitted while the agent runs. */
export type AgentRunEvent =
  | { type: 'agent_start' }
  | { type: 'turn_start'; turn: number }
  | { type: 'text_delta'; delta: string }
  | { type: 'thinking_delta'; delta: string }
  | { type: 'tool_call'; toolCallId: string; toolName: string; args: unknown }
  | { type: 'tool_result'; toolCallId: string; toolName: string; result: string; isError: boolean }
  | { type: 'agent_end' };

export interface AgentStep {
  toolCallId: string;
  toolName: string;
  args: unknown;
  result: string;
  isError: boolean;
}

export interface AgentRunResult {
  result: string;
  steps: AgentStep[];
  turns: number;
  usage: TokenUsage;
}

export interface RunAgentOptions {
  provider: AgentProviderName;
  model: string;
  task: string;
  systemPrompt?: string;
  maxTurns?: number;
  /**
   * Called for each simplified agent event. Awaited before the run continues,
   * so it is safe to write SSE events here.
   */
  onEvent?: (event: AgentRunEvent) => void | Promise<void>;
}

function resolveApiKey(provider: AgentProviderName): string {
  const apiKey = provider === 'openrouter' ? openrouterConfig.apiKey : openaiConfig.apiKey;
  if (!apiKey) {
    const envVar = provider === 'openrouter' ? 'OPENROUTER_API_KEY' : 'OPENAI_API_KEY';
    throw new Error(`${provider} API key is not configured. Set ${envVar} in .env`);
  }
  return apiKey;
}

function buildAgentModel(provider: AgentProviderName, modelId: string): Model<Api> {
  if (provider === 'openrouter') {
    return createOpenAICompatibleModel({
      provider: 'openrouter',
      modelId,
      baseUrl: OPENROUTER_BASE_URL,
    });
  }
  // Official OpenAI key via the Responses API
  return createOpenAIResponsesModel(modelId, process.env.OPENAI_BASE_URL);
}

function extractAssistantText(message: AssistantMessage): string {
  return message.content
    .filter((block): block is Extract<typeof block, { type: 'text' }> => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

function extractToolResultText(result: unknown): string {
  if (result && typeof result === 'object' && Array.isArray((result as { content?: unknown }).content)) {
    const content = (result as { content: { type?: string; text?: string }[] }).content;
    return content
      .filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('\n');
  }
  return typeof result === 'string' ? result : JSON.stringify(result);
}

/**
 * Run a tool-using agent to completion and return the aggregated result.
 */
export async function runAgent(options: RunAgentOptions): Promise<AgentRunResult> {
  const apiKey = resolveApiKey(options.provider);
  const model = buildAgentModel(options.provider, options.model);
  const maxTurns = Math.min(options.maxTurns ?? DEFAULT_MAX_TURNS, MAX_TURNS_LIMIT);

  const steps: AgentStep[] = [];
  const pendingToolCalls = new Map<string, { toolName: string; args: unknown }>();
  const usage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let turns = 0;
  let finalText = '';

  const agent = new Agent({
    initialState: {
      systemPrompt: options.systemPrompt || DEFAULT_AGENT_SYSTEM_PROMPT,
      model,
      tools: demoAgentTools,
    },
    streamFn: agentStreamFn,
    getApiKey: () => apiKey,
    shouldStopAfterTurn: () => turns >= maxTurns,
  });

  const emit = async (event: AgentRunEvent) => {
    if (options.onEvent) {
      await options.onEvent(event);
    }
  };

  agent.subscribe(async (event) => {
    switch (event.type) {
      case 'agent_start':
        await emit({ type: 'agent_start' });
        break;
      case 'turn_start':
        turns += 1;
        await emit({ type: 'turn_start', turn: turns });
        break;
      case 'message_update': {
        const streamEvent = event.assistantMessageEvent;
        if (streamEvent.type === 'text_delta') {
          await emit({ type: 'text_delta', delta: streamEvent.delta });
        } else if (streamEvent.type === 'thinking_delta') {
          await emit({ type: 'thinking_delta', delta: streamEvent.delta });
        }
        break;
      }
      case 'message_end': {
        const message = event.message;
        if (message && typeof message === 'object' && 'role' in message && message.role === 'assistant') {
          const assistantMessage = message as AssistantMessage;
          const input = assistantMessage.usage?.input ?? 0;
          const output = assistantMessage.usage?.output ?? 0;
          usage.promptTokens += input;
          usage.completionTokens += output;
          usage.totalTokens += assistantMessage.usage?.totalTokens ?? input + output;
          const text = extractAssistantText(assistantMessage);
          if (text.trim()) {
            finalText = text;
          }
        }
        break;
      }
      case 'tool_execution_start':
        pendingToolCalls.set(event.toolCallId, { toolName: event.toolName, args: event.args });
        await emit({
          type: 'tool_call',
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: event.args,
        });
        break;
      case 'tool_execution_end': {
        const pending = pendingToolCalls.get(event.toolCallId);
        pendingToolCalls.delete(event.toolCallId);
        const resultText = extractToolResultText(event.result);
        steps.push({
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: pending?.args,
          result: resultText,
          isError: event.isError,
        });
        await emit({
          type: 'tool_result',
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          result: resultText,
          isError: event.isError,
        });
        break;
      }
      case 'agent_end':
        await emit({ type: 'agent_end' });
        break;
    }
  });

  await agent.prompt(options.task);
  await agent.waitForIdle();

  if (agent.state.errorMessage) {
    throw new Error(`Agent run failed: ${agent.state.errorMessage}`);
  }

  return {
    result: finalText,
    steps,
    turns,
    usage,
  };
}
