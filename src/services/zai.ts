import { z } from 'zod';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText, streamText, generateObject } from 'ai';
import type { AIProvider } from './interfaces';
import { zaiConfig } from '../config/services';

const normalizedBase = (zaiConfig.baseURL || 'https://api.z.ai/api/paas/v4').replace(/\/$/, '');
const ZAI_BASE_URL = normalizedBase;

const zai = createOpenAICompatible({
  name: 'zai',
  baseURL: `${ZAI_BASE_URL}`,
  headers: {
    'Authorization': `Bearer ${zaiConfig.apiKey}`,
  },
});

class ZAIProvider implements AIProvider {
  name = 'zai' as const;

  async generateChatStructuredResponse(
    prompt: string,
    schema: z.ZodType,
    model: string = zaiConfig.chatModel,
    temperature: number = 0
  ): Promise<any> {
    try {
      const modelToUse = model || zaiConfig.chatModel;

      // OpenAI-compatible APIs require the word "json" in the prompt when using response_format: json_object
      // The generateObject function uses json_object format, so we need to ensure "json" is in the prompt
      const promptWithJson = prompt.toLowerCase().includes('json')
        ? prompt
        : `${prompt}\n\nReturn the response as valid JSON.`;

      const result = await generateObject({
        model: zai(modelToUse),
        schema,
        prompt: promptWithJson,
        temperature,
      });

      return {
        object: result.object,
        finishReason: result.finishReason,
        usage: {
          promptTokens: result.usage?.promptTokens || 0,
          completionTokens: result.usage?.completionTokens || 0,
          totalTokens: result.usage?.totalTokens || 0,
        },
        warnings: result.warnings,
      };
    } catch (error) {
      throw new Error(`ZAI structured response error: ${error}`);
    }
  }

  async generateChatTextResponse(
    prompt: string,
    model?: string,
    temperature: number = 0
  ): Promise<any> {
    try {
      const modelToUse = zai(model || zaiConfig.model);

      const result = await generateText({
        model: modelToUse,
        prompt,
        temperature,
      });

      return result;
    } catch (error) {
      console.error('ZAI text response error: ', error);
      throw new Error(`ZAI text response error: ${error}`);
    }
  }

  async generateChatTextStreamResponse(
    prompt: string,
    model?: string,
    temperature: number = 0
  ): Promise<any> {
    try {
      const modelToUse = zai(model || zaiConfig.model);

      const result = await streamText({
        model: modelToUse,
        prompt,
        temperature,
      });

      return result;
    } catch (error) {
      console.error('ZAI streaming response error: ', error);
      throw new Error(`ZAI streaming response error: ${error}`);
    }
  }

  async getAvailableModels(): Promise<string[]> {
    return [
      'glm-4.5',
      'glm-4.6V',
      'glm-4.6v',
      'glm-4.6v-flash',
      'glm-4.5-air',
      'glm-4.5-airx',
    ];
  }

