import { describe, it, expect, afterEach, vi } from 'vitest';
import { fetchWithTimeout } from '../fetchWithTimeout';

describe('fetchWithTimeout', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it('returns the response when fetch settles in time', async () => {
        const response = { ok: true } as Response;
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

        await expect(fetchWithTimeout('http://localhost:11434/api/tags')).resolves.toBe(response);
    });

    it('rejects and aborts when fetch never settles, even if the signal is ignored', async () => {
        vi.useFakeTimers();
        const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
        vi.stubGlobal('fetch', fetchMock);

        const result = fetchWithTimeout('http://192.168.1.2:11434/api/health', 3000);
        const assertion = expect(result).rejects.toThrow('timed out after 3000ms');
        await vi.advanceTimersByTimeAsync(3000);
        await assertion;

        const init = fetchMock.mock.calls[0][1] as RequestInit;
        expect(init.signal?.aborted).toBe(true);
    });
});
