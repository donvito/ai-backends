import { afterEach, describe, expect, it, vi } from 'vitest';
import { aigatewayConfig } from '../../config/services';
import { EvaluationError } from '../evaluation';
import { AIGATEWAY_EVALUATION_DEFAULT_MODEL, AIGatewayEvaluationProvider } from '../aigateway-evaluation';

const state = { user_request: 'Create an invoice for Acme Corp' };
const questions = {
  route: {
    type: 'choice' as const,
    instructions: 'Which agent should handle this request?',
    criteria: { accounting: 'Invoices and bookkeeping', research: 'Research', coder: 'Software', human: null },
  },
  urgency: {
    type: 'score' as const,
    instructions: 'How urgent is this request?',
    criteria: ['Not urgent', 'Somewhat urgent', 'Very urgent'],
  },
  needs_clarification: {
    type: 'noul' as const,
    instructions: 'Is information required before this request can be executed?',
  },
};

const gatewayBody = {
  answers: {
    route: {
      type: 'choice',
      choice: 'accounting',
      probabilities: { accounting: 0.94, research: 0.02, coder: 0.01, human: 0.03 },
    },
    urgency: {
      type: 'score',
      score: 1.6,
      probabilities: { '0': 0.05, '1': 0.3, '2': 0.65 },
    },
    needs_clarification: { type: 'boolean', probability: 0.18 },
  },
  usage: { inputTokens: 123, outputTokens: 20 },
  providerMetadata: {
    typesafe: { confidence: { route: 0.91, urgency: 0.78 } },
    gateway: { routing: { canonicalSlug: 'typesafe-ai/jev' } },
  },
};

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

function createProvider(fetchMock: ReturnType<typeof vi.fn>, overrides: Record<string, unknown> = {}) {
  const sleep = vi.fn(async (_ms: number) => {});
  const provider = new AIGatewayEvaluationProvider({
    apiKey: 'vck-test',
    baseURL: 'https://ai-gateway.test/v4/ai',
    timeout: 5_000,
    fetch: fetchMock as any,
    sleep,
    random: () => 0,
    ...overrides,
  });
  return { provider, sleep };
}

