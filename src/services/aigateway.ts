import { z } from 'zod'
import { aigatewayConfig } from '../config/services'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText, streamText, generateObject } from 'ai'
import OpenAI from 'openai'
import type { AIProvider } from './interfaces'

const normalizedBase = (aigatewayConfig.baseURL || '').replace(/\/$/, '')
const AIGATEWAY_BASE_URL = `${normalizedBase}`

const aigateway = createOpenAICompatible({
  name: 'aigateway',
  baseURL: `${aigatewayConfig.baseURL}`,
  apiKey: `${aigatewayConfig.apiKey}`
})

export async function generateChatStructuredResponse<T extends z.ZodType>(
  prompt: string,
  schema: T,
  model: string = aigatewayConfig.model,
  temperature: number = 0
): Promise<any> {
  try {
    const result = await generateObject({
      model: aigateway(model || aigatewayConfig.model),
      schema,
      prompt,
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
    throw new Error(`AI Gateway structured response error: ${error}`);
  }
}

export async function generateChatTextResponse(
  prompt: string,
  model?: string,
  temperature: number = 0
): Promise<any> {
  
  const modelToUse = aigateway(model || aigatewayConfig.chatModel);

  const result = await generateText({
    model: modelToUse,
    prompt: prompt,
    temperature: temperature,
    toolChoice: 'none',
  });
  
  return result;
}

export async function generateChatTextStreamResponse(
  prompt: string,
  model?: string,
  temperature: number = 0
): Promise<any> {
  
  const modelToUse = aigateway(model || aigatewayConfig.chatModel);

  const result = await streamText({
    model: modelToUse,
    prompt: prompt,
    temperature: temperature,
    toolChoice: 'none',
  });
  
  return result;
}

export async function getAvailableModels(): Promise<string[]> {
  try {
    const response = await fetch(`${AIGATEWAY_BASE_URL}/v1/models`)
    if (!response.ok) return []
    const data = await response.json()
    if (Array.isArray(data?.data)) {
      return data.data.map((m: any) => m.id).filter((id: any) => typeof id === 'string')
    }
    return []
  } catch (error) {
    return []
  }
}

function parseAiGatewayStructuredResponse<T>(
  completion: OpenAI.Chat.Completions.ChatCompletion,
  schema: z.ZodType<T>,
  modelFallback: string
) {
  const choice = Array.isArray(completion?.choices) ? completion.choices[0] : undefined
  const contentRaw = choice?.message?.content

  if (typeof contentRaw !== 'string') {
    throw new Error('AI Gateway returned non-string content for structured response')
  }

  let parsedObject: unknown
  try {
    parsedObject = JSON.parse(contentRaw)
  } catch (err) {
    throw new Error(`Failed to parse assistant JSON content: ${String(err)}`)
  }

  const validation = schema.safeParse(parsedObject)
  if (!validation.success) {
    throw new Error(`Response failed schema validation: ${validation.error.message}`)
  }

  return {
    object: validation.data,
    finishReason: (choice as any)?.finish_reason ?? (choice as any)?.finishReason ?? null,
    usage: {
      promptTokens: (completion as any)?.usage?.prompt_tokens ?? 0,
      completionTokens: (completion as any)?.usage?.completion_tokens ?? 0,
      totalTokens: (completion as any)?.usage?.total_tokens ?? 0,
    },
    id: completion?.id,
    model: (completion as any)?.model ?? modelFallback,
  }
}

const provider: AIProvider = {
  name: 'aigateway',
  generateChatStructuredResponse,
  generateChatTextResponse,
  generateChatTextStreamResponse,
  getAvailableModels,
  // no vision support
};

export default provider;
export { AIGATEWAY_BASE_URL }