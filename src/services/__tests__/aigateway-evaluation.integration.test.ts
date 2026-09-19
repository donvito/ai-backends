import { describe, expect, it } from 'vitest';
import { AIGatewayEvaluationProvider } from '../aigateway-evaluation';

/**
 * Opt-in integration test against the real Vercel AI Gateway (typesafe-ai/jev).
 *
 *   AI_GATEWAY_API_KEY=... bun run test:integration
 *
 * Skipped automatically when no key is present so normal CI never needs live
 * credentials.
 */
const apiKey = process.env.AI_GATEWAY_API_KEY;

describe.skipIf(!apiKey)('Jev via Vercel AI Gateway (live)', () => {
  const provider = new AIGatewayEvaluationProvider({
    apiKey,
    baseURL: process.env.AIGATEWAY_EVALUATION_BASE_URL,
    timeout: 30_000,
  });

  it('answers one Noul, one Choice and one Score question about a support ticket', async () => {
    const result = await provider.evaluate(
      {
        subject: 'Charged twice this month',
        body: 'Hi, I was billed twice for my subscription on the 3rd. Please refund the duplicate charge.',
      },
      {
        wants_refund: {
          type: 'noul',
          instructions: 'Does the customer explicitly ask for a refund?',
        },
        department: {
          type: 'choice',
          instructions: 'Which team should handle this ticket?',
          criteria: {
            billing: 'Payments, invoicing, refunds',
            technical: 'Bugs, outages, integrations',
            sales: 'Pricing, upgrades, new accounts',
          },
        },
        urgency: {
          type: 'score',
          instructions: 'How urgent is this ticket?',
          criteria: ['Not urgent', 'Somewhat urgent', 'Very urgent'],
        },
      }
    );

    expect(result.provider).toBe('aigateway');
    expect(result.model).toMatch(/jev/i);
    expect(result.usage.total_tokens).toBeGreaterThan(0);

    const wantsRefund = result.answers.wants_refund;
    expect(wantsRefund.type).toBe('noul');
    if (wantsRefund.type === 'noul') {
      expect(wantsRefund.noul).toBeGreaterThan(0.5);
    }

    const department = result.answers.department;
    expect(department.type).toBe('choice');
    if (department.type === 'choice') {
      expect(department.choice).toBe('billing');
      expect(Object.keys(department.probabilities).sort()).toEqual(['billing', 'sales', 'technical']);
      expect(department.confidence).toBeGreaterThan(0);
      expect(department.confidence).toBeLessThanOrEqual(1);
    }

    const urgency = result.answers.urgency;
    expect(urgency.type).toBe('score');
    if (urgency.type === 'score') {
      expect(urgency.legend).toEqual({ '0': 'Not urgent', '1': 'Somewhat urgent', '2': 'Very urgent' });
      expect(urgency.score).toBeGreaterThanOrEqual(0);
      expect(urgency.score).toBeLessThanOrEqual(2);
    }
  }, 60_000);
});
