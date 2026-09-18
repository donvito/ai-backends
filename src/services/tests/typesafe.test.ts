import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TypeSafeEvaluationProvider } from '../typesafe';
import { questions, state, testConfig, upstreamResponse } from './evaluation-fixtures';

describe('TypeSafeEvaluationProvider', () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch');
  let provider: TypeSafeEvaluationProvider;

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(Response.json(upstreamResponse));
    provider = new TypeSafeEvaluationProvider({ ...testConfig });
  });
  afterEach(() => vi.useRealTimers());
  afterAll(() => fetchMock.mockRestore());

  it('posts authenticated JSON with the default model and preserves complete answers', async () => {
    const result = await provider.evaluate(state, questions);
    expect(fetchMock).toHaveBeenCalledWith('https://typesafe.example/v1/systemone', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-typesafe-key', 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, questions, model: 'jev-latest' }),
      signal: expect.any(AbortSignal),
      redirect: 'error',
    });
    expect(result).toEqual({
      ...upstreamResponse, provider: 'typesafe',
      usage: { ...upstreamResponse.usage, total_tokens: 143 },
    });
  });

  it('supports model overrides and returns the model reported by TypeSafe', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ ...upstreamResponse, model: 'resolved-jev' }));
    const result = await provider.evaluate(state, questions, 'custom-jev');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).model).toBe('custom-jev');
    expect(result.model).toBe('resolved-jev');
  });

  it('uses a configured model and trims trailing base URL slashes', async () => {
    provider = new TypeSafeEvaluationProvider({ ...testConfig, model: 'configured-jev', baseURL: 'https://typesafe.example/' });
    await provider.evaluate(state, questions);
    expect(fetchMock.mock.calls[0][0]).toBe('https://typesafe.example/v1/systemone');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).model).toBe('configured-jev');
  });

  it('preserves upstream extension fields and supplied total tokens', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({
      ...upstreamResponse, request_id: 'request-123',
      usage: { ...upstreamResponse.usage, total_tokens: 145, cached_tokens: 2 },
    }));
    expect(await provider.evaluate(state, questions)).toMatchObject({
      request_id: 'request-123', usage: { total_tokens: 145, cached_tokens: 2 },
    });
  });

  it.each([401, 403, 422, 500])('maps HTTP %i without retrying or leaking upstream details', async status => {
    fetchMock.mockResolvedValueOnce(new Response('secret upstream diagnostic', { status }));
    await expect(provider.evaluate(state, questions)).rejects.toMatchObject({ status: 502 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([429, 529])('retries HTTP %i with exponential backoff', async status => {
    const times: number[] = [];
    fetchMock.mockImplementation(async () => {
      times.push(Date.now());
      return times.length < 3 ? new Response(null, { status }) : Response.json(upstreamResponse);
    });
    await expect(provider.evaluate(state, questions)).resolves.toHaveProperty('provider', 'typesafe');
    expect(times).toHaveLength(3);
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(240);
    expect(times[2] - times[1]).toBeGreaterThanOrEqual(490);
  });

  it.each([{ upstream: 429, expected: 429 }, { upstream: 529, expected: 503 }])('bounds retries for $upstream', async ({ upstream, expected }) => {
    fetchMock.mockImplementation(async () => new Response(null, { status: upstream }));
    await expect(provider.evaluate(state, questions)).rejects.toMatchObject({ status: expected });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('honors Retry-After without exceeding the total timeout', async () => {
    provider = new TypeSafeEvaluationProvider({ ...testConfig, timeout: 30 });
    fetchMock.mockImplementation(async () => new Response(null, { status: 429, headers: { 'Retry-After': '60' } }));
    await expect(provider.evaluate(state, questions)).rejects.toMatchObject({ status: 504 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('aborts slow fetches and clears the timeout', async () => {
    vi.useFakeTimers();
    provider = new TypeSafeEvaluationProvider({ ...testConfig, timeout: 30 });
    fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
    }));
    const outcome = expect(provider.evaluate(state, questions)).rejects.toMatchObject({ status: 504 });
    await vi.advanceTimersByTimeAsync(30);
    await outcome;
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('covers the response body read with the same timeout', async () => {
    provider = new TypeSafeEvaluationProvider({ ...testConfig, timeout: 30 });
    fetchMock.mockImplementation(async (_url, init) => new Response(new ReadableStream({
      start(controller) {
        init?.signal?.addEventListener('abort', () => controller.error(new Error('Aborted')), { once: true });
      },
    })));
    await expect(provider.evaluate(state, questions)).rejects.toMatchObject({ status: 504 });
  });

  it.each([
    { ...testConfig, apiKey: '' },
    { ...testConfig, enabled: false },
    { ...testConfig, timeout: NaN },
    { ...testConfig, timeout: 0 },
  ])('rejects missing or invalid configuration before fetching', async config => {
    provider = new TypeSafeEvaluationProvider(config);
    await expect(provider.evaluate(state, questions)).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sanitizes network failures', async () => {
    fetchMock.mockRejectedValueOnce(new Error('secret in network diagnostic'));
    await expect(provider.evaluate(state, questions)).rejects.toMatchObject({
      status: 502, message: 'Unable to complete TypeSafe evaluation.',
    });
  });

  it.each([
    {},
    { ...upstreamResponse, answers: {} },
    { ...upstreamResponse, answers: { ...upstreamResponse.answers, extra: { type: 'noul', noul: 0 } } },
    { ...upstreamResponse, answers: { ...upstreamResponse.answers, route: { type: 'noul', noul: 0 } } },
    { ...upstreamResponse, answers: { ...upstreamResponse.answers, route: { ...upstreamResponse.answers.route, choice: 'unknown' } } },
    { ...upstreamResponse, answers: { ...upstreamResponse.answers, route: { ...upstreamResponse.answers.route, probabilities: { unknown: 0.94, human: 0.06 } } } },
    { ...upstreamResponse, answers: { ...upstreamResponse.answers, risk: { ...upstreamResponse.answers.risk, score: 3 } } },
    { ...upstreamResponse, usage: { input_tokens: -1, output_tokens: 1 } },
  ])('rejects malformed or mismatched answers', async response => {
    fetchMock.mockResolvedValueOnce(Response.json(response));
    await expect(provider.evaluate(state, questions)).rejects.toMatchObject({ status: 502 });
  });

  it('handles invalid upstream JSON', async () => {
    fetchMock.mockResolvedValueOnce(new Response('not JSON'));
    await expect(provider.evaluate(state, questions)).rejects.toMatchObject({ status: 502 });
  });
});
