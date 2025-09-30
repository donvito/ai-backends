import type { ProviderConfig, OllamaResponse } from './types';


export async function checkOllamaAvailability(baseUrl: string): Promise<ProviderConfig> {
    try {
        // Check health first
        const healthResponse = await fetch(`${baseUrl}/api/version`);
        if (!healthResponse.ok) {
            throw new Error(`Health check failed with status ${healthResponse.status}`);
        }

        // Check for available models
        const modelsResponse = await fetch(`${baseUrl}/api/tags`);
        const modelsData: OllamaResponse = await modelsResponse.json();

        if (modelsData.models.length === 0) {
            throw new Error('No models available in Ollama');
        }

        const defaultModel = process.env.OLLAMA_DEFAULT_MODEL || modelsData.models[0].name;

        const modelExists = modelsData.models.some(model => model.name === defaultModel);
        if (!modelExists) {
            console.warn(`Specified model ${defaultModel} not found. Using ${modelsData.models[0].name} instead.`);
        }

        const selectedModel = modelExists ? defaultModel : modelsData.models[0].name;
        console.log(`Using Ollama as LLM provider with model: ${selectedModel}`);

        return {
            type: 'ollama',
            baseUrl,
            model: selectedModel
        };

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        throw new Error(`Failed to connect to Ollama: ${errorMessage}`);
    }
}
