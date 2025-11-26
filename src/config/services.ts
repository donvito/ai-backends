// Service configuration for AI backends

export interface ServiceConfig {
  name: string;
  enabled: boolean;
  priority: number; // Lower number = higher priority
}

export interface OpenAIConfig extends ServiceConfig {
  apiKey: string;
  model: string;
  baseURL?: string;
}

export interface OllamaConfig extends ServiceConfig {
  baseURL: string;
  model: string;
  chatModel: string;
  timeout?: number;
}

export interface LMStudioConfig extends ServiceConfig {
  baseURL: string;
  model: string;
  chatModel: string;
  timeout?: number;
}

export interface AnthropicConfig extends ServiceConfig {
  apiKey: string;
  model: string;
}

export interface OpenRouterConfig extends ServiceConfig {
  apiKey: string;
  model: string;
  baseURL?: string;
}

export interface AIGatewayConfig extends ServiceConfig {
  apiKey: string;
  model: string;
  chatModel: string;
  baseURL?: string;
}

export interface LlamaCppConfig extends ServiceConfig {
  baseURL: string;
  model: string;
  chatModel: string;
  timeout?: number;
}

export interface GoogleConfig extends ServiceConfig {
  apiKey: string;
  model: string;
}

export interface BasetenConfig extends ServiceConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  chatModel: string;
  timeout?: number;
}

export interface LLMGatewayConfig extends ServiceConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  chatModel: string;
  timeout?: number;
}

// OpenAI Configuration
export const openaiConfig: OpenAIConfig = {
  name: 'OpenAI',
  enabled: !!process.env.OPENAI_API_KEY,
  priority: 1,
  apiKey: process.env.OPENAI_API_KEY || '',
  model: process.env.OPENAI_MODEL || 'gpt-4.1-nano',
  baseURL: process.env.OPENAI_BASE_URL,
};

// Ollama Configuration
export const ollamaConfig: OllamaConfig = {
  name: 'Ollama',
  enabled: process.env.OLLAMA_ENABLED === 'true' || process.env.OLLAMA_BASE_URL !== undefined,
  priority: 3,
  baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  model: process.env.OLLAMA_MODEL || 'llama3.2:latest',
  chatModel: process.env.OLLAMA_CHAT_MODEL || 'llama3.2:latest',
  timeout: parseInt(process.env.OLLAMA_TIMEOUT || '30000'),
};

// Anthropic Configuration
export const anthropicConfig: AnthropicConfig = {
  name: 'Anthropic',
  enabled: !!process.env.ANTHROPIC_API_KEY,
  priority: 2,
  apiKey: process.env.ANTHROPIC_API_KEY || '',
  model: process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307',
};

// OpenRouter Configuration
export const openrouterConfig: OpenRouterConfig = {
  name: 'OpenRouter',
  enabled: !!process.env.OPENROUTER_API_KEY,
  priority: 4,
  apiKey: process.env.OPENROUTER_API_KEY || '',
  model: process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet',
  baseURL: process.env.OPENROUTER_BASE_URL,
};

// LM Studio Configuration
export const lmstudioConfig: LMStudioConfig = {
  name: 'LMStudio',
  enabled: process.env.LMSTUDIO_ENABLED === 'true' || process.env.LMSTUDIO_BASE_URL !== undefined,
  priority: 5,
  baseURL: process.env.LMSTUDIO_BASE_URL || 'http://localhost:1234',
  model: process.env.LMSTUDIO_MODEL || 'gemma-3-270m-it',
  chatModel: process.env.LMSTUDIO_CHAT_MODEL || process.env.LMSTUDIO_MODEL || 'gemma-3-270m-it',
  timeout: parseInt(process.env.LMSTUDIO_TIMEOUT || '30000'),
};

export const aigatewayConfig: AIGatewayConfig = {
  name: 'AIGateway',
  enabled: process.env.AIGATEWAY_ENABLED === 'true' || process.env.AIGATEWAY_BASE_URL !== undefined,
  priority: 6,
  apiKey: process.env.AI_GATEWAY_API_KEY || '',
  model: process.env.AIGATEWAY_MODEL || '',
  chatModel: process.env.AIGATEWAY_CHAT_MODEL || '',
  baseURL: process.env.AIGATEWAY_BASE_URL || 'https://ai-gateway.vercel.sh/v1',
};

// LlamaCpp Configuration
export const llamacppConfig: LlamaCppConfig = {
  name: 'LlamaCpp',
  enabled: true,
  priority: 7,
  baseURL: process.env.LLAMACPP_BASE_URL || 'http://localhost:8080',
  model: process.env.LLAMACPP_MODEL || 'default',
  chatModel: process.env.LLAMACPP_CHAT_MODEL || process.env.LLAMACPP_MODEL || 'default',
  timeout: parseInt(process.env.LLAMACPP_TIMEOUT || '30000'),
};

// Google Gemini Configuration
export const googleConfig: GoogleConfig = {
  name: 'Google',
  enabled: !!process.env.GOOGLE_AI_API_KEY,
  priority: 8,
  apiKey: process.env.GOOGLE_AI_API_KEY || '',
  model: process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite',
};

// Baseten Configuration
export const basetenConfig: BasetenConfig = {
  name: 'Baseten',
  enabled: !!process.env.BASETEN_API_KEY,
  priority: 9,
  apiKey: process.env.BASETEN_API_KEY || '',
  baseURL: process.env.BASETEN_BASE_URL || 'https://inference.baseten.co/v1',
  model: process.env.BASETEN_MODEL || 'default',
  chatModel: process.env.BASETEN_CHAT_MODEL || process.env.BASETEN_MODEL || 'openai/gpt-oss-120b',
  timeout: parseInt(process.env.BASETEN_TIMEOUT || '30000'),
};

// LLM Gateway Configuration
export const llmgatewayConfig: LLMGatewayConfig = {
  name: 'LLMGateway',
  enabled: !!process.env.LLM_GATEWAY_API_KEY,
  priority: 10,
  apiKey: process.env.LLM_GATEWAY_API_KEY || '',
  baseURL: process.env.LLM_GATEWAY_BASE_URL || 'https://api.llmgateway.io/v1',
  model: process.env.LLM_GATEWAY_MODEL || 'gpt-oss-20b-free',
  chatModel: process.env.LLM_GATEWAY_CHAT_MODEL || process.env.LLM_GATEWAY_MODEL || 'gpt-oss-20b-free',
  timeout: parseInt(process.env.LLM_GATEWAY_TIMEOUT || '30000'),
};

// Available services
export const availableServices = [openaiConfig, anthropicConfig, ollamaConfig, openrouterConfig, lmstudioConfig, aigatewayConfig, llamacppConfig, googleConfig, basetenConfig, llmgatewayConfig];

// Get the primary service (highest priority enabled service)
export function getPrimaryService(): ServiceConfig | null {
  const enabledServices = availableServices
    .filter(service => service.enabled)
    .sort((a, b) => a.priority - b.priority);
  
  return enabledServices[0] || null;
}

// Get service by name
export function getServiceConfig(name: string): ServiceConfig | null {
  return availableServices.find(service => 
    service.name.toLowerCase() === name.toLowerCase()
  ) || null;
}

// Check if a service is available and enabled
export function isServiceEnabled(name: string): boolean {
  const service = getServiceConfig(name);
  return service ? service.enabled : false;
} 