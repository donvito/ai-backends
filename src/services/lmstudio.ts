import { z } from 'zod/v3';
import { lmstudioConfig, ollamaConfig } from '../config/services';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText, streamText, generateObject } from 'ai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import OpenAI from 'openai';
import type { AIProvider } from './interfaces';

// Build base URL ensuring single trailing /v1
const normalizedBase = (lmstudioConfig.baseURL || 'http://localhost:1234').replace(/\/$/, '');
const LMSTUDIO_BASE_URL = `${normalizedBase}`;

const openaiCompat = createOpenAICompatible({
  name: 'lmstudio',
  baseURL: `${LMSTUDIO_BASE_URL}/v1`,
});

class LmStudioProvider implements AIProvider {
  name = 'lmstudio' as const;

  async generateChatStructuredResponse(
    prompt: string,
    schema: z.ZodType,
    model?: string,
    temperature: number = 0
  ): Promise<any> {
    
    try {
      const modelToUse = openaiCompat(model || lmstudioConfig.chatModel);

      const result = await generateObject({
        model: modelToUse,
        schema,
        prompt,
        temperature,
      });
      
      return result;
    } catch (error) {
      console.error('LMStudio structured response error: ', error);
      throw new Error(`LMStudio structured response error: ${error}`);
    }
  }

  async generateChatTextResponse(
    prompt: string,
    model?: string,
    temperature: number = 0
  ): Promise<any> {
    try {
    const modelToUse = openaiCompat(model || lmstudioConfig.chatModel);

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
    const modelToUse = openaiCompat(model || lmstudioConfig.chatModel);

    const result = streamText({
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
}

const provider = new LmStudioProvider();

export default provider;
export { LMSTUDIO_BASE_URL };
