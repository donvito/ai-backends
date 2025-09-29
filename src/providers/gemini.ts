import type { ProviderConfig } from './types';

export async function checkGeminiAvailability(apiKey: string): Promise<ProviderConfig> {
    try {
        if (!apiKey) {
            throw new Error('Google AI API key is required');
        }

        // For Google Gemini, we don't need to make a health check call like with local providers
        // The API key validation will happen when we make actual requests
        
        const defaultModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
        
        console.log(`Using Google Gemini as AI provider with model: ${defaultModel}`);

        return {
            type: 'gemini',
            baseUrl: 'https://generativelanguage.googleapis.com', // This is not actually used by the AI SDK
            model: defaultModel
        };

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        throw new Error(`Failed to configure Google Gemini: ${errorMessage}`);
    }
}