  /**
   * Vision API - Ask questions about an image
   * @param imageUrl - URL of the image to analyze
   * @param prompt - Question or prompt about the image
   * @param model - Vision model to use (default: glm-4.6v)
   * @param thinking - Enable thinking mode for detailed analysis
   */
  async analyzeImage(
    imageUrl: string,
    prompt: string,
    model: string = 'glm-4.6v',
    thinking: boolean = false
  ): Promise<ZAIVisionResponse> {
    const requestBody: ZAIVisionRequest = {
      model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt
            },
            {
              type: 'image_url',
              image_url: { url: imageUrl }
            }
          ]
        }
      ],
      max_tokens: 4096
    };

    if (thinking) {
      requestBody.thinking = { type: 'enabled' };
    }

    const response = await fetch(`${ZAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${zaiConfig.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ZAI Vision API error: ${errorText}`);
    }

    const data = await response.json() as ZAIAPIResponse;

    // Check for API-level errors in the response
    if ((data as any).error) {
      throw new Error(`ZAI Vision API error: ${JSON.stringify((data as any).error)}`);
    }

    return {
      text: data.choices?.[0]?.message?.content || '',
      thinking: data.choices?.[0]?.message?.reasoning_content,
      model,
      provider: 'zai',
      usage: data.usage ? {
        input_tokens: data.usage.prompt_tokens,
        output_tokens: data.usage.completion_tokens,
        total_tokens: data.usage.total_tokens
      } : undefined
    };
  }

  /**
   * OCR API - Extract structured data from an image
   * @param imageUrl - URL of the image to extract data from
   * @param extractionPrompt - Instructions for what data to extract
   * @param jsonSchema - Optional JSON schema to structure the output
   * @param model - Vision model to use (default: glm-4.6v)
   */
  async extractFromImage(
    imageUrl: string,
    extractionPrompt: string,
    jsonSchema?: object,
    model: string = 'glm-4.6v'
  ): Promise<ZAIOCRResponse> {
    let fullPrompt = extractionPrompt;

    if (jsonSchema) {
      fullPrompt = `You are a data extraction assistant. Analyze the image and extract information.

Task: ${extractionPrompt}

Return ONLY a JSON object with this exact structure (replace values with actual extracted data):
${JSON.stringify(jsonSchema, null, 2)}

Rules:
- Output ONLY the JSON object, nothing else
- No markdown, no code blocks, no explanations
- Use null for fields you cannot find
- Start your response with { and end with }`;
    } else {
      fullPrompt = `You are a data extraction assistant. Analyze the image and extract all visible information.

Task: ${extractionPrompt}

Return ONLY a JSON object containing the extracted data.

Rules:
- Output ONLY the JSON object, nothing else
- No markdown, no code blocks, no explanations
- Start your response with { and end with }`;
    }

    const requestBody: ZAIVisionRequest = {
      model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: fullPrompt
            },
            {
              type: 'image_url',
              image_url: { url: imageUrl }
            }
          ]
        }
      ],
      max_tokens: 4096
    };

    const response = await fetch(`${ZAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${zaiConfig.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ZAI OCR API error: ${errorText}`);
    }

    const data = await response.json() as ZAIAPIResponse;

    // Check for API-level errors in the response
    if ((data as any).error) {
      throw new Error(`ZAI OCR API error: ${JSON.stringify((data as any).error)}`);
    }

    // Try multiple ways to extract content from the response
    let rawText = '';
    const choice = data.choices?.[0];
    if (choice) {
      // Standard format: message.content as string
      if (typeof choice.message?.content === 'string') {
        rawText = choice.message.content;
      }
      // Some APIs return content as an array
      else if (Array.isArray(choice.message?.content)) {
        const textPart = (choice.message.content as any[]).find(
          (part: any) => part.type === 'text'
        );
        rawText = textPart?.text || '';
      }
      // Check for delta format (streaming response remnant)
      else if ((choice as any).delta?.content) {
        rawText = (choice as any).delta.content;
      }
    }

    // Try to parse as JSON using multiple strategies
    let extractedData: object | null = null;
    let parseError: string | undefined;

    const parseStrategies = [
      // Strategy 1: Extract from ```json ... ``` code blocks
      () => {
        const match = rawText.match(/```json\s*([\s\S]*?)```/);
        if (match) return JSON.parse(match[1].trim());
        return null;
      },
      // Strategy 2: Extract from ``` ... ``` code blocks (any language)
      () => {
        const match = rawText.match(/```\s*([\s\S]*?)```/);
        if (match) return JSON.parse(match[1].trim());
        return null;
      },
      // Strategy 3: Find JSON object pattern { ... }
      () => {
        const match = rawText.match(/\{[\s\S]*\}/);
        if (match) return JSON.parse(match[0]);
        return null;
      },
      // Strategy 4: Find JSON array pattern [ ... ]
      () => {
        const match = rawText.match(/\[[\s\S]*\]/);
        if (match) return JSON.parse(match[0]);
        return null;
      },
      // Strategy 5: Try parsing the entire response as JSON
      () => JSON.parse(rawText.trim())
    ];

    for (const strategy of parseStrategies) {
      try {
        const result = strategy();
        if (result !== null) {
          extractedData = result;
          break;
        }
      } catch {
        // Try next strategy
      }
    }

    if (!extractedData && rawText.trim()) {
      parseError = 'Could not extract valid JSON from the response. The raw text is shown below.';
    }

    return {
      rawText,
      extractedData,
      parseError,
      model,
      provider: 'zai',
      usage: data.usage ? {
        input_tokens: data.usage.prompt_tokens,
        output_tokens: data.usage.completion_tokens,
        total_tokens: data.usage.total_tokens
      } : undefined
    };
  }
}

// Type definitions for ZAI Vision/OCR API
interface ZAIVisionRequest {
  model: string;
  messages: Array<{
    role: string;
    content: Array<{
      type: string;
      text?: string;
      image_url?: { url: string };
    }>;
  }>;
  thinking?: { type: string };
  max_tokens?: number;
}

interface ZAIAPIResponse {
  choices?: Array<{
    message: {
      content: string;
      reasoning_content?: string;
    };
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ZAIVisionResponse {
  text: string;
  thinking?: string;
  model: string;
  provider: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
}

export interface ZAIOCRResponse {
  rawText: string;
  extractedData: object | null;
  parseError?: string;
  model: string;
  provider: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
}

const provider = new ZAIProvider();

export default provider;
export { ZAI_BASE_URL };
