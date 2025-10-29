import OpenAI from "openai";
import { z } from 'zod/v3';
import { openai } from '@ai-sdk/openai';
import { generateObject, generateText, streamText } from "ai";
import type { AIProvider } from './interfaces';
import { ocrPrompt } from '../utils/prompts';

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

  async ocr(
    images: string[],
    model?: string,
    stream: boolean = false,
    temperature: number = 0
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
    try {
      const client = getOpenAIClient();
      const modelToUse = model || 'gpt-4o'; // Use vision-capable model

      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: ocrPrompt() },
            ...images.map(image => ({
              type: 'image_url' as const,
              image_url: { url: image }
            }))
          ]
        }
      ];

      const completion = await client.chat.completions.create({
        model: modelToUse,
        messages: messages,
        temperature: temperature,
        stream: false, // For now, we'll implement non-streaming OCR
      });

      const response = completion.choices[0]?.message;
      if (!response) {
        throw new Error('No response from OpenAI');
      }

      return {
        model: completion.model,
        created_at: new Date().toISOString(),
        message: {
          role: response.role,
          content: response.content || ''
        },
        done_reason: 'stop',
        done: true,
        // OpenAI doesn't provide these metrics in the same way
        total_duration: undefined,
        load_duration: undefined,
        prompt_eval_count: completion.usage?.prompt_tokens,
        prompt_eval_duration: undefined,
        eval_count: completion.usage?.completion_tokens,
        eval_duration: undefined
      };
    } catch (error) {
      console.error('OpenAI OCR error: ', error);
      throw new Error(`OpenAI OCR error: ${error}`);
    }
  }

  async getAvailableModels(): Promise<string[]> {
    return [
      'gpt-4.1-nano',
      'gpt-4o', // Add vision-capable model
    ];
  }
}

const provider = new OpenAIProvider();

export default provider;
export { OPENAI_MODEL };
