import { z } from 'zod/v3';

export const providersSupported = z.enum(['ollama', 'openai', 'anthropic', 'openrouter', 'lmstudio', 'aigateway', 'llamacpp', 'google', 'baseten']);