import { z } from 'zod';
import { aigatewayConfig } from '../config/services';
import { createOpenAICompatibleModel, generateText, streamText, generateObject } from './pi-ai';
import type { AIProvider } from './interfaces';

const normalizedBase = (aigatewayConfig.baseURL || '').replace(/\/$/, '');
const AIGATEWAY_BASE_URL = `${normalizedBase}`;

function aigateway(modelId: string) {
  return createOpenAICompatibleModel({
    provider: 'vercel-ai-gateway',
    modelId,
    baseUrl: AIGATEWAY_BASE_URL,
  });
}

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
        apiKey: aigatewayConfig.apiKey,
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
      apiKey: aigatewayConfig.apiKey,
      prompt,
      temperature,
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
      apiKey: aigatewayConfig.apiKey,
      prompt,
      temperature,
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