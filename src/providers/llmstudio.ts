import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { ProviderConfig, LLMStudioModel } from './types';


export async function checkLLMStudioAvailability(baseUrl: string): Promise<ProviderConfig> {
    try {
        // Check health first
        await fetchWithTimeout(`${baseUrl}/v1/health`);

        // Check for available models
        const modelsResponse = await fetchWithTimeout(`${baseUrl}/v1/models`);
        const models: LLMStudioModel[] = (await modelsResponse.json()).data;

        if (models.length === 0) {
            throw new Error('No models available in LLMStudio');
        }

        const defaultModel = process.env.LLMSTUDIO_DEFAULT_MODEL || models[0].id;

        const modelExists = models.some(model => model.id === defaultModel);
        if (!modelExists) {
            console.warn(`Specified model ${defaultModel} not found. Using ${models[0].id} instead.`);
        }

        const selectedModel = modelExists ? defaultModel : models[0].id;
        console.log(`Using LLMStudio as LLM provider with model: ${selectedModel}`);

        return {
            type: 'llmstudio',
            baseUrl,
            model: selectedModel
        };

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        throw new Error(`Failed to connect to LLMStudio: ${errorMessage}`);
    }
}