async function expectEvaluationError(promise: Promise<unknown>): Promise<EvaluationError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(EvaluationError);
    return error as EvaluationError;
  }
  throw new Error('Expected promise to reject');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AIGatewayEvaluationProvider', () => {
  it('posts to /evaluation-model with gateway protocol headers and the model in ai-model-id', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(gatewayBody));
    const { provider } = createProvider(fetchMock);

    await provider.evaluate(state, questions);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://ai-gateway.test/v4/ai/evaluation-model');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer vck-test');
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['ai-gateway-auth-method']).toBe('api-key');
    expect(headers['ai-evaluation-model-specification-version']).toBe('4');
    expect(headers['ai-model-id']).toBe('typesafe-ai/jev');

    const sent = JSON.parse(init.body as string);
    expect(sent.state).toEqual(state);
    expect(sent.model).toBeUndefined(); // model travels in the header, not the body
    expect(sent.questions.route).toEqual(questions.route);
    // null option descriptions must survive serialization
    expect(sent.questions.route.criteria.human).toBeNull();
  });

  it('translates noul questions to the gateway boolean type', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(gatewayBody));
    const { provider } = createProvider(fetchMock);

    await provider.evaluate(state, questions);

    const sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent.questions.needs_clarification.type).toBe('boolean');
    expect(sent.questions.needs_clarification.instructions).toBe(questions.needs_clarification.instructions);
  });

  it('defaults the model to typesafe-ai/jev and allows per-request overrides', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(gatewayBody));
    const { provider } = createProvider(fetchMock);

    await provider.evaluate(state, questions);
    await provider.evaluate(state, questions, 'typesafe-ai/jev-2026-01-01');

    expect(AIGATEWAY_EVALUATION_DEFAULT_MODEL).toBe('typesafe-ai/jev');
    const first = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const second = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect((first[1].headers as Record<string, string>)['ai-model-id']).toBe('typesafe-ai/jev');
    expect((second[1].headers as Record<string, string>)['ai-model-id']).toBe('typesafe-ai/jev-2026-01-01');
  });

  it('translates gateway answers back to the public shape and merges providerMetadata confidence', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(gatewayBody));
    const { provider } = createProvider(fetchMock);

    const result = await provider.evaluate(state, questions);

    expect(result.provider).toBe('aigateway');
    expect(result.model).toBe('typesafe-ai/jev');
    expect(result.answers.route).toEqual({
      type: 'choice',
      choice: 'accounting',
      probabilities: { accounting: 0.94, research: 0.02, coder: 0.01, human: 0.03 },
      confidence: 0.91,
    });
    expect(result.answers.needs_clarification).toEqual({ type: 'noul', noul: 0.18 });
    expect(result.usage).toEqual({ input_tokens: 123, output_tokens: 20, total_tokens: 143 });
  });

  it('rebuilds the score legend from the request criteria', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(gatewayBody));
    const { provider } = createProvider(fetchMock);

    const result = await provider.evaluate(state, questions);

    expect(result.answers.urgency).toEqual({
      type: 'score',
      score: 1.6,
      legend: { '0': 'Not urgent', '1': 'Somewhat urgent', '2': 'Very urgent' },
      probabilities: { '0': 0.05, '1': 0.3, '2': 0.65 },
      confidence: 0.78,
    });
  });

  it('rejects choice answers missing probabilities or confidence instead of fabricating them', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ answers: { route: { type: 'choice', choice: 'billing' } }, usage: { inputTokens: 5 } })
    );
    const { provider } = createProvider(fetchMock);

    const error = await expectEvaluationError(
      provider.evaluate(state, {
        route: { type: 'choice', instructions: 'Route', criteria: { billing: 'b', other: null } },
      })
    );
    expect(error.code).toBe('invalid_response');
    expect(error.message).toContain('probability distribution');
  });

  it('rejects choice answers whose confidence is absent from providerMetadata', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        answers: { route: { type: 'choice', choice: 'billing', probabilities: { billing: 1, other: 0 } } },
        providerMetadata: { typesafe: { confidence: {} } },
      })
    );
    const { provider } = createProvider(fetchMock);

    const error = await expectEvaluationError(
      provider.evaluate(state, {
        route: { type: 'choice', instructions: 'Route', criteria: { billing: 'b', other: null } },
      })
    );
    expect(error.code).toBe('invalid_response');
    expect(error.message).toContain('confidence');
  });

  it('rejects calibration that does not match the request criteria', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        answers: { route: { type: 'choice', choice: 'alien', probabilities: { billing: 0.5, alien: 0.5 } } },
        providerMetadata: { typesafe: { confidence: { route: 0.5 } } },
      })
    );
    const { provider } = createProvider(fetchMock);

    const error = await expectEvaluationError(
      provider.evaluate(state, {
        route: { type: 'choice', instructions: 'Route', criteria: { billing: 'b', other: null } },
      })
    );
    expect(error.code).toBe('invalid_response');
  });

  it('rejects score probabilities keyed outside the requested levels', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        answers: { urgency: { type: 'score', score: 1.5, probabilities: { '0': 0.5, '9': 0.5 } } },
        providerMetadata: { typesafe: { confidence: { urgency: 0.5 } } },
      })
    );
    const { provider } = createProvider(fetchMock);

    const error = await expectEvaluationError(
      provider.evaluate(state, {
        urgency: { type: 'score', instructions: 'How urgent?', criteria: ['low', 'high'] },
      })
    );
    expect(error.code).toBe('invalid_response');
    expect(error.message).toContain('out-of-range');
  });

  it('rejects out-of-range probabilities via the public answer schema', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        answers: { refunded: { type: 'boolean', probability: 1.5 } },
      })
    );
    const { provider } = createProvider(fetchMock);

    const error = await expectEvaluationError(
      provider.evaluate(state, {
        refunded: { type: 'noul', instructions: 'Was a refund issued?' },
      })
    );
    expect(error.code).toBe('invalid_response');
    expect(error.message).toContain('calibration');
  });

  it('rejects answers for questions that were never asked', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ answers: { surprise: { type: 'boolean', probability: 0.5 } } })
    );
    const { provider } = createProvider(fetchMock);

    const error = await expectEvaluationError(
      provider.evaluate(state, {
        refunded: { type: 'noul', instructions: 'Was a refund issued?' },
      })
    );
    expect(error.code).toBe('invalid_response');
    expect(error.message).toContain('no such question');
  });

  it('rejects responses with an unexpected shape', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ answers: { route: { type: 'mystery' } } }));
    const { provider } = createProvider(fetchMock);

    const error = await expectEvaluationError(provider.evaluate(state, questions));
    expect(error.code).toBe('invalid_response');
  });

  it('fails fast with not_configured when no API key is available', async () => {
    const fetchMock = vi.fn();
    const { provider } = createProvider(fetchMock, { apiKey: '' });

    expect(provider.isConfigured()).toBe(false);
    const error = await expectEvaluationError(provider.evaluate(state, questions));
    expect(error.code).toBe('not_configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reads the API key from aigatewayConfig at call time (dashboard overrides apply immediately)', async () => {
    const originalKey = aigatewayConfig.apiKey;
    const originalBase = aigatewayConfig.evaluationBaseURL;
    try {
      aigatewayConfig.apiKey = 'vck-from-dashboard';
      aigatewayConfig.evaluationBaseURL = 'https://ai-gateway.test/v4/ai';
      const fetchMock = vi.fn(async () => jsonResponse(gatewayBody));
      const provider = new AIGatewayEvaluationProvider({ fetch: fetchMock as any, sleep: async () => {} });

      expect(provider.isConfigured()).toBe(true);
      await provider.evaluate(state, questions);

      const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer vck-from-dashboard');
    } finally {
      aigatewayConfig.apiKey = originalKey;
      aigatewayConfig.evaluationBaseURL = originalBase;
    }
  });

  it('maps 401 to an unauthorized error without retrying', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: { message: 'invalid api key' } }, 401));
    const { provider, sleep } = createProvider(fetchMock);

    const error = await expectEvaluationError(provider.evaluate(state, questions));
    expect(error.code).toBe('unauthorized');
    expect(error.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('maps 404 (unknown model) to an invalid_request error carrying upstream details', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ error: { message: 'model not found', code: 'not_found_error' } }, 404)
    );
    const { provider } = createProvider(fetchMock);

    const error = await expectEvaluationError(provider.evaluate(state, questions));
    expect(error.code).toBe('invalid_request');
    expect(error.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries 429 with exponential backoff and succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'rate limited' } }, 429))
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'rate limited' } }, 429))
      .mockResolvedValueOnce(jsonResponse(gatewayBody));
    const { provider, sleep } = createProvider(fetchMock, { retryBaseDelayMs: 100, retryMaxDelayMs: 10_000 });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await provider.evaluate(state, questions);

    expect(result.answers.route.type).toBe('choice');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep.mock.calls[0][0]).toBe(100);
    expect(sleep.mock.calls[1][0]).toBe(200);
  });

  it('honors Retry-After on 429', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'rate limited' } }, 429, { 'Retry-After': '2' }))
      .mockResolvedValueOnce(jsonResponse(gatewayBody));
    const { provider, sleep } = createProvider(fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await provider.evaluate(state, questions);

    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep.mock.calls[0][0]).toBe(2_000);
  });

  it('honors Retry-After even when it exceeds the backoff cap', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'rate limited' } }, 429, { 'Retry-After': '30' }))
      .mockResolvedValueOnce(jsonResponse(gatewayBody));
    const { provider, sleep } = createProvider(fetchMock, { retryMaxDelayMs: 8_000 });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await provider.evaluate(state, questions);

    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep.mock.calls[0][0]).toBe(30_000);
  });

  it('gives up on 429 after maxRetries and surfaces rate_limited with retryAfterMs', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: { message: 'rate limited' } }, 429, { 'Retry-After': '30' }));
    const { provider, sleep } = createProvider(fetchMock, { maxRetries: 2 });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const error = await expectEvaluationError(provider.evaluate(state, questions));
    expect(error.code).toBe('rate_limited');
    expect(error.status).toBe(429);
    expect(error.retryAfterMs).toBe(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('retries 529 (overloaded) and succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'overloaded' } }, 529))
      .mockResolvedValueOnce(jsonResponse(gatewayBody));
    const { provider, sleep } = createProvider(fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await provider.evaluate(state, questions);

    expect(result.model).toBe('typesafe-ai/jev');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('surfaces overloaded after exhausting retries on 529', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: { message: 'overloaded' } }, 529));
    const { provider } = createProvider(fetchMock, { maxRetries: 1 });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const error = await expectEvaluationError(provider.evaluate(state, questions));
    expect(error.code).toBe('overloaded');
    expect(error.status).toBe(529);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-retryable 5xx responses', async () => {
    const fetchMock = vi.fn(async () => new Response('bad gateway', { status: 502 }));
    const { provider, sleep } = createProvider(fetchMock);

    const error = await expectEvaluationError(provider.evaluate(state, questions));
    expect(error.code).toBe('upstream_error');
    expect(error.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries network errors and reports network failure when they persist', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const { provider } = createProvider(fetchMock, { maxRetries: 1 });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const error = await expectEvaluationError(provider.evaluate(state, questions));
    expect(error.code).toBe('network');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('aborts the request after the configured timeout and does not retry', async () => {
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init.signal?.addEventListener('abort', () => {
            const abortError = new Error('The operation was aborted');
            abortError.name = 'AbortError';
            reject(abortError);
          });
        })
    );
    const { provider, sleep } = createProvider(fetchMock, { timeout: 20 });

    const error = await expectEvaluationError(provider.evaluate(state, questions));
    expect(error.code).toBe('timeout');
    expect(error.message).toContain('20ms');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});
