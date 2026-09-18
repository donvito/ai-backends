import type { TypeSafeConfig } from '../../config/services';
import type { EvaluationQuestions } from '../../schemas/v1/evaluate';

export const state = {
  user_request: 'Create an invoice for Acme Corp',
  history: [{ role: 'user', text: 'Hello', metadata: { active: true, amount: null } }],
};

export const questions: EvaluationQuestions = {
  route: {
    type: 'choice',
    instructions: { task: 'Which team should handle this?', context: ['Choose one'] },
    criteria: { accounting: 'Invoices and bookkeeping', human: null },
  },
  risk: {
    type: 'score',
    instructions: 'How risky is this request?',
    criteria: ['Low', 'Medium', 'High'],
  },
  needs_clarification: {
    type: 'noul',
    instructions: 'Is required information missing?',
    criteria: { true: 'Information missing', false: 'Ready to execute' },
  },
};

export const upstreamResponse = {
  model: 'jev-latest',
  answers: {
    route: {
      type: 'choice',
      choice: 'accounting',
      probabilities: { accounting: 0.94, human: 0.06 },
      confidence: 0.91,
    },
    risk: {
      type: 'score',
      score: 1.6,
      legend: { '0': 'Low', '1': 'Medium', '2': 'High' },
      probabilities: { '0': 0.05, '1': 0.3, '2': 0.65 },
      confidence: 0.78,
    },
    needs_clarification: { type: 'noul', noul: 0.18 },
  },
  usage: { input_tokens: 123, output_tokens: 20 },
};

export const testConfig: TypeSafeConfig = {
  name: 'TypeSafe',
  priority: 1,
  enabled: true,
  apiKey: 'test-typesafe-key',
  baseURL: 'https://typesafe.example',
  model: 'jev-latest',
  timeout: 10000,
};
