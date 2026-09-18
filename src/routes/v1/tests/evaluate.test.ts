import { OpenAPIHono } from '@hono/zod-openapi';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureAuth, checkProvidersAvailability } from '../../../app';
import { typesafeConfig } from '../../../config/services';
import { questions, state, testConfig, upstreamResponse } from '../../../services/tests/evaluation-fixtures';
import evaluate from '../evaluate';
import services from '../services';

describe('POST /api/v1/evaluate', () => {
  const originalConfig = { ...typesafeConfig };
  const app = new OpenAPIHono().route('/api/v1/evaluate', evaluate.handler);
  const request = { payload: { state, questions }, config: { provider: 'typesafe' } };
  const post = (body: unknown = request) => app.request('/api/v1/evaluate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });

  beforeEach(() => {
    Object.assign(typesafeConfig, testConfig);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(upstreamResponse));
  });
  afterEach(() => {
    Object.assign(typesafeConfig, originalConfig);
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('returns a complete evaluation response', async () => {
    const response = await post();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ...upstreamResponse, provider: 'typesafe', usage: { ...upstreamResponse.usage, total_tokens: 143 },
    });
  });

  it.each([
    { ...request, payload: { state, questions: {} } },
    { ...request, payload: { state: 123, questions } },
    { ...request, config: { provider: 'openai' } },
    {},
  ])('rejects invalid requests before calling TypeSafe', async body => {
    const response = await post(body);
    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON', async () => {
    const response = await app.request('/api/v1/evaluate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
    });
    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    { upstream: 401, expected: 502 },
    { upstream: 422, expected: 502 },
    { upstream: 429, expected: 429 },
    { upstream: 529, expected: 503 },
    { upstream: 503, expected: 503 },
    { upstream: 500, expected: 502 },
  ])('maps upstream $upstream to $expected', async ({ upstream, expected }) => {
    vi.mocked(fetch).mockImplementation(async () => new Response('secret diagnostic', { status: upstream }));
    const response = await post();
    expect(response.status).toBe(expected);
    expect(await response.text()).not.toContain('secret diagnostic');
  });

  it('returns 503 when no TypeSafe key is configured', async () => {
    typesafeConfig.apiKey = '';
    const response = await post();
    expect(response.status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns 504 when TypeSafe times out', async () => {
    typesafeConfig.timeout = 20;
    vi.mocked(fetch).mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
    }));
    expect((await post()).status).toBe(504);
  });

  it('returns 502 for a network or malformed response failure', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network unavailable'));
    expect((await post()).status).toBe(502);
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ answers: {} }));
    expect((await post()).status).toBe(502);
  });

  it('documents the typed evaluation endpoint through OpenAPI', () => {
    const document = app.getOpenAPI31Document({ openapi: '3.1.0', info: { title: 'Test', version: '1' } });
    expect(document.paths?.['/api/v1/evaluate']?.post?.responses?.['200']).toBeDefined();
    expect(document.components?.schemas?.ChoiceQuestion).toBeDefined();
    expect(document.components?.schemas?.ScoreAnswer).toBeDefined();
    expect(document.components?.schemas?.EvaluationJsonValue).toMatchObject({
      anyOf: expect.arrayContaining([{ type: 'object', additionalProperties: {} }, { type: 'null' }]),
    });
    expect(document.components?.schemas?.NoulQuestion).toMatchObject({
      required: expect.arrayContaining(['instructions', 'type']),
    });
  });

  it('requires the AIBackends bearer token in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DEFAULT_ACCESS_TOKEN', 'test-aibackends-token');
    const secured = new OpenAPIHono();
    await configureAuth(secured);
    secured.route('/api/v1/evaluate', evaluate.handler);
    const init = { method: 'POST', body: JSON.stringify(request), headers: { 'Content-Type': 'application/json' } };
    expect((await secured.request('/api/v1/evaluate', init)).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
    expect((await secured.request('/api/v1/evaluate', {
      ...init, headers: { ...init.headers, Authorization: 'Bearer test-aibackends-token' },
    })).status).toBe(200);
  });

  it('exposes safe TypeSafe status without adding it to generative catalogs', async () => {
    const catalog = new OpenAPIHono().route('/api/v1/services', services.handler);
    const status = await catalog.request('/api/v1/services/status');
    expect(status.status).toBe(200);
    expect(await status.json()).toMatchObject({
      services: { typesafe: { enabled: true, available: true, config: { model: 'jev-latest', hasApiKey: true } } },
    });
    const models = await catalog.request('/api/v1/services/models?source=config&view=provider');
    expect(models.status).toBe(200);
    expect(await models.text()).not.toContain('typesafe');
    typesafeConfig.enabled = false;
    const disabled = await catalog.request('/api/v1/services/status');
    expect(await disabled.json()).toMatchObject({ services: { typesafe: { enabled: false, available: false } } });
  });

  it('allows startup with only a TypeSafe key configured', async () => {
    for (const name of [
      'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY',
      'AI_GATEWAY_API_KEY', 'GOOGLE_AI_API_KEY', 'LLAMACPP_BASE_URL',
    ]) vi.stubEnv(name, '');
    vi.mocked(fetch).mockRejectedValue(new Error('No local LLM running'));
    await expect(checkProvidersAvailability()).resolves.toBeUndefined();
  });
});
