import { z } from 'zod';
import { lmstudioConfig } from '../config/services';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText, streamText, generateObject } from 'ai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import OpenAI from 'openai';
import type { AIProvider } from './interfaces';

// Build base URL ensuring single trailing /v1
const normalizedBase = (lmstudioConfig.baseURL || 'http://localhost:1234').replace(/\/$/, '');
const LMSTUDIO_BASE_URL = `${normalizedBase}`;

const lmstudio = createOpenAICompatible({
  name: 'lmstudio',
  baseURL: `${LMSTUDIO_BASE_URL}/v1`,
});

const openAIClient = new OpenAI({
  baseURL: `${LMSTUDIO_BASE_URL}/v1`,
  apiKey: process.env.LMSTUDIO_API_KEY || 'lm-studio',
});


function parseLmStudioStructuredResponse<T>(
  completion: OpenAI.Chat.Completions.ChatCompletion,
  schema: z.ZodType<T>,
  modelFallback: string
) {
  const choice = Array.isArray(completion?.choices) ? completion.choices[0] : undefined;
  const contentRaw = choice?.message?.content;

  if (typeof contentRaw !== 'string') {
    throw new Error('LM Studio returned non-string content for structured response');
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

class LmStudioProvider implements AIProvider {
  name = 'lmstudio' as const;

  async generateChatStructuredResponse(
    prompt: string,
    schema: z.ZodType,
    model?: string,
    temperature: number = 0
  ): Promise<any> {
    const modelId = model || lmstudioConfig.chatModel;

    // Convert Zod schema to JSON Schema for LM Studio's OpenAI-compatible endpoint
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

    return parseLmStudioStructuredResponse(completion, schema, modelId);
  }

  async generateChatTextResponse(
    prompt: string,
    model?: string,
    temperature: number = 0
  ): Promise<any> {
    try {
    const modelToUse = lmstudio(model || lmstudioConfig.chatModel);

    const result = await generateText({
      model: modelToUse,
      prompt,
      temperature,
      toolChoice: 'none',
    });

    return result;
    } catch (error) {
      console.error('LMStudio text response error: ', error);
      throw new Error(`LMStudio text response error: ${error}`);
    }
  }

  async generateChatTextStreamResponse(
    prompt: string,
    model?: string,
    temperature: number = 0
  ): Promise<any> {
    try {
    const modelToUse = lmstudio(model || lmstudioConfig.chatModel);

    const result = await streamText({
      model: modelToUse,
      prompt,
      temperature,
      toolChoice: 'none',
    });

      return result;
    } catch (error) {
      console.error('LMStudio streaming response error: ', error);
      throw new Error(`LMStudio streaming response error: ${error}`);
    }
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await fetch(`${LMSTUDIO_BASE_URL}/v1/models`);
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

    getModelInstance(model?: string, temperature: number = 0.3) {
      return lmstudio(model || lmstudioConfig.chatModel, { temperature }) as any;
    }

  getModelInstance(model?: string, temperature: number = 0.3): any {
    return lmstudio(model || lmstudioConfig.chatModel, { temperature });
  }
}

const provider = new LmStudioProvider();

export default provider;
export { LMSTUDIO_BASE_URL };
