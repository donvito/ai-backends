import { z } from 'zod';
import { createOpenAICompatibleModel, generateText, streamText, generateObject } from './pi-ai';
import type { AIProvider } from './interfaces';
import { llmgatewayConfig } from '../config/services';

const normalizedBase = (llmgatewayConfig.baseURL || 'https://api.llmgateway.io/v1').replace(/\/$/, '');
const LLM_GATEWAY_BASE_URL = normalizedBase;

function llmgateway(modelId: string) {
  return createOpenAICompatibleModel({
    provider: 'llmgateway',
    modelId,
    baseUrl: LLM_GATEWAY_BASE_URL,
  });
}

class LLMGatewayProvider implements AIProvider {
  name = 'llmgateway' as const;

  async generateChatStructuredResponse(
    prompt: string,
    schema: z.ZodType,
    model: string = llmgatewayConfig.chatModel,
    temperature: number = 0
  ): Promise<any> {
    try {
      const modelToUse = model || llmgatewayConfig.chatModel;
      
      const result = await generateObject({
        model: llmgateway(modelToUse),
        apiKey: llmgatewayConfig.apiKey,
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
      throw new Error(`LLM Gateway structured response error: ${error}`);
    }
  }
  
  
  async generateChatTextResponse(
    prompt: string,
    model?: string,
    temperature: number = 0
  ): Promise<any> {
    try {
    const modelToUse = llmgateway(model || llmgatewayConfig.model);

    const result = await generateText({
      model: modelToUse,
      apiKey: llmgatewayConfig.apiKey,
      prompt,
      temperature,
    });

    return result;
    } catch (error) {
      console.error('LLM Gateway text response error: ', error);
      throw new Error(`LLM Gateway text response error: ${error}`);
    }
  }

  async generateChatTextStreamResponse(
    prompt: string,
    model?: string,
    temperature: number = 0
  ): Promise<any> {
    try {
    const modelToUse = llmgateway(model || llmgatewayConfig.model);

    const result = streamText({
      model: modelToUse,
      apiKey: llmgatewayConfig.apiKey,
      prompt,
      temperature,
    });

      return result;
    } catch (error) {
      console.error('LLM Gateway streaming response error: ', error);
      throw new Error(`LLM Gateway streaming response error: ${error}`);
    }
  }

  async getAvailableModels(): Promise<string[]> {
    return [
      'gpt-oss-20b-free',
      'glm-4.5-air-free',
      'llama-3.3-70b-instruct-free',
      'glm-4.5-flash',
      'llama-4-maverick-free',
      'kimi-k2-0905-free',
      'llama-4-scout-free',
    ];
  }
}

const provider = new LLMGatewayProvider();

export default provider;
export { LLM_GATEWAY_BASE_URL };
