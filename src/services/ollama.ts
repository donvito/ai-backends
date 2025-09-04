import { z } from "zod";
import { describeImagePrompt } from "../utils/prompts";
import type { AIProvider } from './interfaces';

// Configuration
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3:4b';
const OLLAMA_CHAT_MODEL = process.env.OLLAMA_CHAT_MODEL || 'qwen3:4b';
const OLLAMA_VISION_MODEL = process.env.OLLAMA_VISION_MODEL || 'llama3.2-vision:11b';

import { createOllama } from 'ollama-ai-provider';
import { generateObject, generateText, streamText } from "ai";

const ollama = createOllama({
  baseURL: OLLAMA_BASE_URL + '/api',
});

interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

/**
 * Make a request to Ollama API
 */
async function ollamaRequest(endpoint: string, payload: any): Promise<any> {
  const url = `${OLLAMA_BASE_URL}${endpoint}`;
  const startTime = Date.now();
  
  console.log('[OLLAMA REQUEST]');
  console.log('URL:', url);
  console.log('Payload:', JSON.stringify(payload, null, 2));
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),    
  });

  const duration = Date.now() - startTime;

  if (!response.ok) {
    const errorText = await response.text();
    console.log('[OLLAMA ERROR]');
    console.log('Duration:', `${duration}ms`);
    console.log('Status:', `${response.status} ${response.statusText}`);
    console.log('Error Response:', errorText);
    throw new Error(`Ollama API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const responseData = await response.json();
  
  console.log('[OLLAMA RESPONSE]');
  console.log('Duration:', `${duration}ms`);
  console.log('Status:', response.status);
  console.log('Raw Response:', JSON.stringify(responseData, null, 2));
  
  // Log key metrics if available
  if (responseData.prompt_eval_count || responseData.eval_count) {
    console.log('Token Usage:');
    console.log('  • Input tokens:', responseData.prompt_eval_count || 0);
    console.log('  • Output tokens:', responseData.eval_count || 0);
    console.log('  • Total tokens:', (responseData.prompt_eval_count || 0) + (responseData.eval_count || 0));
  }

  return responseData;
}


/**
 * Get available models from Ollama
 */
export async function getAvailableModels(): Promise<string[]> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status}`);
    }
    const data = await response.json();
    return data.models?.map((model: any) => model.name) || [];
  } catch (error) {
    console.warn('Failed to fetch available models:', error);
    return [];
  }
}

/**
 * Get available vision models from Ollama
 */
export async function getAvailableVisionModels(): Promise<string[]> {
  try {
   const supportedModels = await getAvailableModels();
   return supportedModels.filter(model => model.includes('vision'));
  } catch (error) {
    console.warn('Failed to get supported models:', error);
    return [];
  }
}

/**
 * Validate if a model is supported for vision tasks
 */
export async function isVisionModelSupported(service: string, model: string): Promise<boolean> {
  
  const ollamaVisionModels = ['llama3.2-vision:11b'];
  if (service === 'ollama') {
    return ollamaVisionModels.includes(model);
  }

  return false;
}

/**
 * Describe an image using Ollama vision model
 */
export async function describeImage(
  images: string[],
  model?: string,
  stream: boolean = false,
  temperature: number = 0.3
): Promise<{
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done_reason: string;
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}> {
  const modelToUse = model || OLLAMA_VISION_MODEL;

  const messages = [
    {
      role: 'user',
      content: describeImagePrompt(),
      images: images
    }
  ];
  
  const payload = {
    model: modelToUse,
    messages: messages,
    stream: stream,
    options: {
      temperature: temperature,
    }
  };

  const response: OllamaChatResponse = await ollamaRequest('/api/chat', payload);
  
  return {
    model: response.model,
    created_at: response.created_at,
    message: response.message,
    done_reason: response.done ? 'stop' : 'length',
    done: response.done,
    total_duration: response.total_duration,
    load_duration: response.load_duration,
    prompt_eval_count: response.prompt_eval_count,
    prompt_eval_duration: response.prompt_eval_duration,
    eval_count: response.eval_count,
    eval_duration: response.eval_duration
  };
}

export async function generateChatStructuredResponse(
  prompt: string,
  schema: z.ZodType,
  model?: string,
  temperature: number = 0
): Promise<any> {  
  
  const modelToUse = ollama(model || OLLAMA_CHAT_MODEL);

  const result = await generateObject({
    model: modelToUse,
    prompt: prompt,
    schema: schema,
    temperature: temperature,    
  });

  return result;
}

export async function generateChatTextResponse(
  prompt: string,
  model?: string,
): Promise<any> {  
  
  const modelToUse = ollama(model || OLLAMA_CHAT_MODEL);
  
  console.log('OLLAMA_BASE_URL', OLLAMA_BASE_URL);

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
  
  const modelToUse = ollama(model || OLLAMA_CHAT_MODEL);
  
  console.log('OLLAMA STREAMING - BASE_URL', OLLAMA_BASE_URL);

  const result = await streamText({
    model: modelToUse,
    prompt: prompt
  });

  return result;
}

const provider: AIProvider = {
  name: 'ollama',
  generateChatStructuredResponse,
  generateChatTextResponse,
  generateChatTextStreamResponse,
  getAvailableModels,
  describeImage,
};

export default provider;

export { OLLAMA_BASE_URL, OLLAMA_MODEL, OLLAMA_CHAT_MODEL, OLLAMA_VISION_MODEL }; 