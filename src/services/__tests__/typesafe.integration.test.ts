import { describe, expect, it } from 'vitest';
import { TypeSafeEvaluationProvider } from '../typesafe';

/**
 * Opt-in integration test against the real TypeSafe API.
 *
 *   TYPESAFE_API_KEY=... bun run test:integration
 *
 * Skipped automatically when no key is present so normal CI never needs live
 * credentials.
 */
const apiKey = process.env.TYPESAFE_API_KEY;

describe.skipIf(!apiKey)('TypeSafe Jev (live)', () => {
  const provider = new TypeSafeEvaluationProvider({
    apiKey,
    baseURL: process.env.TYPESAFE_BASE_URL,
    timeout: 30_000,
  });

  it('answers one Noul and one Choice question about a support ticket', async () => {
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
      }
    );

    expect(result.provider).toBe('typesafe');
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
      const total = Object.values(department.probabilities).reduce((sum, p) => sum + p, 0);
      expect(total).toBeCloseTo(1, 1);
      expect(department.confidence).toBeGreaterThan(0);
      expect(department.confidence).toBeLessThanOrEqual(1);
    }
  }, 60_000);
});
