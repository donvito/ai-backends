import { z } from 'zod/v3';
import { 
  openaiConfig, 
  ollamaConfig, 
  anthropicConfig,
  openrouterConfig,
  lmstudioConfig,
  aigatewayConfig,
  llamacppConfig,
  googleConfig,
  isServiceEnabled 
} from "../config/services";
import { llmRequestSchema } from "../schemas/v1/llm";
import { ocrPrompt } from "../utils/prompts";
import { serviceRegistry } from "./registry";
import type { ProviderName } from "./interfaces";

enum Provider {
  openai = 'openai',
  anthropic = 'anthropic',
  ollama = 'ollama',
  openrouter = 'openrouter',
  lmstudio = 'lmstudio',
  aigateway = 'aigateway',
  llamacpp = 'llamacpp',
  google = 'google',
}

// Service types
export type AIService = ProviderName;

export interface ImageDescriptionResponse {
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
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
  service?: string; // Which service was actually used
}

/**
 * Check if a service is available
 */
export async function checkServiceAvailability(service: AIService): Promise<boolean> {
  switch (service) {
    case Provider.openai:
      return isServiceEnabled('OpenAI');
    case Provider.anthropic:
      return isServiceEnabled('Anthropic');
    case Provider.ollama:
      return isServiceEnabled('Ollama');
    case Provider.openrouter:
      return isServiceEnabled('OpenRouter');
    case Provider.lmstudio:
      return isServiceEnabled('LMStudio');
    case Provider.aigateway:
      return isServiceEnabled('AIGateway');
    case Provider.llamacpp:
      return isServiceEnabled('LlamaCpp');
    case Provider.google:
      return isServiceEnabled('Google');
    default:
      return false;
  }
}

/**
 * Generate an image description using AI services with vision capabilities
 */
export async function generateImageResponse(
  images: string[],
  service: AIService = Provider.ollama,
  model?: string,    
  stream: boolean = false,
  temperature: number = 0.3
): Promise<ImageDescriptionResponse> {
  const provider = serviceRegistry.get(service);
  if (!provider) {
    throw new Error(`Provider not registered: ${service}`);
  }
  if (typeof provider.describeImage !== 'function') {
    throw new Error(`Vision capabilities not supported for service: ${service}`);
  }

  const result = await provider.describeImage(images, model, stream, temperature);
  return {
    ...result,
    usage: {
      input_tokens: result.prompt_eval_count || 0,
      output_tokens: result.eval_count || 0,
      total_tokens: (result.prompt_eval_count || 0) + (result.eval_count || 0),
    },
    service: service
  };
}

/**
 * Extract text from images using OCR (Optical Character Recognition)
 */
export async function extractOCRText(
  images: string[],
  service: AIService = Provider.ollama,
  model?: string,    
  stream: boolean = false,
  temperature: number = 0
): Promise<ImageDescriptionResponse> {
  const provider = serviceRegistry.get(service);
  if (!provider) {
    throw new Error(`Provider not registered: ${service}`);
  }
  if (typeof provider.describeImage !== 'function') {
    throw new Error(`Vision capabilities not supported for service: ${service}`);
  }

  const result = await provider.describeImage(images, model, stream, temperature, ocrPrompt());
  return {
    ...result,
    usage: {
      input_tokens: result.prompt_eval_count || 0,
      output_tokens: result.eval_count || 0,
      total_tokens: (result.prompt_eval_count || 0) + (result.eval_count || 0),
    },
    service: service
  };
}

/**
 * Get available models for a specific service
 */
export async function getAvailableModels(service: AIService): Promise<string[]> {
  if (!(await checkServiceAvailability(service))) {
    return [];
  }
  
  const provider = serviceRegistry.get(service);
  if (!provider) return [];
  return provider.getAvailableModels();
}

/**
 * Get service status information
 */
export async function getServiceStatus() {
  const status = {
    openai: {
      enabled: isServiceEnabled('OpenAI'),
      available: await checkServiceAvailability(Provider.openai),
      config: {
        model: openaiConfig.model,
        hasApiKey: !!openaiConfig.apiKey,
      }
    },
    anthropic: {
      enabled: isServiceEnabled('Anthropic'),
      available: await checkServiceAvailability(Provider.anthropic),
      config: {
        model: anthropicConfig.model,
        hasApiKey: !!anthropicConfig.apiKey,
      }
    },
    ollama: {
      enabled: isServiceEnabled('Ollama'),
      available: await checkServiceAvailability(Provider.ollama),
      config: {
        baseURL: ollamaConfig.baseURL,
        model: ollamaConfig.model,
        chatModel: ollamaConfig.chatModel,
      }
    },
    openrouter: {
      enabled: isServiceEnabled('OpenRouter'),
      available: await checkServiceAvailability(Provider.openrouter),
      config: {
        model: openrouterConfig.model,
        hasApiKey: !!openrouterConfig.apiKey,
        baseURL: openrouterConfig.baseURL,
      }
    },
    lmstudio: {
      enabled: isServiceEnabled('LMStudio'),
      available: await checkServiceAvailability(Provider.lmstudio),
      config: {
        baseURL: lmstudioConfig.baseURL,
        model: lmstudioConfig.model,
        chatModel: lmstudioConfig.chatModel,
      }
    },
    aigateway: {
      enabled: isServiceEnabled('AIGateway'),
      available: await checkServiceAvailability(Provider.aigateway),
      config: {
        baseURL: aigatewayConfig.baseURL,
        model: aigatewayConfig.model,
        chatModel: aigatewayConfig.chatModel,
      }
    },
    llamacpp: {
      enabled: isServiceEnabled('LlamaCpp'),
      available: await checkServiceAvailability(Provider.llamacpp),
      config: {
        baseURL: llamacppConfig.baseURL,
      }
    },
    google: {
      enabled: isServiceEnabled('Google'),
      available: await checkServiceAvailability(Provider.google),
      config: {
        model: googleConfig.model,
        hasApiKey: !!googleConfig.apiKey,
      }
    }
  };
  
  
  return {
    services: status,  
  };
} 

export async function processStructuredOutputRequest(
  prompt: string,
  schema: z.ZodType,
  config: z.infer<typeof llmRequestSchema>,
  temperature: number = 0
): Promise<any> {
  const providerName = config.provider as ProviderName;
  const model = config.model;

  const provider = serviceRegistry.get(providerName);
  if (!provider) {
    throw new Error(`Unsupported service: ${providerName}`);
  }
  return provider.generateChatStructuredResponse(prompt, schema, model, temperature);
}   

export async function processTextOutputRequest(
  prompt: string,
  config: z.infer<typeof llmRequestSchema>,  
): Promise<any> {
  const providerName = config.provider as ProviderName;
  const model = config.model;
  const stream = config.stream || false;

  console.log('MODEL TO USE', model, 'STREAMING:', stream);

  // If streaming is enabled, use streaming functions
  if (stream) {
    return processTextOutputStreamRequest(prompt, config);
  }

  const provider = serviceRegistry.get(providerName);
  if (!provider) {
    throw new Error(`Unsupported service: ${providerName}`);
  }
  return provider.generateChatTextResponse(prompt, model);
}

export async function processTextOutputStreamRequest(
  prompt: string,
  config: z.infer<typeof llmRequestSchema>,  
): Promise<any> {
  const providerName = config.provider as ProviderName;
  const model = config.model;

  console.log('STREAMING MODEL TO USE', model);

  const provider = serviceRegistry.get(providerName);
  if (!provider) {
    throw new Error(`Unsupported service: ${providerName}`);
  }
  return provider.generateChatTextStreamResponse(prompt, model);
}   
