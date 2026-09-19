import { OpenAPIHono } from '@hono/zod-openapi';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __setEvaluationProviderForTests } from '../../../services/evaluation';
import { AIGatewayEvaluationProvider } from '../../../services/aigateway-evaluation';
import { TypeSafeEvaluationProvider } from '../../../services/typesafe';
import evaluateRoute from '../evaluate';

const validRequest = {
  payload: {
    state: { user_request: 'Create an invoice for Acme Corp' },
    questions: {
      route: {
        type: 'choice',
        instructions: 'Which agent should handle this request?',
        criteria: {
          accounting: 'Invoices and bookkeeping',
          research: 'Research and documents',
          coder: 'Software development',
          human: 'Ambiguous or unsupported',
        },
      },
      needs_clarification: {
        type: 'noul',
        instructions: 'Is information required before this request can be executed?',
      },
    },
  },
  config: { provider: 'typesafe', model: 'jev-latest' },
};

const upstreamBody = {
  model: 'jev-latest',
  answers: {
    route: {
      type: 'choice',
      choice: 'accounting',
      probabilities: { accounting: 0.94, research: 0.02, coder: 0.01, human: 0.03 },
      confidence: 0.91,
    },
    needs_clarification: { type: 'noul', noul: 0.18 },
  },
  usage: { input_tokens: 123, output_tokens: 20 },
};

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

function buildApp() {
  const app = new OpenAPIHono();
  app.route('/api/v1/evaluate', evaluateRoute.handler);
  return app;
}

