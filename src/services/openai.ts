import OpenAI from "openai";
import { z } from 'zod/v3';
import { openai } from '@ai-sdk/openai';
import { generateObject, generateText, streamText } from "ai";
import type { AIProvider } from './interfaces';

const OPENAI_MODEL = 'gpt-4.1-nano';

export function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OpenAI API key is not configured. Set OPENAI_API_KEY or use another provider.');
  }
  return new OpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL,
  });
}

class OpenAIProvider implements AIProvider {
  name = 'openai' as const;

  async generateChatStructuredResponse(
    prompt: string,
    schema: z.ZodType,
    model?: string,
    temperature: number = 0
  ): Promise<any> {
    try {
      const modelToUse = openai.responses(model || OPENAI_MODEL);
      const result = await generateObject({
        model: modelToUse,
        schema,
        prompt,
        temperature
      });
      return result;
    } catch (error) {
      console.error('OpenAI structured response error: ', error);
      throw new Error(`OpenAI structured response error: ${error}`);
    }
  }

  async generateChatTextResponse(
    prompt: string,
    model?: string,
  ): Promise<any> {
    try {
      const modelToUse = openai.responses(model || OPENAI_MODEL);
      const result = await generateText({
        model: modelToUse,
        prompt
      });
      return result;
    } catch (error) {
      console.error('OpenAI text response error: ', error);
      throw new Error(`OpenAI text response error: ${error}`);
    }
  }

  async generateChatTextStreamResponse(
    prompt: string,
    model?: string,
  ): Promise<any> {
    try {
      const modelToUse = openai.responses(model || OPENAI_MODEL);
      const result = streamText({
        model: modelToUse,
        prompt
      });
      return result;
    } catch (error) {
      console.error('OpenAI streaming response error: ', error);
      throw new Error(`OpenAI streaming response error: ${error}`);
    }
  }

  async getAvailableModels(): Promise<string[]> {
    return [
      'gpt-4.1-nano',
    ];
  }
}

const provider = new OpenAIProvider();

export default provider;
export { OPENAI_MODEL };
