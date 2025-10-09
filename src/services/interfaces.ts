import { z } from 'zod';
import type { LanguageModelV1 } from 'ai';

export type ProviderName = 'openai' | 'anthropic' | 'ollama' | 'openrouter' | 'lmstudio' | 'aigateway' | 'llamacpp' | 'google';

export interface AIProvider {
  name: ProviderName;

  generateChatStructuredResponse(
    prompt: string,
    schema: z.ZodType,
    model?: string,
    temperature?: number
  ): Promise<any>;

  generateChatTextResponse(
    prompt: string,
    model?: string,
    temperature?: number
  ): Promise<any>;

  generateChatTextStreamResponse(
    prompt: string,
    model?: string,
    temperature?: number
  ): Promise<any>;

  getAvailableModels(): Promise<string[]>;

  // For Mastra agent support - returns AI SDK model instance
  getModelInstance(
    model?: string,
    temperature?: number
  ): LanguageModelV1;

  // Optional vision capability
  describeImage?(
    images: string[],
    model?: string,
    stream?: boolean,
    temperature?: number
  ): Promise<any>;

}