import { afterEach, describe, expect, it, vi } from 'vitest';
import { typesafeConfig } from '../../config/services';
import { EvaluationError } from '../evaluation';
import { TYPESAFE_DEFAULT_MODEL, TypeSafeEvaluationProvider, parseRetryAfter } from '../typesafe';

const state = { user_request: 'Create an invoice for Acme Corp' };
const questions = {
  route: {
    type: 'choice' as const,
    instructions: 'Which agent should handle this request?',
    criteria: { accounting: 'Invoices and bookkeeping', research: 'Research', coder: 'Software', human: null },
  },
  needs_clarification: {
    type: 'noul' as const,
    instructions: 'Is information required before this request can be executed?',
  },
};

const upstreamBody = {
  model: 'jev-2026-01-01',
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

function createProvider(fetchMock: ReturnType<typeof vi.fn>, overrides: Record<string, unknown> = {}) {
  const sleep = vi.fn(async () => {});
  const provider = new TypeSafeEvaluationProvider({
    apiKey: 'sk-test',
    baseURL: 'https://api.typesafe.test',
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

describe('TypeSafeEvaluationProvider', () => {
  it('posts to /v1/systemone with the Bearer key and forwards state/questions unmodified', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(upstreamBody));
    const { provider } = createProvider(fetchMock);

    await provider.evaluate(state, questions);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.typesafe.test/v1/systemone');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');

    const sent = JSON.parse(init.body as string);
    expect(sent.state).toEqual(state);
    expect(sent.questions).toEqual(questions);
    // null option descriptions must survive serialization (TypeSafe treats null as "no detail")
    expect(sent.questions.route.criteria.human).toBeNull();
  });

  it('defaults the model to jev-latest', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(upstreamBody));
    const { provider } = createProvider(fetchMock);

    await provider.evaluate(state, questions);

    const sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(TYPESAFE_DEFAULT_MODEL).toBe('jev-latest');
    expect(sent.model).toBe('jev-latest');
  });

  it('allows overriding the model per request', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(upstreamBody));
    const { provider } = createProvider(fetchMock);

    await provider.evaluate(state, questions, 'jev-2026-01-01');

    const sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent.model).toBe('jev-2026-01-01');
  });

  it('returns answers intact and computes total_tokens', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(upstreamBody));
    const { provider } = createProvider(fetchMock);

    const result = await provider.evaluate(state, questions);

    expect(result.provider).toBe('typesafe');
    expect(result.model).toBe('jev-2026-01-01');
    expect(result.answers).toEqual(upstreamBody.answers);
    expect(result.usage).toEqual({ input_tokens: 123, output_tokens: 20, total_tokens: 143 });
  });

  it('parses score answers including legend and probabilities', async () => {
    const scoreBody = {
      model: 'jev-latest',
      answers: {
        frustration: {
          type: 'score',
          score: 1.6,
          legend: { '0': 'Calm', '1': 'Frustrated', '2': 'Very angry' },
          probabilities: { '0': 0.05, '1': 0.3, '2': 0.65 },
          confidence: 0.78,
        },
      },
      usage: { input_tokens: 10, output_tokens: 5 },
    };
    const fetchMock = vi.fn(async () => jsonResponse(scoreBody));
    const { provider } = createProvider(fetchMock);

    const result = await provider.evaluate('Help! My payouts have been failing for 3 days.', {
      frustration: { type: 'score', instructions: 'How frustrated is the customer?', criteria: ['Calm', 'Frustrated', 'Very angry'] },
    });

    expect(result.answers.frustration).toEqual(scoreBody.answers.frustration);
  });

  it('rejects responses with an unexpected shape', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ model: 'jev-latest', answers: { route: { type: 'choice' } } }));
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

  it('reads the API key from typesafeConfig at call time (dashboard overrides apply immediately)', async () => {
    const originalKey = typesafeConfig.apiKey;
    const originalBase = typesafeConfig.baseURL;
    try {
      typesafeConfig.apiKey = 'sk-from-dashboard';
      typesafeConfig.baseURL = 'https://api.typesafe.test';
      const fetchMock = vi.fn(async () => jsonResponse(upstreamBody));
      const provider = new TypeSafeEvaluationProvider({ fetch: fetchMock as any, sleep: async () => {} });

      expect(provider.isConfigured()).toBe(true);
      await provider.evaluate(state, questions);

      const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-from-dashboard');
    } finally {
      typesafeConfig.apiKey = originalKey;
      typesafeConfig.baseURL = originalBase;
    }
  });

  it('maps 401 to an unauthorized error without retrying', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: 'invalid api key' }, 401));
    const { provider, sleep } = createProvider(fetchMock);

    const error = await expectEvaluationError(provider.evaluate(state, questions));
    expect(error.code).toBe('unauthorized');
    expect(error.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('maps 422 to an invalid_request error carrying upstream details', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ error: 'questions.route.criteria must have at least 2 options' }, 422)
    );
    const { provider } = createProvider(fetchMock);

    const error = await expectEvaluationError(provider.evaluate(state, questions));
    expect(error.code).toBe('invalid_request');
    expect(error.status).toBe(422);
    expect(error.details).toEqual({ error: 'questions.route.criteria must have at least 2 options' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries 429 with exponential backoff and succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'rate limited' }, 429))
      .mockResolvedValueOnce(jsonResponse({ error: 'rate limited' }, 429))
      .mockResolvedValueOnce(jsonResponse(upstreamBody));
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
      .mockResolvedValueOnce(jsonResponse({ error: 'rate limited' }, 429, { 'Retry-After': '2' }))
      .mockResolvedValueOnce(jsonResponse(upstreamBody));
    const { provider, sleep } = createProvider(fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await provider.evaluate(state, questions);

    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep.mock.calls[0][0]).toBe(2_000);
  });

  it('honors Retry-After even when it exceeds the backoff cap', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'rate limited' }, 429, { 'Retry-After': '30' }))
      .mockResolvedValueOnce(jsonResponse(upstreamBody));
    const { provider, sleep } = createProvider(fetchMock, { retryMaxDelayMs: 8_000 });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await provider.evaluate(state, questions);

    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep.mock.calls[0][0]).toBe(30_000);
  });

  it('gives up on 429 after maxRetries and surfaces rate_limited with retryAfterMs', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: 'rate limited' }, 429, { 'Retry-After': '30' }));
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
      .mockResolvedValueOnce(jsonResponse({ error: 'overloaded' }, 529))
      .mockResolvedValueOnce(jsonResponse(upstreamBody));
    const { provider, sleep } = createProvider(fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await provider.evaluate(state, questions);

    expect(result.model).toBe('jev-2026-01-01');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('surfaces overloaded after exhausting retries on 529', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: 'overloaded' }, 529));
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

describe('parseRetryAfter', () => {
  it('parses delta-seconds', () => {
    expect(parseRetryAfter('5')).toBe(5_000);
    expect(parseRetryAfter('0')).toBe(0);
  });

  it('parses HTTP dates relative to now', () => {
    const future = new Date(Date.now() + 10_000).toUTCString();
    const ms = parseRetryAfter(future);
    expect(ms).toBeGreaterThan(8_000);
    expect(ms).toBeLessThanOrEqual(10_000);
  });

  it('returns undefined for missing or malformed values', () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter('soon')).toBeUndefined();
    expect(parseRetryAfter('-3')).toBeUndefined();
  });
});
