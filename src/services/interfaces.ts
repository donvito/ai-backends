import { z } from 'zod/v3';

export type ProviderName = 'openai' | 'anthropic' | 'ollama' | 'openrouter' | 'lmstudio' | 'aigateway' | 'llamacpp' | 'google' | 'baseten';

export interface OCROptions {
  temperature?: number;
  language?: string;
  format?: 'plain' | 'markdown';
}

export interface OCRResult {
  text: string;
  model: string;
  created_at?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
  rawResponse?: unknown;
}

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

  // Optional OCR capability
  performOCR?(
    images: string[],
    model?: string,
    options?: OCROptions
  ): Promise<OCRResult>;
}