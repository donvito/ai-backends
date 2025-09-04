import { openrouter } from '@openrouter/ai-sdk-provider';
import { generateObject, generateText, streamText } from 'ai';
import { z } from 'zod';
import { openrouterConfig } from '../config/services';
import type { AIProvider } from './interfaces';

/**
 * Generate a structured response for chat using OpenRouter
 */
export async function generateChatStructuredResponse<T extends z.ZodType>(
  prompt: string,
  schema: T,
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
export async function generateChatTextResponse(
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
export async function generateChatTextStreamResponse(
  prompt: string,
  model: string = openrouterConfig.model
): Promise<any> {
  try {
    const result = await streamText({
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
export async function getAvailableModels(): Promise<string[]> {
  // OpenRouter supports hundreds of models
  // Returning some popular ones as examples
  return [
    'openai/gpt-4.1-nano',
  ];
}

const provider: AIProvider = {
  name: 'openrouter',
  generateChatStructuredResponse,
  generateChatTextResponse,
  generateChatTextStreamResponse,
  getAvailableModels,
  // no vision support
};

export default provider;