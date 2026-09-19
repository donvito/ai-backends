import { OpenAPIHono } from '@hono/zod-openapi';
import { describe, expect, it } from 'vitest';
import { evaluateResponseSchema } from '../../schemas/v1/evaluate';
import evaluateRoute from '../../routes/v1/evaluate';

describe.skipIf(!process.env.AI_GATEWAY_API_KEY)('AI Gateway Jev (live)', () => {
  it('evaluates the refund example through the public API', async () => {
    const app = new OpenAPIHono();
    app.route('/api/v1/evaluate', evaluateRoute.handler);
    const response = await app.request('/api/v1/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload: {
          state: 'The support agent issued a full refund to the customer.',
          questions: {
            refunded: { type: 'boolean', instructions: 'Was a refund issued?' },
            legacy_refunded: { type: 'noul', instructions: 'Was a refund issued?' },
            department: {
              type: 'choice', instructions: 'Which team handles this action?',
              criteria: { billing: 'Payments and refunds', technical: 'Bugs and outages' },
            },
            completion: {
              type: 'score', instructions: 'How complete is the refund?',
              criteria: ['No refund', 'Partial refund', 'Full refund'],
            },
          },
        },
        config: { provider: 'aigateway' },
      }),
    });
    const body = await response.json();
    expect(response.status, JSON.stringify(body)).toBe(200);
    const result = evaluateResponseSchema.parse(body);
    expect(result.provider).toBe('aigateway');
    expect(result.model).toMatch(/typesafe-ai\/jev/);
    expect(result.answers.refunded).toMatchObject({ type: 'boolean', probability: expect.any(Number) });
    if (result.answers.refunded.type === 'boolean') {
      expect(result.answers.refunded.probability).toBeGreaterThan(0.5);
    }
    expect(result.answers.legacy_refunded).toMatchObject({ type: 'noul', noul: expect.any(Number) });
    expect(result.answers.department).toMatchObject({ type: 'choice', choice: 'billing' });
    expect(result.answers.completion).toMatchObject({
      type: 'score', legend: { 0: 'No refund', 1: 'Partial refund', 2: 'Full refund' },
    });
  }, 60_000);
});
