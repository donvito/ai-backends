import { OpenAPIHono } from '@hono/zod-openapi';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { aigatewayConfig } from '../../config/services';
import { evaluateResponseSchema } from '../../schemas/v1/evaluate';
import evaluateRoute from '../../routes/v1/evaluate';
import { AIGatewayEvaluationProvider, type AIGatewayEvaluationOptions } from '../aigateway-evaluation';
import { __setEvaluationProviderForTests, processEvaluationRequest } from '../evaluation';
import { TypeSafeEvaluationProvider } from '../typesafe';

const state = 'The support agent issued a full refund to the customer.';
const questions = {
  refunded: { type: 'boolean' as const, instructions: 'Was a refund issued?' },
};
const responseBody = {
  answers: { refunded: { type: 'boolean', probability: 0.98 } },
  usage: { inputTokens: 40, outputTokens: 2 },
};

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function mockFetch() {
  return Object.assign(
    vi.fn<NonNullable<AIGatewayEvaluationOptions['fetch']>>()
      .mockImplementation(async () => jsonResponse(responseBody)),
    { preconnect: () => {} },
  );
}

function createProvider(fetch = mockFetch(), options: AIGatewayEvaluationOptions = {}) {
  return new AIGatewayEvaluationProvider({ apiKey: 'test-gateway-key', fetch, maxRetries: 0, ...options });
}

afterEach(() => {
  __setEvaluationProviderForTests(undefined, 'aigateway');
  vi.restoreAllMocks();
});

