import type { Api, AssistantMessage, Context, Model, ProviderStreams, StreamOptions } from '@earendil-works/pi-ai';
import { anthropicMessagesApi } from '@earendil-works/pi-ai/api/anthropic-messages.lazy';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import { openAIResponsesApi } from '@earendil-works/pi-ai/api/openai-responses.lazy';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// API implementations used by this app, dispatched by Model.api. The lazy
// factories only load the underlying implementation on first use.
const apiImplementations: Partial<Record<Api, ProviderStreams>> = {
  'openai-completions': openAICompletionsApi(),
  'anthropic-messages': anthropicMessagesApi(),
  'openai-responses': openAIResponsesApi(),
};

function streamsFor(model: Model<Api>): ProviderStreams {
  const implementation = apiImplementations[model.api];
  if (!implementation) {
    throw new Error(`Unsupported pi-ai API: ${model.api}`);
  }
  return implementation;
}

/**
 * Thin compatibility layer around @mariozechner/pi-ai that exposes the
 * generateText / streamText / generateObject result shapes the routes and
 * streaming handler already consume:
 *   - text results:       { text, finishReason, usage }
 *   - structured results: { object, finishReason, usage }
 *   - stream results:     { textStream, usage: Promise<Usage> }
 * Usage is always { promptTokens, completionTokens, totalTokens }.
 */

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface TextResult {
  text: string;
  finishReason: string;
  usage: TokenUsage;
}

export interface ObjectResult<T> {
  object: T;
  finishReason: string;
  usage: TokenUsage;
}

export interface StreamTextResult {
  textStream: AsyncIterable<string>;
  usage: Promise<TokenUsage>;
}

export interface OpenAICompatibleModelOptions {
  provider: string;
  modelId: string;
  baseUrl: string;
  apiKey?: string;
  headers?: Record<string, string>;
  supportsImageInput?: boolean;
}

interface GenerateOptions {
  model: Model<Api>;
  prompt: string;
  apiKey?: string;
  temperature?: number;
}

interface GenerateObjectOptions extends GenerateOptions {
  schema: z.ZodType;
}

/**
 * Build a pi-ai model descriptor for any OpenAI-compatible chat completions
 * endpoint (Ollama, LM Studio, llama.cpp, gateways, etc.).
 */
export function createOpenAICompatibleModel(options: OpenAICompatibleModelOptions): Model<'openai-completions'> {
  return {
    id: options.modelId,
    name: options.modelId,
    api: 'openai-completions',
    provider: options.provider,
    baseUrl: options.baseUrl.replace(/\/$/, ''),
    reasoning: false,
    input: options.supportsImageInput ? ['text', 'image'] : ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 32000,
    headers: options.headers,
  };
}

/**
 * Build a pi-ai model descriptor for the Anthropic Messages API.
 */
