import { z } from 'zod';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText, streamText, generateObject } from 'ai';
import type { AIProvider } from './interfaces';
import { basetenConfig } from '../config/services';

const normalizedBase = (basetenConfig.baseURL || 'https://inference.baseten.co/v1').replace(/\/$/, '');
const BASETEN_BASE_URL = normalizedBase;

const baseten = createOpenAICompatible({
  name: 'baseten',
  baseURL: `${BASETEN_BASE_URL}`,
  headers: {
    'Authorization': `Api-Key ${process.env.BASETEN_API_KEY}`,
  },
});

class BasetenProvider implements AIProvider {
  name = 'baseten' as const;

  async generateChatStructuredResponse(
    prompt: string,
    schema: z.ZodType,
    model: string = basetenConfig.model,
    temperature: number = 0
  ): Promise<any> {
    try {
      
      const result = await generateObject({
        model: baseten(model || basetenConfig.chatModel),
        schema,
        prompt,
        temperature,
      });

      return {
        object: result.object,
        finishReason: result.finishReason,
        usage: {
          promptTokens: result.usage?.promptTokens || 0,
          completionTokens: result.usage?.completionTokens || 0,
          totalTokens: result.usage?.totalTokens || 0,
        },
        warnings: result.warnings,
      };
    } catch (error) {
      throw new Error(`Baseten structured response error: ${error}`);
    }
  }
  
  
  async generateChatTextResponse(
    prompt: string,
    model?: string,
    temperature: number = 0
  ): Promise<any> {
    try {
    const modelToUse = baseten(model || basetenConfig.model);

    const result = await generateText({
      model: modelToUse,
      prompt,
      temperature,
    });

    return result;
    } catch (error) {
      console.error('Baseten text response error: ', error);
      throw new Error(`Baseten text response error: ${error}`);
    }
  }

  async generateChatTextStreamResponse(
    prompt: string,
    model?: string,
    temperature: number = 0
  ): Promise<any> {
    try {
    const modelToUse = baseten(model || basetenConfig.model);

    const result = await streamText({
      model: modelToUse,
      prompt,
      temperature,
    });

      return result;
    } catch (error) {
      console.error('Baseten streaming response error: ', error);
      throw new Error(`Baseten streaming response error: ${error}`);
    }
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await fetch(`${BASETEN_BASE_URL}/openai/v1/models`, {
        headers: {
          'Authorization': `Api-Key ${process.env.BASETEN_API_KEY}`,
          'Content-Type': 'application/json',
        },
      });
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

const provider = new BasetenProvider();

export default provider;
export { BASETEN_BASE_URL };
