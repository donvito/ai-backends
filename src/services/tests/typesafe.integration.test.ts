import { describe, expect, it } from 'vitest';
import { evaluateResponseSchema } from '../../schemas/v1/evaluate';
import { TypeSafeEvaluationProvider } from '../typesafe';

describe.skipIf(process.env.RUN_TYPESAFE_INTEGRATION !== '1')('TypeSafe live integration', () => {
  it('evaluates one Choice and one Noul with real credentials', async () => {
    if (!process.env.TYPESAFE_API_KEY) throw new Error('Set TYPESAFE_API_KEY to run live integration tests.');
    const provider = new TypeSafeEvaluationProvider();
    const result = await provider.evaluate('Please create an invoice for Acme Corp.', {
      route: {
        type: 'choice',
        instructions: 'Which department handles this request?',
        criteria: { accounting: 'Invoices and payments', research: 'Research and documents' },
      },
      invoice_requested: { type: 'noul', instructions: 'Is the user requesting an invoice?' },
    });
    expect(evaluateResponseSchema.safeParse(result).success).toBe(true);
    expect(result.answers.route.type).toBe('choice');
    expect(result.answers.invoice_requested.type).toBe('noul');
    expect(result.usage.total_tokens).toBeGreaterThan(0);
  }, 30000);
});
