import { z } from 'zod/v3';
import { describeImagePrompt } from "../utils/prompts";
import type { AIProvider } from './interfaces';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { ollamaConfig } from '../config/services';

import { generateObject, generateText, streamText } from "ai";

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

const openaiCompat = createOpenAICompatible({
  name: 'ollama',
  baseURL: `${ollamaConfig.baseURL}/v1`,
});

/**
 * Make a request to Ollama API
 */
async function ollamaRequest(endpoint: string, payload: any): Promise<any> {
  const url = `${ ollamaConfig.baseURL}${endpoint}`;
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

class OllamaProvider implements AIProvider {
  name = 'ollama' as const;

  async describeImage(
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
    const modelToUse = model ||  "llama3.2:latest";

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

  async generateChatStructuredResponse(
    prompt: string,
    schema: z.ZodType,
    model?: string,
    temperature: number = 0
  ): Promise<any> {
    
    try {
      const modelToUse = openaiCompat(model || ollamaConfig.chatModel);

      const result = await generateObject({
        model: modelToUse,
        schema,
        prompt,
        temperature,
      });

      return result;      
    } catch (error) {
      console.error('Ollama structured response error: ', error);
      throw new Error(`Ollama structured response error: ${error}`);
    }
  }

  async generateChatTextResponse(
    prompt: string,
    model?: string,
  ): Promise<any> {
    try {
    const modelToUse = openaiCompat(model || ollamaConfig.chatModel);
    console.log('OLLAMA_BASE_URL', ollamaConfig.baseURL);
    const result = await generateText({
      model: modelToUse,
      prompt: prompt
      });
      return result;
    } catch (error) {
      console.error('Ollama text response error: ', error);
      throw new Error(`Ollama text response error: ${error}`);
    }
  }

  async generateChatTextStreamResponse(
    prompt: string,
    model?: string,
  ): Promise<any> {
    try {  
    const modelToUse = openaiCompat(model || ollamaConfig.chatModel);
    console.log('OLLAMA STREAMING - BASE_URL', ollamaConfig.baseURL);
    const result = streamText({
      model: modelToUse,
      prompt: prompt
    });
      return result;
    } catch (error) {
      console.error('Ollama streaming response error: ', error);
      throw new Error(`Ollama streaming response error: ${error}`);
    }
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await fetch(`${ollamaConfig.baseURL}/api/tags`);
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
}

const provider = new OllamaProvider();

export default provider;
export { OllamaProvider };