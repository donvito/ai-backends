import * as fs from 'fs';
import * as path from 'path';
import {
  aigatewayConfig,
  anthropicConfig,
  basetenConfig,
  googleConfig,
  llmgatewayConfig,
  openaiConfig,
  openrouterConfig,
  zaiConfig,
} from '../config/services';

/**
 * Persisted store for admin-managed configuration: custom agents, custom
 * (HTTP) tools, and provider API key overrides.
 *
 * Data is kept in a JSON file (default: data/admin-config.json, override with
 * ADMIN_CONFIG_PATH). The file contains API keys in plain text, so it is
 * gitignored — treat it with the same care as a .env file.
 */

export interface CustomToolDefinition {
  name: string;
  label: string;
  description: string;
  /** JSON Schema for the tool arguments. Must be an object schema. */
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  /** HTTP request the tool performs when the agent calls it. */
  http: {
    method: 'GET' | 'POST';
    /** Target URL. `{placeholders}` are replaced with matching argument values. */
    url: string;
    headers?: Record<string, string>;
  };
}

export interface CustomAgentDefinition {
  /** Unique slug used as payload.scenario, e.g. "travel-planner". */
  key: string;
  label: string;
  description: string;
  systemPrompt: string;
  /** Tool names from the built-in and custom tool registries. */
  tools: string[];
  sampleTasks: string[];
}

interface AdminConfigFile {
  agents: CustomAgentDefinition[];
  tools: CustomToolDefinition[];
  /** Provider id → API key override. */
  keys: Record<string, string>;
}

export const MAX_CUSTOM_AGENTS = 50;
export const MAX_CUSTOM_TOOLS = 100;

const CONFIG_PATH = process.env.ADMIN_CONFIG_PATH || path.resolve(process.cwd(), 'data', 'admin-config.json');

const emptyConfig = (): AdminConfigFile => ({ agents: [], tools: [], keys: {} });

let config: AdminConfigFile = emptyConfig();

function loadConfig(): void {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) as Partial<AdminConfigFile>;
      config = {
        agents: Array.isArray(raw.agents) ? raw.agents : [],
        tools: Array.isArray(raw.tools) ? raw.tools : [],
        keys: raw.keys && typeof raw.keys === 'object' ? raw.keys : {},
      };
    }
  } catch (error) {
    console.error(`[WARN] Failed to load admin config from ${CONFIG_PATH}; starting empty:`, error);
    config = emptyConfig();
  }
}

