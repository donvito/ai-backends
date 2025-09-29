import { z } from "zod";
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateObject, generateText, streamText } from "ai";
import type { AIProvider } from './interfaces';

const GEMINI_MODEL = 'gemini-2.5-flash-lite';

export function getGeminiProvider() {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error('Google AI API key is not configured. Set GOOGLE_AI_API_KEY or use another provider.');
  }
  
  return createOpenAICompatible({
    name: 'gemini',
    apiKey: apiKey,
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  });
}

class GeminiProvider implements AIProvider {
  name = 'gemini' as const;

  async generateChatStructuredResponse(
    prompt: string,
    schema: z.ZodType,
    model?: string,
    temperature: number = 0
  ): Promise<any> {
    try {
      const provider = getGeminiProvider();
      const modelToUse = provider(model || GEMINI_MODEL);
      
      const result = await generateObject({
        model: modelToUse,
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
      const provider = getGeminiProvider();
      const modelToUse = provider(model || GEMINI_MODEL);
      
      const result = await generateText({
        model: modelToUse,
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
      const provider = getGeminiProvider();
      const modelToUse = provider(model || GEMINI_MODEL);
      
      const result = await streamText({
        model: modelToUse,
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

  // Vision capability - Gemini supports image analysis
  async describeImage(
    images: string[],
    model?: string,
    stream: boolean = false,
    temperature: number = 0
  ): Promise<any> {
    try {
      const provider = getGeminiProvider();
      const modelToUse = provider(model || 'gemini-pro-vision');

      const prompt = "Describe what you see in this image.";
      
      if (stream) {
        const result = await streamText({
          model: modelToUse,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                ...images.map(image => ({ type: 'image' as const, image }))
              ]
            }
          ],
          temperature
        });
        return result;
      } else {
        const result = await generateText({
          model: modelToUse,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                ...images.map(image => ({ type: 'image' as const, image }))
              ]
            }
          ],
          temperature
        });
        return result;
      }
    } catch (error) {
      console.error('Gemini image description error: ', error);
      throw new Error(`Gemini image description error: ${error}`);
    }
  }
}

const provider = new GeminiProvider();

export default provider;
export { GEMINI_MODEL };