export function createAnthropicModel(modelId: string, baseUrl?: string): Model<'anthropic-messages'> {
  return {
    id: modelId,
    name: modelId,
    api: 'anthropic-messages',
    provider: 'anthropic',
    baseUrl: (baseUrl || 'https://api.anthropic.com').replace(/\/$/, ''),
    reasoning: false,
    input: ['text', 'image'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200000,
    maxTokens: 8192,
  };
}

/**
 * Build a pi-ai model descriptor for the OpenAI Responses API.
 */
export function createOpenAIResponsesModel(modelId: string, baseUrl?: string): Model<'openai-responses'> {
  return {
    id: modelId,
    name: modelId,
    api: 'openai-responses',
    provider: 'openai',
    baseUrl: (baseUrl || 'https://api.openai.com/v1').replace(/\/$/, ''),
    reasoning: false,
    input: ['text', 'image'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 32000,
  };
}

function toTokenUsage(message: AssistantMessage): TokenUsage {
  const input = message.usage?.input ?? 0;
  const output = message.usage?.output ?? 0;
  return {
    promptTokens: input,
    completionTokens: output,
    totalTokens: message.usage?.totalTokens ?? input + output,
  };
}

function extractText(message: AssistantMessage): string {
  return message.content
    .filter((block): block is Extract<typeof block, { type: 'text' }> => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

function assertSuccess(message: AssistantMessage): void {
  if (message.stopReason === 'error' || message.stopReason === 'aborted') {
    throw new Error(message.errorMessage || `LLM request failed (${message.stopReason})`);
  }
}

function buildContext(prompt: string): Context {
  return {
    messages: [{ role: 'user', content: prompt, timestamp: Date.now() }],
  };
}

function buildOptions(options: GenerateOptions): StreamOptions {
  const streamOptions: StreamOptions = {};
  if (options.apiKey) {
    streamOptions.apiKey = options.apiKey;
  }
  if (options.temperature !== undefined) {
    streamOptions.temperature = options.temperature;
  }
  return streamOptions;
}

/**
 * Generate a plain text response. Equivalent of the AI SDK's generateText.
 */
export async function generateText(options: GenerateOptions): Promise<TextResult> {
  const eventStream = streamsFor(options.model).stream(options.model, buildContext(options.prompt), buildOptions(options));
  const message = await eventStream.result();
  assertSuccess(message);
  return {
    text: extractText(message),
    finishReason: message.stopReason,
    usage: toTokenUsage(message),
  };
}

/**
 * Generate a streaming text response. Equivalent of the AI SDK's streamText.
 * Returns a textStream async iterable plus a usage promise that resolves once
 * the stream has completed.
 */
export function streamText(options: GenerateOptions): StreamTextResult {
  const eventStream = streamsFor(options.model).stream(options.model, buildContext(options.prompt), buildOptions(options));

  let resolveUsage!: (usage: TokenUsage) => void;
  let rejectUsage!: (error: unknown) => void;
  const usage = new Promise<TokenUsage>((resolve, reject) => {
    resolveUsage = resolve;
    rejectUsage = reject;
  });
  // The stream consumer may fail before ever awaiting the usage promise;
  // avoid unhandled rejection noise while still rejecting for awaiters.
  usage.catch(() => {});

  async function* textStream(): AsyncGenerator<string> {
    try {
      for await (const event of eventStream) {
        if (event.type === 'text_delta') {
          yield event.delta;
        } else if (event.type === 'error') {
          throw new Error(event.error.errorMessage || `LLM request failed (${event.reason})`);
        }
      }
      const message = await eventStream.result();
      assertSuccess(message);
      resolveUsage(toTokenUsage(message));
    } catch (error) {
      rejectUsage(error);
      throw error;
    }
  }

  return { textStream: textStream(), usage };
}

/**
 * Generate a structured response validated against a Zod schema. Equivalent of
 * the AI SDK's generateObject. The JSON schema derived from the Zod schema is
 * embedded in the prompt and the model output is parsed and validated.
 */
export async function generateObject<T>(options: GenerateObjectOptions): Promise<ObjectResult<T>> {
  const jsonSchema = zodToJsonSchema(options.schema);
  const structuredPrompt = [
    options.prompt,
    '',
    'Respond ONLY with a single valid JSON object that conforms to the following JSON schema:',
    JSON.stringify(jsonSchema),
    '',
    'Do not include markdown code fences, comments, or any text outside the JSON object.',
  ].join('\n');

  const eventStream = streamsFor(options.model).stream(options.model, buildContext(structuredPrompt), buildOptions(options));
  const message = await eventStream.result();
  assertSuccess(message);

  const rawText = extractText(message);
  const parsed = parseJsonObject(rawText);
  const validation = options.schema.safeParse(parsed);
  if (!validation.success) {
    throw new Error(`Response failed schema validation: ${validation.error.message}`);
  }

  return {
    object: validation.data as T,
    finishReason: message.stopReason,
    usage: toTokenUsage(message),
  };
}

/**
 * Parse a JSON object out of raw model output, tolerating markdown code
 * fences and surrounding prose.
 */
function parseJsonObject(rawText: string): unknown {
  const candidates: (() => string | null)[] = [
    () => {
      const match = rawText.match(/```json\s*([\s\S]*?)```/);
      return match ? match[1].trim() : null;
    },
    () => {
      const match = rawText.match(/```\s*([\s\S]*?)```/);
      return match ? match[1].trim() : null;
    },
    () => {
      const start = rawText.indexOf('{');
      const end = rawText.lastIndexOf('}');
      return start !== -1 && end > start ? rawText.slice(start, end + 1) : null;
    },
    () => {
      const start = rawText.indexOf('[');
      const end = rawText.lastIndexOf(']');
      return start !== -1 && end > start ? rawText.slice(start, end + 1) : null;
    },
    () => rawText.trim() || null,
  ];

  let lastError: unknown;
  for (const candidate of candidates) {
    const text = candidate();
    if (!text) continue;
    try {
      return JSON.parse(text);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Failed to parse JSON from model response: ${String(lastError ?? 'no JSON found')}`);
}