function saveConfig(): void {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// Provider API keys
// ---------------------------------------------------------------------------

interface ManagedProvider {
  /** Mutable service config object whose apiKey/enabled we override. */
  config: { apiKey: string; enabled: boolean };
  envVar: string;
  /** apiKey value that came from the environment at startup. */
  envValue: string;
}

const managedProviders: Record<string, ManagedProvider> = {
  openai: { config: openaiConfig, envVar: 'OPENAI_API_KEY', envValue: openaiConfig.apiKey },
  anthropic: { config: anthropicConfig, envVar: 'ANTHROPIC_API_KEY', envValue: anthropicConfig.apiKey },
  openrouter: { config: openrouterConfig, envVar: 'OPENROUTER_API_KEY', envValue: openrouterConfig.apiKey },
  google: { config: googleConfig, envVar: 'GOOGLE_AI_API_KEY', envValue: googleConfig.apiKey },
  aigateway: { config: aigatewayConfig, envVar: 'AI_GATEWAY_API_KEY', envValue: aigatewayConfig.apiKey },
  baseten: { config: basetenConfig, envVar: 'BASETEN_API_KEY', envValue: basetenConfig.apiKey },
  llmgateway: { config: llmgatewayConfig, envVar: 'LLM_GATEWAY_API_KEY', envValue: llmgatewayConfig.apiKey },
  zai: { config: zaiConfig, envVar: 'ZAI_API_KEY', envValue: zaiConfig.apiKey },
};

export const managedProviderIds = Object.keys(managedProviders);

function applyKeyOverride(provider: string, apiKey: string): void {
  const managed = managedProviders[provider];
  if (!managed) return;
  managed.config.apiKey = apiKey;
  managed.config.enabled = true;
  process.env[managed.envVar] = apiKey;
}

function revertKeyOverride(provider: string): void {
  const managed = managedProviders[provider];
  if (!managed) return;
  managed.config.apiKey = managed.envValue;
  managed.config.enabled = !!managed.envValue;
  if (managed.envValue) {
    process.env[managed.envVar] = managed.envValue;
  } else {
    delete process.env[managed.envVar];
  }
}

export interface ProviderKeyInfo {
  provider: string;
  configured: boolean;
  /** Where the active key comes from. */
  source: 'dashboard' | 'env' | 'none';
  /** Last 4 characters of the active key, if configured. */
  maskedKey?: string;
}

export function getProviderKeyInfos(): ProviderKeyInfo[] {
  return managedProviderIds.map((provider) => {
    const managed = managedProviders[provider];
    const override = config.keys[provider];
    const activeKey = override || managed.envValue;
    return {
      provider,
      configured: !!activeKey,
      source: override ? 'dashboard' : managed.envValue ? 'env' : 'none',
      ...(activeKey ? { maskedKey: '••••' + activeKey.slice(-4) } : {}),
    };
  });
}

export function setProviderKey(provider: string, apiKey: string): ProviderKeyInfo {
  if (!managedProviders[provider]) {
    throw new Error(`Unknown provider "${provider}". Supported: ${managedProviderIds.join(', ')}`);
  }
  config.keys[provider] = apiKey;
  applyKeyOverride(provider, apiKey);
  saveConfig();
  return getProviderKeyInfos().find((info) => info.provider === provider)!;
}

export function clearProviderKey(provider: string): ProviderKeyInfo {
  if (!managedProviders[provider]) {
    throw new Error(`Unknown provider "${provider}". Supported: ${managedProviderIds.join(', ')}`);
  }
  delete config.keys[provider];
  revertKeyOverride(provider);
  saveConfig();
  return getProviderKeyInfos().find((info) => info.provider === provider)!;
}

// ---------------------------------------------------------------------------
// Custom tools
// ---------------------------------------------------------------------------

export function listCustomTools(): CustomToolDefinition[] {
  return [...config.tools];
}

export function getCustomTool(name: string): CustomToolDefinition | undefined {
  return config.tools.find((tool) => tool.name === name);
}

export function upsertCustomTool(definition: CustomToolDefinition, options?: { create?: boolean }): CustomToolDefinition {
  const index = config.tools.findIndex((tool) => tool.name === definition.name);
  if (index === -1) {
    if (config.tools.length >= MAX_CUSTOM_TOOLS) {
      throw new Error(`Custom tool limit reached (${MAX_CUSTOM_TOOLS}).`);
    }
    config.tools.push(definition);
  } else {
    if (options?.create) {
      throw new Error(`A custom tool named "${definition.name}" already exists.`);
    }
    config.tools[index] = definition;
  }
  saveConfig();
  return definition;
}

export function deleteCustomTool(name: string): boolean {
  const index = config.tools.findIndex((tool) => tool.name === name);
  if (index === -1) return false;
  const usedBy = config.agents.filter((agent) => agent.tools.includes(name)).map((agent) => agent.key);
  if (usedBy.length > 0) {
    throw new Error(`Tool "${name}" is used by agent(s): ${usedBy.join(', ')}. Update or delete those agents first.`);
  }
  config.tools.splice(index, 1);
  saveConfig();
  return true;
}

// ---------------------------------------------------------------------------
// Custom agents
// ---------------------------------------------------------------------------

export function listCustomAgents(): CustomAgentDefinition[] {
  return [...config.agents];
}

export function getCustomAgent(key: string): CustomAgentDefinition | undefined {
  return config.agents.find((agent) => agent.key === key);
}

export function upsertCustomAgent(definition: CustomAgentDefinition, options?: { create?: boolean }): CustomAgentDefinition {
  const index = config.agents.findIndex((agent) => agent.key === definition.key);
  if (index === -1) {
    if (config.agents.length >= MAX_CUSTOM_AGENTS) {
      throw new Error(`Custom agent limit reached (${MAX_CUSTOM_AGENTS}).`);
    }
    config.agents.push(definition);
  } else {
    if (options?.create) {
      throw new Error(`A custom agent with key "${definition.key}" already exists.`);
    }
    config.agents[index] = definition;
  }
  saveConfig();
  return definition;
}

export function deleteCustomAgent(key: string): boolean {
  const index = config.agents.findIndex((agent) => agent.key === key);
  if (index === -1) return false;
  config.agents.splice(index, 1);
  saveConfig();
  return true;
}

// Load persisted config and apply key overrides at startup
loadConfig();
for (const [provider, apiKey] of Object.entries(config.keys)) {
  applyKeyOverride(provider, apiKey);
}
