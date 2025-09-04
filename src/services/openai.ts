import OpenAI from "openai";
import { z } from "zod";
import { openai } from '@ai-sdk/openai';
import { generateObject, generateText, streamText } from "ai";
import type { AIProvider } from './interfaces';

const OPENAI_MODEL = 'gpt-4.1-nano'

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

export async function generateChatStructuredResponse(
  prompt: string,
  schema: z.ZodType,
  model?: string,
  temperature: number = 0
): Promise<any> {
  
  const modelToUse = openai.responses(model || OPENAI_MODEL);

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
  
  const modelToUse = openai.responses(model || OPENAI_MODEL);

  const result = await generateText({
    model: modelToUse,
    prompt: prompt
  });

  return result;
}

export async function generateChatTextStreamResponse(
  prompt: string,
  model?: string,
): Promise<any> {  

  console.log('streaming model', model);
  
  const modelToUse = openai.responses(model || OPENAI_MODEL);

  const result = await streamText({
    model: modelToUse,
    prompt: prompt
  });

  return result;
}


export { OPENAI_MODEL } 

/**
 * Get available models from OpenAI
 * Note: OpenAI supports hundreds of models, this returns commonly used ones
 */
export async function getAvailableModels(): Promise<string[]> {
  // OpenAI supports hundreds of models
  // Returning some popular ones as examples
  return [
    'gpt-4.1-nano',
  ];
}

const provider: AIProvider = {
  name: 'openai',
  generateChatStructuredResponse,
  generateChatTextResponse,
  generateChatTextStreamResponse,
  getAvailableModels,
  // no vision support
};

export default provider;
