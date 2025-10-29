
import { OpenAPIHono } from '@hono/zod-openapi';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import {bearerAuth} from "hono/bearer-auth";
import configureRoutes from "./utils/apiRoutes";
import configureApiDocs from "./utils/apiDocs";
import {checkOllamaAvailability} from "./providers/ollama";
import {checkLLMStudioAvailability} from "./providers/llmstudio";


function configureApiSecurity(app: OpenAPIHono, tokenConfig: string) {
    const devMode = process.env.NODE_ENV === 'development'
    console.log('process.env.NODE_ENV', process.env.NODE_ENV)
    console.log('devMode', devMode)

    if (!devMode) {
        app.use(secureHeaders())

        app.use('/*', async (c, next) => {
            const path = c.req.path;
            // Allow public access to specific paths
            if (
                path === '/' ||
                path === '/api/doc' ||
                path === '/api/ui' ||
                path === '/api/redoc' ||
                path === '/api/llms.txt' ||
                path === '/api/hello' ||
                // Public demo and tools pages
                path === '/api/demos' ||
                path === '/api/highlighter-demo' ||
                path === '/api/summarize-demo' ||
                path === '/api/sentiment-demo' ||
                path === '/api/keywords-demo' ||
                path === '/api/email-reply-demo' ||
                path === '/api/rewrite-demo' ||
                path === '/api/compose-demo' ||
                path === '/api/translate-demo' ||
                path === '/api/meeting-notes-demo' ||
                path === '/api/asktext-demo' ||
                path === '/api/project-planner-demo' ||
                path === '/api/outline-demo' ||
                // Versioned demo pages (v1)
                path === '/api/v1/demos' ||
                path === '/api/v1/highlighter-demo' ||
                path === '/api/v1/summarize-demo' ||
                path === '/api/v1/sentiment-demo' ||
                path === '/api/v1/keywords-demo' ||
                path === '/api/v1/email-reply-demo' ||
                path === '/api/v1/rewrite-demo' ||
                path === '/api/v1/compose-demo' ||
                path === '/api/v1/translate-demo' ||
                path === '/api/v1/meeting-notes-demo' ||
                path === '/api/v1/asktext-demo' ||
                path === '/api/v1/project-planner-demo' ||
                path === '/api/v1/outline-demo' ||
                path === '/api/v1/pdf-summarizer-demo' ||
                path === '/api/v1/pdf-translate-demo' ||
                path === '/api/v1/web-search-demo' ||
                path === '/api/v1/ocr-demo' ||
                path === '/api/models' ||
                path === '/api/jsoneditor' ||
                // Public read-only service catalog for demos
                path === '/api/v1/services/models' ||
                // Public shared resources
                path.startsWith('/api/shared/')
            ) {
                await next();
                return;
            }

            return bearerAuth({ token: tokenConfig })(c, next);
        })

        app.openAPIRegistry.registerComponent(
            'securitySchemes',
            'BearerAuth',
            {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT'
            }
        );
    }
}

function configureCors() {
    const envOrigins = process.env.CORS_ALLOWED_ORIGINS;
    const defaultOrigins = [
        'http://localhost',
        'http://127.0.0.1',
        'https://localhost',
        'https://127.0.0.1',
    ];

    const allowedOrigins = envOrigins
        ? envOrigins.split(',').map((o) => o.trim()).filter((o) => o.length > 0)
        : defaultOrigins;

    return (origin: string | undefined): string | null => {
        if (!origin) {
            return null;
        }

        for (const o of allowedOrigins) {
            if (o === '*') {
                return origin;
            }

            const escaped = o.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
            const regex = new RegExp('^' + escaped + '$');
            if (regex.test(origin)) {
                return origin;
            }
        }

        return null;
    };
}

export async function configureAuth(app: OpenAPIHono): Promise<void> {
    try {
        // Get the authentication token
        const token: string | undefined = process.env.DEFAULT_ACCESS_TOKEN;

        if (!token && process.env.NODE_ENV !== 'development') {
            throw new Error('Failed to configure auth. Set DEFAULT_ACCESS_TOKEN in .env');
        }

        // Configure API security with the token
        configureApiSecurity(app, token || '');

        console.log('Authentication and security configuration initialized successfully');
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        throw new Error(`\nFailed to initialize authentication: ${errorMessage}`);
    }
}

export async function checkLLMProvidersAvailability() {
    
    // Check if OpenAI, Anthropic, OpenRouter, or Google are available via API keys
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    const openrouterApiKey = process.env.OPENROUTER_API_KEY;
    const aigatewayApiKey = process.env.AI_GATEWAY_API_KEY;
    const geminiApiKey = process.env.GOOGLE_AI_API_KEY;

    if (!openaiApiKey && !anthropicApiKey && !openrouterApiKey && !aigatewayApiKey && !geminiApiKey) {
        throw new Error('No API keys found for external LLM providers');
    }

    const availableProviders: string[] = [];
    if (openaiApiKey) availableProviders.push('OpenAI');
    if (anthropicApiKey) availableProviders.push('Anthropic');
    if (openrouterApiKey) availableProviders.push('OpenRouter');
    if (aigatewayApiKey) availableProviders.push('AIGateway');
    if (geminiApiKey) availableProviders.push('Google');
    
    return availableProviders;
}

export async function checkProvidersAvailability() {
    
    const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    const llmStudioBaseUrl = process.env.LLMSTUDIO_BASE_URL || 'http://localhost:1234';
    const llamaCppBaseUrl = process.env.LLAMACPP_BASE_URL || '';
    const availableProviders: string[] = [];

    // Try local providers Ollama and LLMStudio first
    try {
        await checkOllamaAvailability(ollamaBaseUrl);
        availableProviders.push('Ollama');
    } catch (ollamaError) {
        console.log('[WARN] Ollama not available, trying LLMStudio...');
        // Try connecting to LLMStudio
        try {
            await checkLLMStudioAvailability(llmStudioBaseUrl);
            availableProviders.push('LLMStudio');
        } catch (llmStudioError) {
            console.log('[WARN] LLMStudio is not available, trying external LLM providers...');            
        }    
    }

    // Try external providers OpenAI, Anthropic, and OpenRouter
    try {               
        const llmProviders = await checkLLMProvidersAvailability();
        if (llmProviders.length > 0) {
            availableProviders.push(...llmProviders);            
        } 
        if (llamaCppBaseUrl) {
            availableProviders.push('LlamaCpp');
        }
    } catch (llmProvidersError) {
        console.log('[WARN] No external LLM providers available. Set one of: OPENAI_API_KEY, ANTHROPIC_API_KEY, or OPENROUTER_API_KEY in .env');
    }

    if (availableProviders.length > 0) {
        console.log('Available LLM providers:', availableProviders);
    } else {
        throw new Error('No LLM providers available. Either run a local LLM (Ollama/LLMStudio) or set one of: OPENAI_API_KEY, ANTHROPIC_API_KEY, or OPENROUTER_API_KEY in .env');
    }
}                


const app = new OpenAPIHono();
// Configure CORS first
app.use('/*', cors({
    origin: configureCors(),
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'Cache-Control', 'Connection', 'Accept', 'Last-Event-ID'],
    exposeHeaders: ['Content-Length', 'X-Request-Id'],
    maxAge: 3600,
    credentials: true,
}));

// Initialize authentication and security
const initialize = async () => {
    await configureAuth(app)    
    await configureRoutes(app)
    await configureApiDocs(app)
    await checkProvidersAvailability()
    return app;
};

export default initialize;
