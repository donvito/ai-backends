import { z } from 'zod';
import { createOpenAICompatibleModel, generateText, streamText, generateObject } from './pi-ai';
import type { AIProvider } from './interfaces';
import { basetenConfig } from '../config/services';

const normalizedBase = (basetenConfig.baseURL || 'https://inference.baseten.co/v1').replace(/\/$/, '');
const BASETEN_BASE_URL = normalizedBase;

function baseten(modelId: string) {
  return createOpenAICompatibleModel({
    provider: 'baseten',
    modelId,
    baseUrl: BASETEN_BASE_URL,
    // Baseten uses the Api-Key authorization scheme; this header overrides the
    // default Bearer authorization set from the apiKey.
    headers: {
      'Authorization': `Api-Key ${basetenConfig.apiKey}`,
    },
  });
}

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
        apiKey: basetenConfig.apiKey || 'baseten',
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
      apiKey: basetenConfig.apiKey || 'baseten',
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
      apiKey: basetenConfig.apiKey || 'baseten',
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
