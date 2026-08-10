import { z } from 'zod';
import { openrouterConfig } from '../config/services';
import { createOpenAICompatibleModel, generateObject, generateText, streamText } from './pi-ai';
import type { AIProvider } from './interfaces';

const OPENROUTER_BASE_URL = openrouterConfig.baseURL || 'https://openrouter.ai/api/v1';

function openrouter(modelId: string) {
  return createOpenAICompatibleModel({
    provider: 'openrouter',
    modelId,
    baseUrl: OPENROUTER_BASE_URL,
  });
}

class OpenRouterProvider implements AIProvider {
  name = 'openrouter' as const;

  /**
   * Generate a structured response for chat using OpenRouter
   */
  async generateChatStructuredResponse(
    prompt: string,
    schema: z.ZodType,
    model: string = openrouterConfig.model,
    temperature: number = 0
  ): Promise<any> {
    try {
      const result = await generateObject({
        model: openrouter(model),
        apiKey: openrouterConfig.apiKey,
        schema,
        prompt,
        temperature,
      });
      return result;
    } catch (error) {
      throw new Error(`OpenRouter structured response error: ${error}`);
    }
  }

  /**
   * Generate a text response using OpenRouter
   */
  async generateChatTextResponse(
    prompt: string,
    model: string = openrouterConfig.model
  ): Promise<any> {
    try {
      const result = await generateText({
        model: openrouter(model),
        apiKey: openrouterConfig.apiKey,
        prompt,
      });
      return result;
    } catch (error) {
      throw new Error(`OpenRouter text response error: ${error}`);
    }
  }

  /**
   * Generate a streaming text response using OpenRouter
   */
  async generateChatTextStreamResponse(
    prompt: string,
    model: string = openrouterConfig.model
  ): Promise<any> {
    try {
      const result = streamText({
        model: openrouter(model),
        apiKey: openrouterConfig.apiKey,
        prompt,
      });
      return result;
    } catch (error) {
      throw new Error(`OpenRouter streaming response error: ${error}`);
    }
  }

  /**
   * Get available models from OpenRouter
   * Note: OpenRouter supports hundreds of models, this returns commonly used ones
   */
  async getAvailableModels(): Promise<string[]> {
    return [
      'openai/gpt-4.1-nano',
    ];
  }
}

const provider = new OpenRouterProvider();

export default provider;
