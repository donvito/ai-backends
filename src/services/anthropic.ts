import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
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

export async function generateChatStructuredResponse(
  prompt: string,
  schema: z.ZodType,
  model?: string,
  temperature: number = 0
): Promise<any> {
  
  const modelToUse = anthropic(model || ANTHROPIC_MODEL);

  const result = await generateObject({
    model: modelToUse,
    schema: schema,
    prompt: prompt,
    temperature: temperature
  });

  return result;
}

export async function generateChatTextResponse(
  prompt: string,
  model?: string,
): Promise<any> {  

  console.log('model', model);
  
  const modelToUse = anthropic(model || ANTHROPIC_MODEL);

  const result = await generateText({
    model: modelToUse,
    prompt: prompt
  });

  console.log('ANTHROPIC RESULT', result);

  return result;
}

export async function generateChatTextStreamResponse(
  prompt: string,
  model?: string,
): Promise<any> {  

  console.log('streaming model', model);
  
  const modelToUse = anthropic(model || ANTHROPIC_MODEL);

  const result = await streamText({
    model: modelToUse,
    prompt: prompt
  });

  return result;
}

export { ANTHROPIC_MODEL };

/**
 * Get available models from Anthropic
 * Note: Anthropic supports hundreds of models, this returns commonly used ones
 */
export async function getAvailableModels(): Promise<string[]> {
  // Anthropic supports hundreds of models
  // Returning some popular ones as examples
  return [
    'claude-3-haiku-20240307',
  ];
}

const provider: AIProvider = {
  name: 'anthropic',
  generateChatStructuredResponse,
  generateChatTextResponse,
  generateChatTextStreamResponse,
  getAvailableModels,
  // no vision support
};

export default provider;