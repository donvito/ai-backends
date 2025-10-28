import { z } from 'zod/v3';
import { aigatewayConfig } from '../config/services';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText, streamText, generateObject } from 'ai';
import type { AIProvider } from './interfaces';

const normalizedBase = (aigatewayConfig.baseURL || '').replace(/\/$/, '');
const AIGATEWAY_BASE_URL = `${normalizedBase}`;

const aigateway = createOpenAICompatible({
  name: 'aigateway',
  baseURL: `${aigatewayConfig.baseURL}`,
  apiKey: `${aigatewayConfig.apiKey}`
});

class AIGatewayProvider implements AIProvider {
  name = 'aigateway' as const;

  async generateChatStructuredResponse(
    prompt: string,
    schema: z.ZodType,
    model: string = aigatewayConfig.model,
    temperature: number = 0
  ): Promise<any> {
    try {
      const result = await generateObject({
        model: aigateway(model || aigatewayConfig.model),
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
      throw new Error(`AI Gateway structured response error: ${error}`);
    }
  }

  async generateChatTextResponse(
    prompt: string,
    model?: string,
    temperature: number = 0
  ): Promise<any> {
    try {
    const modelToUse = aigateway(model || aigatewayConfig.chatModel);

    const result = await generateText({
      model: modelToUse,
      prompt,
      temperature,
      toolChoice: 'none',
    });

      return result;
    } catch (error) {
      console.error('AI Gateway text response error: ', error);
      throw new Error(`AI Gateway text response error: ${error}`);
    }
  }

  async generateChatTextStreamResponse(
    prompt: string,
    model?: string,
    temperature: number = 0
  ): Promise<any> {
    try {
    const modelToUse = aigateway(model || aigatewayConfig.chatModel);

    const result = streamText({
      model: modelToUse,
      prompt,
      temperature,
      toolChoice: 'none',
    });

    return result;
    } catch (error) {
      console.error('AI Gateway streaming response error: ', error);
      throw new Error(`AI Gateway streaming response error: ${error}`);
    }
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await fetch(`${AIGATEWAY_BASE_URL}/v1/models`);
      if (!response.ok) return [];
      const data = await response.json();
      if (Array.isArray(data?.data)) {
        return data.data
          .map((m: any) => m.id)
          .filter((id: any) => typeof id === 'string');
      }
      return [];
    } catch (_error) {
      return [];
    }
  }
}

const provider = new AIGatewayProvider();

export default provider;
export { AIGATEWAY_BASE_URL };