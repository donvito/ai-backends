import {z} from "zod";
import { createOpenAICompatibleModel, generateObject, generateText, streamText } from './pi-ai';
import type {AIProvider} from './interfaces';

const GEMINI_MODEL = 'gemini-2.5-flash-lite';
const GEMINI_OPENAI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';

export function getGoogleModel(modelId: string) {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error('Google AI API key is not configured. Set GOOGLE_AI_API_KEY or use another provider.');
  }

  return {
    model: createOpenAICompatibleModel({
      provider: 'google',
      modelId,
      baseUrl: GEMINI_OPENAI_BASE_URL,
    }),
    apiKey,
  };
}

class GoogleProvider implements AIProvider {
  name = 'google' as const;

  async generateChatStructuredResponse(
    prompt: string,
    schema: z.ZodType,
    model?: string,
    temperature: number = 0
  ): Promise<any> {
    try {
        const { model: gemini, apiKey } = getGoogleModel(model || GEMINI_MODEL);
        return await generateObject({
          model: gemini,
          apiKey,
          schema,
          prompt,
          temperature
      });
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
        const { model: gemini, apiKey } = getGoogleModel(model || GEMINI_MODEL);
        return await generateText({
          model: gemini,
          apiKey,
          prompt,
          temperature
      });
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
        const { model: gemini, apiKey } = getGoogleModel(model || GEMINI_MODEL);
        return streamText({
          model: gemini,
          apiKey,
          prompt,
          temperature
      });
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
    ];
  }

}

const provider = new GoogleProvider();

export default provider;
export { GEMINI_MODEL };
