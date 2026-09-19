import { afterEach, describe, expect, it, vi } from 'vitest';
import { aigatewayConfig } from '../../config/services';
import { EvaluationError } from '../evaluation';
import {
  AIGATEWAY_DEFAULT_EVALUATION_MODEL,
  AIGATEWAY_EVALUATION_SPEC_VERSION,
  AIGATEWAY_PROTOCOL_VERSION,
  AIGatewayEvaluationProvider,
  toGatewayQuestions,
} from '../aigateway-evaluation';

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
      score: 1.2,
      probabilities: { '0': 0.1, '1': 0.6, '2': 0.3 },
    },
    needs_clarification: { type: 'boolean', probability: 0.18 },
  },
  usage: { inputTokens: 123, outputTokens: 20 },
  warnings: [],
  providerMetadata: {
    typesafe: { confidence: { route: 0.91, urgency: 0.7, needs_clarification: 0.8 } },
    gateway: { routing: { canonicalSlug: 'typesafe-ai/jev', originalModelId: 'typesafe-ai/jev' } },
  },
};

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

function createProvider(fetchMock: ReturnType<typeof vi.fn>, overrides: Record<string, unknown> = {}) {
  const sleep = vi.fn(async () => {});
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

describe('toGatewayQuestions', () => {
  it('rewrites noul questions to the AI SDK boolean type and leaves others untouched', () => {
    const out = toGatewayQuestions(questions) as Record<string, { type: string }>;
    expect(out.needs_clarification).toEqual({ ...questions.needs_clarification, type: 'boolean' });
    expect(out.route).toBe(questions.route);
    expect(out.urgency).toBe(questions.urgency);
  });
});

describe('AIGatewayEvaluationProvider', () => {
  it('posts to /evaluation-model with the gateway protocol headers and the translated questions', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(gatewayBody));
    const { provider } = createProvider(fetchMock);

    await provider.evaluate(state, questions);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://ai-gateway.test/v4/ai/evaluation-model');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer vck-test');
    expect(headers['ai-gateway-protocol-version']).toBe(AIGATEWAY_PROTOCOL_VERSION);
    expect(headers['ai-evaluation-model-specification-version']).toBe(AIGATEWAY_EVALUATION_SPEC_VERSION);
    expect(headers['ai-model-id']).toBe(AIGATEWAY_DEFAULT_EVALUATION_MODEL);

    const sent = JSON.parse(init.body as string);
    expect(sent.state).toEqual(state);
    expect(sent.questions.needs_clarification.type).toBe('boolean');
    expect(sent.questions.route).toEqual(questions.route);
    expect(sent.model).toBeUndefined();
  });

  it('sends a per-request model override via ai-model-id', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(gatewayBody));
    const { provider } = createProvider(fetchMock);

    await provider.evaluate(state, questions, 'typesafe-ai/jev-2026');

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)['ai-model-id']).toBe('typesafe-ai/jev-2026');
  });

  it('maps the gateway response back onto the AIBackends evaluation contract', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(gatewayBody));
    const { provider } = createProvider(fetchMock);

    const result = await provider.evaluate(state, questions);

    expect(result.provider).toBe('aigateway');
    expect(result.model).toBe('typesafe-ai/jev');
    expect(result.usage).toEqual({ input_tokens: 123, output_tokens: 20, total_tokens: 143 });

    expect(result.answers.route).toEqual({
      type: 'choice',
      choice: 'accounting',
      probabilities: { accounting: 0.94, research: 0.02, coder: 0.01, human: 0.03 },
      confidence: 0.91,
    });
    expect(result.answers.urgency).toEqual({
      type: 'score',
      score: 1.2,
      legend: { '0': 'Not urgent', '1': 'Somewhat urgent', '2': 'Very urgent' },
      probabilities: { '0': 0.1, '1': 0.6, '2': 0.3 },
      confidence: 0.7,
    });
    expect(result.answers.needs_clarification).toEqual({ type: 'noul', noul: 0.18 });
  });

  it('derives confidence from probabilities when the gateway omits TypeSafe metadata', async () => {
    const body = { answers: gatewayBody.answers, usage: gatewayBody.usage };
    const fetchMock = vi.fn(async () => jsonResponse(body));
    const { provider } = createProvider(fetchMock);

    const result = await provider.evaluate(state, questions);

    expect(result.model).toBe(AIGATEWAY_DEFAULT_EVALUATION_MODEL);
    expect(result.answers.route).toMatchObject({ confidence: 0.94 });
    expect(result.answers.urgency).toMatchObject({ confidence: 0.6 });
  });

  it('rejects with invalid_response when an answer is missing or has the wrong type', async () => {
    const body = {
      answers: { ...gatewayBody.answers, needs_clarification: { type: 'choice', choice: 'yes' } },
    };
    const fetchMock = vi.fn(async () => jsonResponse(body));
    const { provider } = createProvider(fetchMock);

    const error = await expectEvaluationError(provider.evaluate(state, questions));
    expect(error.code).toBe('invalid_response');

    const missingFetch = vi.fn(async () => jsonResponse({ answers: { route: gatewayBody.answers.route } }));
    const missingError = await expectEvaluationError(createProvider(missingFetch).provider.evaluate(state, questions));
    expect(missingError.code).toBe('invalid_response');
  });

  it('maps 401 to unauthorized without retrying', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: { message: 'bad key' } }, 401));
    const { provider } = createProvider(fetchMock);

    const error = await expectEvaluationError(provider.evaluate(state, questions));
    expect(error.code).toBe('unauthorized');
    expect(error.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries 429 with backoff and then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'slow down' }, 429, { 'Retry-After': '1' }))
      .mockResolvedValueOnce(jsonResponse(gatewayBody));
    const { provider, sleep } = createProvider(fetchMock);

    const result = await provider.evaluate(state, questions);

    expect(result.answers.route.type).toBe('choice');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('reports not_configured when no API key is available anywhere', async () => {
    const fetchMock = vi.fn();
    const originalKey = aigatewayConfig.apiKey;
    aigatewayConfig.apiKey = '';
    try {
      const provider = new AIGatewayEvaluationProvider({ fetch: fetchMock as any });
      expect(provider.isConfigured()).toBe(false);
      const error = await expectEvaluationError(provider.evaluate(state, questions));
      expect(error.code).toBe('not_configured');
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      aigatewayConfig.apiKey = originalKey;
    }
  });

  it('picks up a key set on aigatewayConfig after construction (admin dashboard overrides)', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(gatewayBody));
    const originalKey = aigatewayConfig.apiKey;
    aigatewayConfig.apiKey = '';
    try {
      const provider = new AIGatewayEvaluationProvider({ fetch: fetchMock as any, baseURL: 'https://ai-gateway.test/v4/ai' });
      expect(provider.isConfigured()).toBe(false);
      aigatewayConfig.apiKey = 'vck-from-admin';
      expect(provider.isConfigured()).toBe(true);
      await provider.evaluate(state, questions);
      const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer vck-from-admin');
    } finally {
      aigatewayConfig.apiKey = originalKey;
    }
  });
});
