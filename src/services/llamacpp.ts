import { z } from 'zod/v3';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateObject, generateText, streamText } from 'ai';
import type { AIProvider } from './interfaces';
import { llamacppConfig } from '../config/services';

// Build base URL ensuring single trailing /v1
const normalizedBase = (llamacppConfig.baseURL || 'http://localhost:8080').replace(/\/$/, '');
const LLAMACPP_BASE_URL = `${normalizedBase}`;

const openaiCompat = createOpenAICompatible({
  name: 'llamacpp',
  baseURL: `${LLAMACPP_BASE_URL}`,
});

class LlamaCppProvider implements AIProvider {
  name = 'llamacpp' as const;

  async generateChatStructuredResponse(
    prompt: string,
    schema: z.ZodType,
    model?: string,
    temperature: number = 0
  ): Promise<any> {
    
    try {
      const modelToUse = openaiCompat(model || llamacppConfig.chatModel);

      const result = await generateObject({
        model: modelToUse,
        schema,
        prompt,
        temperature,
      });
      
      return result;
    } catch (error) {
      console.error('LlamaCpp structured response error: ', error);
      throw new Error(`LlamaCpp structured response error: ${error}`);
    }
  }
  
  
  async generateChatTextResponse(
    prompt: string,
    model?: string,
    temperature: number = 0
  ): Promise<any> {
    try {
    const modelToUse = openaiCompat(model || 'default');

    const result = await generateText({
      model: modelToUse,
      prompt,
      temperature,
    });

    return result;
    } catch (error) {
      console.error('LlamaCpp text response error: ', error);
      throw new Error(`LlamaCpp text response error: ${error}`);
    }
  }

  async generateChatTextStreamResponse(
    prompt: string,
    model?: string,
    temperature: number = 0
  ): Promise<any> {
    try {
    const modelToUse = openaiCompat(model || 'default');

    const result = streamText({
      model: modelToUse,
      prompt,
      temperature,
    });

      return result;
    } catch (error) {
      console.error('LlamaCpp streaming response error: ', error);
      throw new Error(`LlamaCpp streaming response error: ${error}`);
    }
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await fetch(`${LLAMACPP_BASE_URL}/v1/models`);
      if (!response.ok) return [];
      const data = await response.json();
      if (Array.isArray(data?.data)) {
        return data.data.map((m: any) => m.id).filter((id: any) => typeof id === 'string');
      }
      return [];
    } catch (_error) {
      return [];
    }
  }
}

const provider = new LlamaCppProvider();

export default provider;
export { LLAMACPP_BASE_URL };