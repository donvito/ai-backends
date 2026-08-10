import { Agent } from '@earendil-works/pi-agent-core';
import type { Api, AssistantMessage, Model } from '@earendil-works/pi-ai';
import { openaiConfig, openrouterConfig } from '../config/services';
import { getAgentScenario, type AgentScenarioKey } from './agent-scenarios';
import type { TokenUsage } from './pi-ai';
import { agentStreamFn, createOpenAICompatibleModel, createOpenAIResponsesModel } from './pi-ai';

/**
 * Agent runner built on @earendil-works/pi-agent-core (pi core).
 *
 * A pi Agent is stateful: it owns the conversation transcript and tools. This
 * module exposes a session runtime (create once, send many messages) used by
 * the multi-turn chat endpoint, plus a one-off runAgent helper for the
 * single-task endpoint. Lifecycle events are surfaced for SSE streaming.
 */

export type AgentProviderName = 'openrouter' | 'openai';

const OPENROUTER_BASE_URL = openrouterConfig.baseURL || 'https://openrouter.ai/api/v1';

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

export interface CreateAgentRuntimeOptions {
  provider: AgentProviderName;
  model: string;
  /** Scenario key selecting the toolset and default system prompt. Defaults to 'general'. */
  scenario?: AgentScenarioKey;
  systemPrompt?: string;
}

export interface SendAgentMessageOptions {
  message: string;
  maxTurns?: number;
  /**
   * Called for each simplified agent event. Awaited before the run continues,
   * so it is safe to write SSE events here.
   */
  onEvent?: (event: AgentRunEvent) => void | Promise<void>;
}

/**
 * A live agent conversation runtime. The wrapped pi Agent keeps the full
 * transcript, so each sendAgentMessage() call continues the same conversation.
 */
export interface AgentRuntime {
  agent: Agent;
  provider: AgentProviderName;
  model: string;
  scenario: AgentScenarioKey;
  /** Mutable per-message turn budget shared with the agent's stop hook. */
  turnBudget: { turns: number; maxTurns: number };
}

/** Simplified transcript entry for session inspection. */
export interface AgentTranscriptEntry {
  role: 'user' | 'assistant' | 'tool';
  text: string;
  toolName?: string;
  isError?: boolean;
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

function extractUserText(content: string | { type?: string; text?: string }[]): string {
  if (typeof content === 'string') return content;
  return content
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('');
}

/**
 * Create a reusable agent runtime for a conversation. The underlying pi Agent
 * keeps the transcript across sendAgentMessage() calls.
 */
export function createAgentRuntime(options: CreateAgentRuntimeOptions): AgentRuntime {
  const apiKey = resolveApiKey(options.provider);
  const model = buildAgentModel(options.provider, options.model);
  const scenarioKey = options.scenario ?? 'general';
  const scenario = getAgentScenario(scenarioKey);
  const turnBudget = { turns: 0, maxTurns: DEFAULT_MAX_TURNS };

  const agent = new Agent({
    initialState: {
      systemPrompt: options.systemPrompt || scenario.systemPrompt,
      model,
      tools: scenario.tools,
    },
    streamFn: agentStreamFn,
    getApiKey: () => apiKey,
    shouldStopAfterTurn: () => turnBudget.turns >= turnBudget.maxTurns,
  });

  return {
    agent,
    provider: options.provider,
    model: options.model,
    scenario: scenarioKey,
    turnBudget,
  };
}

/**
 * Send one user message to the agent and run the loop to completion. Returns
 * the aggregated result for this message (reply text, tool steps, turns,
 * usage). The transcript stays on the runtime for follow-up messages.
 */
export async function sendAgentMessage(runtime: AgentRuntime, options: SendAgentMessageOptions): Promise<AgentRunResult> {
  const { agent, turnBudget } = runtime;
  if (agent.state.isStreaming) {
    throw new Error('The agent is still processing the previous message for this session.');
  }

  turnBudget.turns = 0;
  turnBudget.maxTurns = Math.min(options.maxTurns ?? DEFAULT_MAX_TURNS, MAX_TURNS_LIMIT);

  const steps: AgentStep[] = [];
  const pendingToolCalls = new Map<string, { toolName: string; args: unknown }>();
  const usage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let finalText = '';

  const emit = async (event: AgentRunEvent) => {
    if (options.onEvent) {
      await options.onEvent(event);
    }
  };

  const unsubscribe = agent.subscribe(async (event) => {
    switch (event.type) {
      case 'agent_start':
        await emit({ type: 'agent_start' });
        break;
      case 'turn_start':
        turnBudget.turns += 1;
        await emit({ type: 'turn_start', turn: turnBudget.turns });
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

  try {
    await agent.prompt(options.message);
    await agent.waitForIdle();
  } finally {
    unsubscribe();
  }

  if (agent.state.errorMessage) {
    throw new Error(`Agent run failed: ${agent.state.errorMessage}`);
  }

  return {
    result: finalText,
    steps,
    turns: turnBudget.turns,
    usage,
  };
}

/**
 * Extract a simplified transcript from the runtime's conversation history.
 */
export function getAgentTranscript(runtime: AgentRuntime): AgentTranscriptEntry[] {
  const entries: AgentTranscriptEntry[] = [];
  for (const message of runtime.agent.state.messages) {
    if (!message || typeof message !== 'object' || !('role' in message)) continue;
    if (message.role === 'user') {
      entries.push({ role: 'user', text: extractUserText(message.content) });
    } else if (message.role === 'assistant') {
      const assistantMessage = message as AssistantMessage;
      const text = extractAssistantText(assistantMessage);
      if (text.trim()) {
        entries.push({ role: 'assistant', text });
      }
    } else if (message.role === 'toolResult') {
      entries.push({
        role: 'tool',
        text: extractToolResultText(message),
        toolName: message.toolName,
        isError: false,
      });
    }
  }
  return entries;
}

export interface RunAgentOptions extends SendAgentMessageOptions, CreateAgentRuntimeOptions {
  task: string;
}

/**
 * Run a one-off tool-using agent task to completion (no session kept).
 */
export async function runAgent(options: Omit<RunAgentOptions, 'message'>): Promise<AgentRunResult> {
  const runtime = createAgentRuntime(options);
  return sendAgentMessage(runtime, {
    message: options.task,
    maxTurns: options.maxTurns,
    onEvent: options.onEvent,
  });
}
