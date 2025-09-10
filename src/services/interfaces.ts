import { z } from 'zod';

export type ProviderName = 'openai' | 'anthropic' | 'ollama' | 'openrouter' | 'lmstudio' | 'aigateway' | 'llamacpp';

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

  // Optional vision capability
  describeImage?(
    images: string[],
    model?: string,
    stream?: boolean,
    temperature?: number
  ): Promise<any>;
}