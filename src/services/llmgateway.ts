import { z } from 'zod';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText, streamText, generateObject } from 'ai';
import type { AIProvider } from './interfaces';
import { llmgatewayConfig } from '../config/services';

const normalizedBase = (llmgatewayConfig.baseURL || 'https://api.llmgateway.io/v1').replace(/\/$/, '');
const LLM_GATEWAY_BASE_URL = normalizedBase;

const llmgateway = createOpenAICompatible({
  name: 'llmgateway',
  baseURL: `${LLM_GATEWAY_BASE_URL}`,
  headers: {
    'Authorization': `Bearer ${llmgatewayConfig.apiKey}`,
  },
});

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
      
      // OpenAI-compatible APIs require the word "json" in the prompt when using response_format: json_object
      // The generateObject function uses json_object format, so we need to ensure "json" is in the prompt
      const promptWithJson = prompt.toLowerCase().includes('json') 
        ? prompt 
        : `${prompt}\n\nReturn the response as valid JSON.`;
      
      const result = await generateObject({
        model: llmgateway(modelToUse),
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

    const result = await streamText({
      model: modelToUse,
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
