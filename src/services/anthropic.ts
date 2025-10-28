import Anthropic from "@anthropic-ai/sdk";
import { z } from 'zod/v3';
import { generateObject, generateText, streamText } from "ai";
import { anthropic } from '@ai-sdk/anthropic';
import type { AIProvider } from './interfaces';

//fallback to cheapest model
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307';

export function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('Anthropic API key is not configured. Set ANTHROPIC_API_KEY or use another provider.');
  }
  return new Anthropic({
    apiKey,
    baseURL: process.env.ANTHROPIC_BASE_URL,
  });
}

class AnthropicProvider implements AIProvider {
  name = 'anthropic' as const;

  async generateChatStructuredResponse(
    prompt: string,
    schema: z.ZodType,
    model?: string,
    temperature: number = 0
  ): Promise<any> {
    try {
      const modelToUse = anthropic(model || ANTHROPIC_MODEL);
      const result = await generateObject({
        model: modelToUse,
        schema,
        prompt,
        temperature
      });
      return result;
    } catch (error) {
      console.error('Anthropic structured response error: ', error);
      throw new Error(`Anthropic structured response error: ${error}`);
    }
  }

  async generateChatTextResponse(
    prompt: string,
    model?: string,
  ): Promise<any> {
    try {      
      const modelToUse = anthropic(model || ANTHROPIC_MODEL);
      const result = await generateText({
        model: modelToUse,
        prompt
      });
      console.log('ANTHROPIC RESULT', result);
      return result;
    } catch (error) {
      console.error('Anthropic text response error: ', error);
      throw new Error(`Anthropic text response error: ${error}`);
    }
  }

  async generateChatTextStreamResponse(
    prompt: string,
    model?: string,
  ): Promise<any> {
    try {
      const modelToUse = anthropic(model || ANTHROPIC_MODEL);
      const result = streamText({
        model: modelToUse,
        prompt
      });
      return result;
    } catch (error) {
      console.error('Anthropic streaming response error: ', error);
      throw new Error(`Anthropic streaming response error: ${error}`);
    }
  }

  async getAvailableModels(): Promise<string[]> {
    return [
      'claude-3-haiku-20240307',
    ];
  }
}

const provider = new AnthropicProvider();

export { ANTHROPIC_MODEL };
export default provider;