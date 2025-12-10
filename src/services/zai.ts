import { z } from 'zod';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText, streamText, generateObject } from 'ai';
import type { AIProvider } from './interfaces';
import { zaiConfig } from '../config/services';

const normalizedBase = (zaiConfig.baseURL || 'https://api.z.ai/api/paas/v4').replace(/\/$/, '');
const ZAI_BASE_URL = normalizedBase;

const zai = createOpenAICompatible({
  name: 'zai',
  baseURL: `${ZAI_BASE_URL}`,
  headers: {
    'Authorization': `Bearer ${zaiConfig.apiKey}`,
  },
});

class ZAIProvider implements AIProvider {
  name = 'zai' as const;

  async generateChatStructuredResponse(
    prompt: string,
    schema: z.ZodType,
    model: string = zaiConfig.chatModel,
    temperature: number = 0
  ): Promise<any> {
    try {
      const modelToUse = model || zaiConfig.chatModel;

      // OpenAI-compatible APIs require the word "json" in the prompt when using response_format: json_object
      // The generateObject function uses json_object format, so we need to ensure "json" is in the prompt
      const promptWithJson = prompt.toLowerCase().includes('json')
        ? prompt
        : `${prompt}\n\nReturn the response as valid JSON.`;

      const result = await generateObject({
        model: zai(modelToUse),
        schema,
        prompt: promptWithJson,
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
      throw new Error(`ZAI structured response error: ${error}`);
    }
  }

  async generateChatTextResponse(
    prompt: string,
    model?: string,
    temperature: number = 0
  ): Promise<any> {
    try {
      const modelToUse = zai(model || zaiConfig.model);

      const result = await generateText({
        model: modelToUse,
        prompt,
        temperature,
      });

      return result;
    } catch (error) {
      console.error('ZAI text response error: ', error);
      throw new Error(`ZAI text response error: ${error}`);
    }
  }

  async generateChatTextStreamResponse(
    prompt: string,
    model?: string,
    temperature: number = 0
  ): Promise<any> {
    console.log('ZAI_BASE_URL', ZAI_BASE_URL);
    
    try {
      const modelToUse = zai(model || zaiConfig.model);

      const result = await streamText({
        model: modelToUse,
        prompt,
        temperature,
      });

      return result;
    } catch (error) {
      console.error('ZAI streaming response error: ', error);
      throw new Error(`ZAI streaming response error: ${error}`);
    }
  }

  async getAvailableModels(): Promise<string[]> {
    return [
      'glm-4.5',
      'glm-4.6V',
      'glm-4.6v',
      'glm-4.6v-flash',
      'glm-4.5-air',
      'glm-4.5-airx',
    ];
  }
}

const provider = new ZAIProvider();

export default provider;
export { ZAI_BASE_URL };
