import { z } from 'zod';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText, streamText } from 'ai';
import type { AIProvider } from './interfaces';
import OpenAI from 'openai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { llamacppConfig } from '../config/services';

// Build base URL ensuring single trailing /v1
const normalizedBase = (llamacppConfig.baseURL || 'http://localhost:8080').replace(/\/$/, '');
const LLAMACPP_BASE_URL = `${normalizedBase}`;

const llamacpp = createOpenAICompatible({
  name: 'llamacpp',
  baseURL: `${LLAMACPP_BASE_URL}`,
});

const openAIClient = new OpenAI({
  baseURL: `${LLAMACPP_BASE_URL}/v1`,
  apiKey: process.env.LLAMACPP_API_KEY || 'llama-cpp',
});

function parseLlamaCppStructuredResponse<T>(
  completion: OpenAI.Chat.Completions.ChatCompletion,
  schema: z.ZodType<T>,
  modelFallback: string
) {
  const choice = Array.isArray(completion?.choices) ? completion.choices[0] : undefined;
  const contentRaw = choice?.message?.content;

  if (typeof contentRaw !== 'string') {
    throw new Error('LlamaCpp returned non-string content for structured response');
  }

  let parsedObject: unknown;
  try {
    parsedObject = JSON.parse(contentRaw);
  } catch (err) {
    throw new Error(`Failed to parse assistant JSON content: ${String(err)}`);
  }

  const validation = schema.safeParse(parsedObject);
  if (!validation.success) {
    throw new Error(`Response failed schema validation: ${validation.error.message}`);
  }

  return {
    object: validation.data,
    finishReason: (choice as any)?.finish_reason ?? (choice as any)?.finishReason ?? null,
    usage: {
      promptTokens: (completion as any)?.usage?.prompt_tokens ?? 0,
      completionTokens: (completion as any)?.usage?.completion_tokens ?? 0,
      totalTokens: (completion as any)?.usage?.total_tokens ?? 0,
    },
    id: completion?.id,
    model: (completion as any)?.model ?? modelFallback,
  };

} 

class LlamaCppProvider implements AIProvider {
  name = 'llamacpp' as const;

  async generateChatStructuredResponse(
    prompt: string,
    schema: z.ZodType,
    model?: string,
    temperature: number = 0
  ): Promise<any> {
    const modelId = model || llamacppConfig.chatModel;

    const jsonSchema = zodToJsonSchema(schema);

    const completion = await openAIClient.chat.completions.create({
      model: modelId,
      messages: [{ role: 'user', content: prompt }],
      temperature: typeof temperature === 'number' ? temperature : 0,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'structured_output',
          strict: true,
          schema: jsonSchema,
        },
      } as any,
    });

    return parseLlamaCppStructuredResponse(completion, schema, modelId);
  }
  
  
  async generateChatTextResponse(
    prompt: string,
    model?: string,
    temperature: number = 0
  ): Promise<any> {
    try {
    const modelToUse = llamacpp(model || 'default');

    const result = await generateText({
      model: modelToUse,
      prompt,
      temperature,
    });

    return result;
    } catch (error) {
      console.error('LlamaCpp text response error: ', error);
      throw new Error(`LlamaCpp text response error: ${error}`);
    }
  }

  async generateChatTextStreamResponse(
    prompt: string,
    model?: string,
    temperature: number = 0
  ): Promise<any> {
    try {
    const modelToUse = llamacpp(model || 'default');

    const result = await streamText({
      model: modelToUse,
      prompt,
      temperature,
    });

      return result;
    } catch (error) {
      console.error('LlamaCpp streaming response error: ', error);
      throw new Error(`LlamaCpp streaming response error: ${error}`);
    }
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await fetch(`${LLAMACPP_BASE_URL}/v1/models`);
      if (!response.ok) return [];
      const data = await response.json();
      if (Array.isArray(data?.data)) {
        return data.data.map((m: any) => m.id).filter((id: any) => typeof id === 'string');
      }
      return [];
    } catch (_error) {
      return [];
    }
  }
}

const provider = new LlamaCppProvider();

export default provider;
export { LLAMACPP_BASE_URL };