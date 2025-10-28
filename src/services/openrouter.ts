import { openrouter } from '@openrouter/ai-sdk-provider';
import { generateObject, generateText, streamText } from 'ai';
import { z } from 'zod/v3';
import { openrouterConfig } from '../config/services';
import type { AIProvider } from './interfaces';

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