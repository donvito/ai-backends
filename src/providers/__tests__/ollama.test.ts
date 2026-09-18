import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { checkOllamaAvailability } from '../ollama';

describe('checkOllamaAvailability', () => {
    const baseUrl = 'http://localhost:11434';

    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it('should return provider config when Ollama is available', async () => {
        const mockModels = {
            models: [
                { name: 'model1' },
                { name: 'model2' }
            ]
        };

        (fetch as any)
            // First call for health check
            .mockResolvedValueOnce({
                ok: true
            })
            // Second call for models
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockModels)
            });

        const result = await checkOllamaAvailability(baseUrl);

        expect(result).toEqual({
            type: 'ollama',
            baseUrl,
            model: 'model1'
        });

        expect(fetch).toHaveBeenCalledTimes(2);
        expect(fetch).toHaveBeenNthCalledWith(1, `${baseUrl}/api/health`, expect.objectContaining({ signal: expect.any(AbortSignal) }));
        expect(fetch).toHaveBeenNthCalledWith(2, `${baseUrl}/api/tags`, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    });

    it('should throw error when health check fails', async () => {
        (fetch as any).mockRejectedValueOnce(new Error('Health check failed'));

        await expect(checkOllamaAvailability(baseUrl))
            .rejects
            .toThrow('Failed to connect to Ollama: Health check failed');

        expect(fetch).toHaveBeenCalledTimes(1);
        expect(fetch).toHaveBeenCalledWith(`${baseUrl}/api/health`, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    });

    it('should throw error when no models are available', async () => {
        (fetch as any)
            .mockResolvedValueOnce({ ok: true }) // health check
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ models: [] })
            });

        await expect(checkOllamaAvailability(baseUrl))
            .rejects
            .toThrow('Failed to connect to Ollama: No models available in Ollama');
    });
});