import type { AIProvider, ProviderName } from './interfaces';

import openaiProvider from './openai';
import anthropicProvider from './anthropic';
import ollamaProvider from './ollama';
import openrouterProvider from './openrouter';
import lmstudioProvider from './lmstudio';
import aigatewayProvider from './aigateway';

export class ServiceRegistry {
  private providers = new Map<ProviderName, AIProvider>();

  register(provider: AIProvider) {
    this.providers.set(provider.name, provider);
  }

  unregister(name: ProviderName) {
    this.providers.delete(name);
  }

  get(name: ProviderName): AIProvider | undefined {
    return this.providers.get(name);
  }

  getAll(): Map<ProviderName, AIProvider> {
    return new Map(this.providers);
  }

  clear() {
    this.providers.clear();
  }
}

export const serviceRegistry = new ServiceRegistry();

// Register built-in providers by default
serviceRegistry.register(openaiProvider);
serviceRegistry.register(anthropicProvider);
serviceRegistry.register(ollamaProvider);
serviceRegistry.register(openrouterProvider);
serviceRegistry.register(lmstudioProvider);
serviceRegistry.register(aigatewayProvider);

// Helper for tests to replace the registry content
export function replaceRegistryForTests(registry: ServiceRegistry) {
  serviceRegistry.clear();
  for (const [, provider] of registry.getAll()) {
    serviceRegistry.register(provider);
  }
}