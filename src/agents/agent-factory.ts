import { Agent } from '@mastra/core';
import { serviceRegistry } from '../services/registry';
import type { ProviderName } from '../services/interfaces';
import { enhancedSummarizeAgent } from './enhanced-summarize';

export interface AgentConfig {
  provider: string;
  model: string;
  temperature: number;
}

export class AgentFactory {
  static createEnhancedSummarizeAgent(config: AgentConfig): Agent {
    // Get the provider from the registry
    const providerName = config.provider.toLowerCase() as ProviderName;
    const provider = serviceRegistry.get(providerName);

    if (!provider) {
      throw new Error(`Provider '${config.provider}' is not registered or not available`);
    }

    // Get the AI SDK model instance from the provider
    // This ensures we use the same provider configuration for both regular API calls and agents
    const model = provider.getModelInstance(config.model, config.temperature);

    // Create a new agent instance with the model from API request
    // This ensures each request uses the provider and model specified by the user
    return new Agent({
      name: enhancedSummarizeAgent.name,
      instructions: enhancedSummarizeAgent.instructions,
      model: model,
      tools: enhancedSummarizeAgent.tools
    });
  }
}