describe('AI Gateway Jev evaluation', () => {
  it('uses the AI SDK evaluation endpoint and model header with the Gateway key', async () => {
    const fetch = mockFetch();
    const result = await createProvider(fetch).evaluate(state, questions);

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://ai-gateway.vercel.sh/v4/ai/evaluation-model');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test-gateway-key');
    expect(new Headers(init?.headers).get('ai-model-id')).toBe('typesafe-ai/jev');
    expect(JSON.parse(String(init?.body))).toEqual({ state, questions, providerOptions: {} });
    expect(result).toEqual({
      provider: 'aigateway',
      model: 'typesafe-ai/jev',
      answers: responseBody.answers,
      usage: { input_tokens: 40, output_tokens: 2, total_tokens: 42 },
    });
    expect(evaluateResponseSchema.safeParse(result).success).toBe(true);
  });

  it('adapts legacy noul questions, score legends and optional distributions', async () => {
    const fetch = mockFetch().mockImplementation(async () => jsonResponse({
      answers: {
        refunded: { type: 'boolean', probability: 0.98 },
        department: { type: 'choice', choice: 'billing' },
        satisfaction: { type: 'score', score: 1.8 },
      },
    }));
    const result = await createProvider(fetch).evaluate({ messages: [state] }, {
      refunded: { ...questions.refunded, type: 'noul', criteria: { true: 'Refund complete' } },
      department: {
        type: 'choice', instructions: 'Which department?',
        criteria: { billing: 'Refunds', support: null },
      },
      satisfaction: {
        type: 'score', instructions: { question: 'How satisfied?' },
        criteria: ['Unhappy', 'Neutral', 'Happy'],
      },
    }, 'typesafe-ai/jev-latest');

    expect(result.answers).toEqual({
      refunded: { type: 'noul', noul: 0.98 },
      department: { type: 'choice', choice: 'billing' },
      satisfaction: { type: 'score', score: 1.8, legend: { 0: 'Unhappy', 1: 'Neutral', 2: 'Happy' } },
    });
    expect(result.usage.total_tokens).toBe(0);
    expect(evaluateResponseSchema.safeParse(result).success).toBe(true);
    const [, init] = fetch.mock.calls[0];
    expect(new Headers(init?.headers).get('ai-model-id')).toBe('typesafe-ai/jev-latest');
    expect(JSON.parse(String(init?.body)).questions.refunded).toEqual({
      ...questions.refunded, criteria: { true: 'Refund complete' },
    });
  });

  it('uses updated admin keys on the same provider instance', async () => {
    const originalKey = aigatewayConfig.apiKey;
    const fetch = mockFetch();
    const provider = new AIGatewayEvaluationProvider({ fetch });
    try {
      aigatewayConfig.apiKey = '';
      expect(provider.isConfigured()).toBe(false);
      await expect(provider.evaluate(state, questions)).rejects.toMatchObject({ code: 'not_configured' });
      expect(fetch).not.toHaveBeenCalled();
      aigatewayConfig.apiKey = 'dashboard-key';
      expect(provider.isConfigured()).toBe(true);
      await provider.evaluate(state, questions);
      expect(new Headers(fetch.mock.calls[0][1]?.headers).get('authorization')).toBe('Bearer dashboard-key');
    } finally {
      aigatewayConfig.apiKey = originalKey;
    }
  });

  it('preserves distributions and TypeSafe confidence metadata without deriving confidence', async () => {
    const fetch = mockFetch().mockImplementation(async () => jsonResponse({
      answers: {
        department: { type: 'choice', choice: 'billing', probabilities: { billing: 0.9, support: 0.1 } },
      },
      providerMetadata: { typesafe: { confidence: { department: 0.7 } } },
    }));
    const result = await createProvider(fetch).evaluate(state, {
      department: {
        type: 'choice', instructions: 'Which department?',
        criteria: { billing: 'Refunds', support: null },
      },
    });
    expect(result.answers.department).toEqual({
      type: 'choice', choice: 'billing', probabilities: { billing: 0.9, support: 0.1 }, confidence: 0.7,
    });
  });

  it.each([
    [400, 'invalid_request'], [401, 'unauthorized'], [403, 'unauthorized'],
    [404, 'invalid_request'], [422, 'invalid_request'], [429, 'rate_limited'],
    [500, 'upstream_error'], [503, 'overloaded'], [529, 'overloaded'], [504, 'timeout'],
  ])('maps HTTP %i without exposing upstream errors', async (status, code) => {
    const fetch = mockFetch().mockImplementation(async () => jsonResponse({
      error: { message: 'Sensitive upstream detail: test-gateway-key' },
    }, status, { 'retry-after': '3' }));
    const result = createProvider(fetch).evaluate(state, questions);
    await expect(result).rejects.toMatchObject({ code, status, retryAfterMs: 3000 });
    await expect(result).rejects.not.toThrow('test-gateway-key');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('retries rate limits through the SDK', async () => {
    const fetch = mockFetch()
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'Rate limited' } }, 429, { 'retry-after': '0' }))
      .mockResolvedValueOnce(jsonResponse(responseBody));
    await expect(createProvider(fetch, { maxRetries: 1 }).evaluate(state, questions)).resolves.toMatchObject({
      answers: responseBody.answers,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('preserves the final rate limit and retry-after when retries are exhausted', async () => {
    const fetch = mockFetch().mockImplementation(async () =>
      jsonResponse({ error: { message: 'Rate limited' } }, 429, { 'retry-after': '0.01' }));
    await expect(createProvider(fetch, { maxRetries: 1 }).evaluate(state, questions)).rejects.toMatchObject({
      code: 'rate_limited', status: 429, retryAfterMs: 10,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('maps network failures', async () => {
    const fetch = mockFetch().mockRejectedValue(new TypeError('fetch failed'));
    await expect(createProvider(fetch).evaluate(state, questions)).rejects.toMatchObject({ code: 'network' });
  });

  it('aborts the evaluation when its timeout expires', async () => {
    const fetch = mockFetch().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    await expect(createProvider(fetch, { timeout: 20 }).evaluate(state, questions))
      .rejects.toMatchObject({ code: 'timeout' });
  });

  it.each([
    { answers: {} },
    { answers: { refunded: { type: 'boolean', probability: 2 } } },
    { answers: { refunded: { type: 'choice', choice: 'billing' } } },
    { answers: { refunded: { type: 'boolean' } } },
  ])('rejects malformed or mismatched answers: %j', async (body) => {
    const fetch = mockFetch().mockImplementation(async () => jsonResponse(body));
    await expect(createProvider(fetch).evaluate(state, questions)).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('routes the public Gateway request through the evaluation registry', async () => {
    __setEvaluationProviderForTests(createProvider());
    const app = new OpenAPIHono();
    app.route('/api/v1/evaluate', evaluateRoute.handler);
    const response = await app.request('/api/v1/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: { state, questions }, config: { provider: 'aigateway' } }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      provider: 'aigateway', model: 'typesafe-ai/jev', answers: responseBody.answers, apiVersion: '1.0.0',
    });
  });

  it('rejects an unconfigured Gateway through the registry', async () => {
    __setEvaluationProviderForTests(createProvider(mockFetch(), { apiKey: '' }));
    await expect(processEvaluationRequest(state, questions, { provider: 'aigateway' }))
      .rejects.toMatchObject({ code: 'not_configured' });
  });

  it('also adapts boolean questions for the direct TypeSafe provider', async () => {
    const fetch = mockFetch().mockImplementation(async () => jsonResponse({
      model: 'jev-latest', answers: { refunded: { type: 'noul', noul: 0.98 } },
    }));
    const provider = new TypeSafeEvaluationProvider({ apiKey: 'test-typesafe-key', fetch });
    const result = await provider.evaluate(state, questions);
    expect(result.answers).toEqual(responseBody.answers);
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body)).questions.refunded.type).toBe('noul');
  });
});
