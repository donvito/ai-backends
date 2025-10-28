import { z } from 'zod/v3';
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
    'Authorization': `Api-Key ${basetenConfig.apiKey}`,
  },
});

class BasetenProvider implements AIProvider {
  name = 'baseten' as const;

  async generateChatStructuredResponse(
    prompt: string,
    schema: z.ZodType,
    model: string = basetenConfig.chatModel,
    temperature: number = 0
  ): Promise<any> {
    try {
      const modelToUse = model || basetenConfig.chatModel;
      
      const result = await generateObject({
        model: baseten(modelToUse),
        schema,
        prompt,
        temperature,
      });

      return {
        object: result.object,
        finishReason: result.finishReason,
        usage: {
          inputTokens: result.usage?.inputTokens || 0,
          outputTokens: result.usage?.outputTokens || 0,
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

    const result = streamText({
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
    return ['openai/gpt-oss-120b'];
  }
}

const provider = new BasetenProvider();

export default provider;
export { BASETEN_BASE_URL };
