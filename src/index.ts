import initialise, { checkProvidersAvailability } from './app'
import displayLogo from './utils/logo'
import { serve } from '@hono/node-server';

const PORT = process.env.PORT || 3000;

async function startServer() {
    try {
        const app = await initialise();

        // Display ASCII logo on startup
        displayLogo()

        console.log(`Server is starting on port ${PORT}...`);

        serve({
            fetch: app.fetch,
            port: Number(PORT)
        });

        console.log(`Server is running on http://localhost:${PORT}`);

        // Probe LLM providers after the server is listening so an unreachable
        // provider (e.g. an offline OLLAMA_BASE_URL host) can't block startup
        checkProvidersAvailability().catch((error: unknown) => {
            const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
            console.warn(`[WARN] ${errorMessage}`);
        });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        console.error(`Failed to start server: ${errorMessage}`);
        process.exit(1);
    }
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason: unknown) => {
    const errorMessage = reason instanceof Error ? reason.message : 'An unknown error occurred';
    console.error('Unhandled Rejection:', errorMessage);
    process.exit(1);
});

startServer().catch((error: unknown) => {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    console.error('Failed to start server:', errorMessage);
    process.exit(1);
});