function post(app: OpenAPIHono, body: unknown) {
  return app.request('/api/v1/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function useProvider(fetchMock: ReturnType<typeof vi.fn>, options: Record<string, unknown> = {}) {
  __setEvaluationProviderForTests(
    new TypeSafeEvaluationProvider({
      apiKey: 'sk-test',
      baseURL: 'https://api.typesafe.test',
      timeout: 1_000,
      maxRetries: 1,
      fetch: fetchMock as any,
      sleep: async () => {},
      random: () => 0,
      ...options,
    })
  );
}

function useGatewayProvider(fetchMock: ReturnType<typeof vi.fn>, options: Record<string, unknown> = {}) {
  __setEvaluationProviderForTests(
    new AIGatewayEvaluationProvider({
      apiKey: 'vck-test',
      baseURL: 'https://ai-gateway.test/v4/ai',
      timeout: 1_000,
      maxRetries: 1,
      fetch: fetchMock as any,
      sleep: async () => {},
      random: () => 0,
      ...options,
    })
  );
}

const gatewayBody = {
  answers: {
    route: {
      type: 'choice',
      choice: 'accounting',
      probabilities: { accounting: 0.94, research: 0.02, coder: 0.01, human: 0.03 },
    },
    needs_clarification: { type: 'boolean', probability: 0.18 },
  },
  usage: { inputTokens: 123, outputTokens: 20 },
  providerMetadata: {
    typesafe: { confidence: { route: 0.91, needs_clarification: 0.8 } },
    gateway: { routing: { canonicalSlug: 'typesafe-ai/jev' } },
  },
};

describe('POST /api/v1/evaluate', () => {
  let app: OpenAPIHono;

  beforeEach(() => {
    app = buildApp();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    __setEvaluationProviderForTests(undefined);
    vi.restoreAllMocks();
  });

  it('returns 200 with Jev answers, usage totals, and apiVersion', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(upstreamBody));
    useProvider(fetchMock);

    const res = await post(app, validRequest);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      provider: 'typesafe',
      model: 'jev-latest',
      answers: upstreamBody.answers,
      usage: { input_tokens: 123, output_tokens: 20, total_tokens: 143 },
      apiVersion: '1.0.0',
    });

    const sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent).toEqual({ model: 'jev-latest', state: validRequest.payload.state, questions: validRequest.payload.questions });
  });

  it('defaults to typesafe/jev-latest when config is omitted', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(upstreamBody));
    useProvider(fetchMock);

    const res = await post(app, { payload: validRequest.payload });

    expect(res.status).toBe(200);
    const sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent.model).toBe('jev-latest');
  });

  it('routes provider=aigateway through the Vercel AI Gateway and returns the same contract', async () => {
    const typesafeFetch = vi.fn();
    useProvider(typesafeFetch);
    const gatewayFetch = vi.fn(async () => jsonResponse(gatewayBody));
    useGatewayProvider(gatewayFetch);

    const res = await post(app, { payload: validRequest.payload, config: { provider: 'aigateway' } });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      provider: 'aigateway',
      model: 'typesafe-ai/jev',
      answers: {
        route: { ...gatewayBody.answers.route, confidence: 0.91 },
        needs_clarification: { type: 'noul', noul: 0.18 },
      },
      usage: { input_tokens: 123, output_tokens: 20, total_tokens: 143 },
      apiVersion: '1.0.0',
    });

    expect(typesafeFetch).not.toHaveBeenCalled();
    const [url, init] = gatewayFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://ai-gateway.test/v4/ai/evaluation-model');
    expect((init.headers as Record<string, string>)['ai-model-id']).toBe('typesafe-ai/jev');
    const sent = JSON.parse(init.body as string);
    expect(sent.questions.needs_clarification.type).toBe('boolean');
  });

  it('returns 503 when provider=aigateway is not configured', async () => {
    const fetchMock = vi.fn();
    useGatewayProvider(fetchMock, { apiKey: '' });

    const res = await post(app, { payload: validRequest.payload, config: { provider: 'aigateway' } });

    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/"aigateway" is not configured/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid AIBackends request without calling the provider', async () => {
    const fetchMock = vi.fn();
    useProvider(fetchMock);

    const res = await post(app, {
      payload: {
        state: 'Some text',
        questions: {
          urgency: { type: 'score', instructions: 'How urgent?', criteria: ['only one level'] },
        },
      },
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid evaluation request');
    expect(JSON.stringify(body.details)).toContain('at least 2 levels');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 400 for an empty question map', async () => {
    const fetchMock = vi.fn();
    useProvider(fetchMock);

    const res = await post(app, { payload: { state: 'Some text', questions: {} } });

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 400 when a generative provider is requested', async () => {
    const fetchMock = vi.fn();
    useProvider(fetchMock);

    const res = await post(app, { ...validRequest, config: { provider: 'openai', model: 'gpt-4.1-nano' } });

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 400 with upstream details when TypeSafe rejects the request (422)', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: 'criteria: too many options' }, 422));
    useProvider(fetchMock);

    const res = await post(app, validRequest);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('TypeSafe rejected the evaluation request');
    expect(body.details).toEqual({ error: 'criteria: too many options' });
  });

  it('maps upstream 401 to 502 so it is not confused with AIBackends bearer auth', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: 'invalid api key' }, 401));
    useProvider(fetchMock);

    const res = await post(app, validRequest);

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/authentication failed/i);
    expect(JSON.stringify(body)).not.toContain('sk-test');
  });

  it('retries upstream 429 and returns 429 with Retry-After when the limit persists', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: 'rate limited' }, 429, { 'Retry-After': '7' }));
    useProvider(fetchMock, { maxRetries: 2 });

    const res = await post(app, validRequest);

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('7');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const body = await res.json();
    expect(body.error).toMatch(/rate limit/i);
  });

  it('recovers when a 429 is followed by a successful retry', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'rate limited' }, 429))
      .mockResolvedValueOnce(jsonResponse(upstreamBody));
    useProvider(fetchMock);

    const res = await post(app, validRequest);

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns 503 when TypeSafe is not configured', async () => {
    const fetchMock = vi.fn();
    useProvider(fetchMock, { apiKey: '' });

    const res = await post(app, validRequest);

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/not configured/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 503 when TypeSafe stays overloaded (529)', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: 'overloaded' }, 529));
    useProvider(fetchMock);

    const res = await post(app, validRequest);

    expect(res.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns 502 when TypeSafe is unreachable', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    useProvider(fetchMock);

    const res = await post(app, validRequest);

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe('Evaluation provider request failed');
  });

  it('returns 502 when TypeSafe returns an unexpected response shape', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ unexpected: true }));
    useProvider(fetchMock);

    const res = await post(app, validRequest);

    expect(res.status).toBe(502);
  });

  it('returns 504 when TypeSafe times out', async () => {
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init.signal?.addEventListener('abort', () => {
            const abortError = new Error('aborted');
            abortError.name = 'AbortError';
            reject(abortError);
          });
        })
    );
    useProvider(fetchMock, { timeout: 10 });

    const res = await post(app, validRequest);

    expect(res.status).toBe(504);
  });
});
