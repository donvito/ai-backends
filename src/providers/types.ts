
export interface ProviderConfig {
    type: 'ollama' | 'llmstudio' | 'gemini';
    baseUrl: string;
    model: string;
}

export interface OllamaModel {
    name: string;
    modified_at: string;
    size: number;
    digest: string;
}

export interface OllamaResponse {
    models: OllamaModel[];
}

export interface LLMStudioModel {
    id: string;
    name: string;
    created_at: string;
}