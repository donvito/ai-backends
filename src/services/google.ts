import { z } from "zod";
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateObject, generateText, streamText } from "ai";
import type { AIProvider } from './interfaces';

const GEMINI_MODEL = 'gemini-2.5-flash-lite';

export function getGoogleProvider() {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error('Google AI API key is not configured. Set GOOGLE_AI_API_KEY or use another provider.');
  }
  
  return createOpenAICompatible({
    name: 'google',
    apiKey: apiKey,
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  });
}

class GeminiProvider implements AIProvider {
  name = 'google' as const;

  async generateChatStructuredResponse(
    prompt: string,
    schema: z.ZodType,
    model?: string,
    temperature: number = 0
  ): Promise<any> {
    try {
        const gemini = getGoogleProvider();
      const result = await generateObject({
        model: gemini(model || GEMINI_MODEL),
        schema,
        prompt,
        temperature
      });
      return result;
    } catch (error) {
      console.error('Gemini structured response error: ', error);
      throw new Error(`Gemini structured response error: ${error}`);
    }
  }

  async generateChatTextResponse(
    prompt: string,
    model?: string,
    temperature: number = 0
  ): Promise<any> {
    try {
        const gemini = getGoogleProvider();
      const result = await generateText({
        model: gemini(model || GEMINI_MODEL),
        prompt,
        temperature
      });
      return result;
    } catch (error) {
      console.error('Gemini text response error: ', error);
      throw new Error(`Gemini text response error: ${error}`);
    }
  }

  async generateChatTextStreamResponse(
    prompt: string,
    model?: string,
    temperature: number = 0
  ): Promise<any> {
    try {
        const gemini = getGoogleProvider();
      const result = streamText({
        model: gemini(model || GEMINI_MODEL),
        prompt,
        temperature
      });
      return result;
    } catch (error) {
      console.error('Gemini streaming response error: ', error);
      throw new Error(`Gemini streaming response error: ${error}`);
    }
  }

  async getAvailableModels(): Promise<string[]> {
    return [
        'gemini-2.5-flash-lite',
        'gemini-2.5-flash',
        'gemini-2.5-pro',
        'gemini-2.5-flash-lite',
        'gemini-2.5-flash',
        'gemini-2.5-pro',
    ];
  }

}

const provider = new GeminiProvider();

export default provider;
export { GEMINI_MODEL };
