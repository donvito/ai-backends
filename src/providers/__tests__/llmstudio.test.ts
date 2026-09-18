import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { checkLLMStudioAvailability } from '../llmstudio';

describe('checkLLMStudioAvailability', () => {
    const baseUrl = 'http://localhost:1234';

    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it('should return provider config when LLMStudio is available', async () => {
        const mockModels = [
            { id: 'model1', name: 'Model One' },
            { id: 'model2', name: 'Model Two' }
        ];

        (fetch as any)
            // First call for health check
            .mockResolvedValueOnce({
                ok: true
            })
            // Second call for models
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ data: mockModels })
            });

        const result = await checkLLMStudioAvailability(baseUrl);

        expect(result).toEqual({
            type: 'llmstudio',
            baseUrl,
            model: 'model1'
        });

        expect(fetch).toHaveBeenCalledTimes(2);
        expect(fetch).toHaveBeenNthCalledWith(1, `${baseUrl}/v1/health`, expect.objectContaining({ signal: expect.any(AbortSignal) }));
        expect(fetch).toHaveBeenNthCalledWith(2, `${baseUrl}/v1/models`, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    });

    it('should throw error when health check fails', async () => {
        (fetch as any).mockRejectedValueOnce(new Error('Health check failed'));

        await expect(checkLLMStudioAvailability(baseUrl))
            .rejects
            .toThrow('Failed to connect to LLMStudio: Health check failed');

        expect(fetch).toHaveBeenCalledTimes(1);
        expect(fetch).toHaveBeenCalledWith(`${baseUrl}/v1/health`, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    });

    it('should throw error when no models are available', async () => {
        (fetch as any)
            .mockResolvedValueOnce({ ok: true }) // health check
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({data: []})
            });

        await expect(checkLLMStudioAvailability(baseUrl))
            .rejects
            .toThrow('Failed to connect to LLMStudio: No models available in LLMStudio');
    });

    it('should use default model when specified in environment', async () => {
        const mockModels = [
            { id: 'model1', name: 'Model One' },
            { id: 'default-model', name: 'Default Model' },
            { id: 'model2', name: 'Model Two' }
        ];

        process.env.LLMSTUDIO_DEFAULT_MODEL = 'default-model';

        (fetch as any)
            .mockResolvedValueOnce({ ok: true })
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ data: mockModels })
            });

        const result = await checkLLMStudioAvailability(baseUrl);

        expect(result.model).toBe('default-model');

        delete process.env.LLMSTUDIO_DEFAULT_MODEL;
    });

    it('should fall back to first model when specified default model does not exist', async () => {
        const mockModels = [
            { id: 'model1', name: 'Model One' },
            { id: 'model2', name: 'Model Two' }
        ];

        process.env.LLMSTUDIO_DEFAULT_MODEL = 'non-existent-model';

        (fetch as any)
            .mockResolvedValueOnce({ ok: true })
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ data: mockModels })
            });

        const result = await checkLLMStudioAvailability(baseUrl);

        expect(result.model).toBe('model1');

        delete process.env.LLMSTUDIO_DEFAULT_MODEL;
    });
});