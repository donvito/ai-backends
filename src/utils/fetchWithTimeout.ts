/**
 * fetch() that always settles within `ms`. AbortSignal alone is not enough:
 * Bun ignores it while a TCP connect to an unreachable host is pending, which
 * hung server startup when OLLAMA_BASE_URL pointed at an offline machine.
 */
export async function fetchWithTimeout(url: string, ms = 3000, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            controller.abort();
            reject(new Error(`Request to ${url} timed out after ${ms}ms`));
        }, ms);
    });
    try {
        return await Promise.race([fetch(url, { ...init, signal: controller.signal }), timeout]);
    } finally {
        clearTimeout(timer);
    }
}
