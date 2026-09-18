import { describe, expect, it } from 'vitest';
import {
  answerSchema,
  evaluateRequestSchema,
  evaluateResponseSchema,
  evaluationQuestionsSchema,
  evaluationStateSchema,
  questionSchema,
} from '../evaluate';

const routeQuestion = {
  type: 'choice',
  instructions: 'Which agent should handle this request?',
  criteria: {
    accounting: 'Invoices and bookkeeping',
    research: 'Research and documents',
    coder: 'Software development',
    human: null,
  },
} as const;

const urgencyQuestion = {
  type: 'score',
  instructions: 'How urgent is this request?',
  criteria: ['Not urgent', 'Somewhat urgent', 'Very urgent'],
} as const;

const clarificationQuestion = {
  type: 'noul',
  instructions: 'Is information required before this request can be executed?',
  criteria: { true: 'Key details are missing', false: 'The request is actionable as-is' },
} as const;

describe('evaluateRequestSchema', () => {
  it('accepts a valid request mixing choice, score, and noul questions', () => {
    const result = evaluateRequestSchema.safeParse({
      payload: {
        state: { user_request: 'Create an invoice for Acme Corp' },
        questions: {
          route: routeQuestion,
          urgency: urgencyQuestion,
          needs_clarification: clarificationQuestion,
        },
      },
      config: { provider: 'typesafe', model: 'jev-latest' },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(Object.keys(result.data.payload.questions)).toEqual(['route', 'urgency', 'needs_clarification']);
      expect(result.data.config).toEqual({ provider: 'typesafe', model: 'jev-latest' });
    }
  });

  it('defaults config to the typesafe provider when omitted', () => {
    const result = evaluateRequestSchema.safeParse({
      payload: { state: 'Help! My payouts have been failing for 3 days.', questions: { urgent: clarificationQuestion } },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.config.provider).toBe('typesafe');
      expect(result.data.config.model).toBeUndefined();
    }
  });

  it('rejects generative providers so Jev-only config cannot leak into LLM endpoints and vice versa', () => {
    const result = evaluateRequestSchema.safeParse({
      payload: { state: 'x', questions: { q: clarificationQuestion } },
      config: { provider: 'openai', model: 'gpt-4.1-nano' },
    });
    expect(result.success).toBe(false);
  });
});

describe('evaluationStateSchema', () => {
  it('accepts plain text', () => {
    expect(evaluationStateSchema.safeParse('I was charged twice.').success).toBe(true);
  });

  it('accepts structured JSON objects and arrays, including nested values', () => {
    const ticket = {
      id: 'T-123',
      customer: { tier: 'enterprise', anger: 0.7, vip: true },
      messages: [{ role: 'user', text: 'Refund me' }, { role: 'agent', text: null }],
    };
    expect(evaluationStateSchema.safeParse(ticket).success).toBe(true);
    expect(evaluationStateSchema.safeParse([{ role: 'user', text: 'hi' }, 'raw text', 3]).success).toBe(true);
  });

  it('rejects empty strings, numbers, booleans, and null', () => {
    expect(evaluationStateSchema.safeParse('').success).toBe(false);
    expect(evaluationStateSchema.safeParse(42).success).toBe(false);
    expect(evaluationStateSchema.safeParse(true).success).toBe(false);
    expect(evaluationStateSchema.safeParse(null).success).toBe(false);
  });
});

describe('questionSchema', () => {
  it('rejects unknown question types', () => {
    const result = questionSchema.safeParse({ type: 'summary', instructions: 'Summarize this' });
    expect(result.success).toBe(false);
  });

  it('rejects malformed choice criteria', () => {
    // criteria must be a map, not a list
    expect(
      questionSchema.safeParse({ type: 'choice', instructions: 'Pick', criteria: ['a', 'b'] }).success
    ).toBe(false);
    // descriptions must be string or null
    expect(
      questionSchema.safeParse({ type: 'choice', instructions: 'Pick', criteria: { a: 1, b: 'ok' } }).success
    ).toBe(false);
    // at least two options
    expect(
      questionSchema.safeParse({ type: 'choice', instructions: 'Pick', criteria: { only: 'one' } }).success
    ).toBe(false);
    // missing criteria entirely
    expect(questionSchema.safeParse({ type: 'choice', instructions: 'Pick' }).success).toBe(false);
  });

  it('allows null option descriptions in choice criteria', () => {
    expect(
      questionSchema.safeParse({ type: 'choice', instructions: 'Pick', criteria: { a: null, b: null } }).success
    ).toBe(true);
  });

  it('rejects score questions with fewer than two levels', () => {
    expect(
      questionSchema.safeParse({ type: 'score', instructions: 'Rate', criteria: ['Only level'] }).success
    ).toBe(false);
    expect(questionSchema.safeParse({ type: 'score', instructions: 'Rate', criteria: [] }).success).toBe(false);
  });

  it('accepts noul questions with and without criteria', () => {
    expect(questionSchema.safeParse({ type: 'noul', instructions: 'Is it urgent?' }).success).toBe(true);
    expect(
      questionSchema.safeParse({ type: 'noul', instructions: 'Is it urgent?', criteria: { true: 'yes means' } }).success
    ).toBe(true);
  });

  it('accepts structured JSON instructions', () => {
    expect(
      questionSchema.safeParse({
        type: 'noul',
        instructions: { question: 'Does `description` ask to sponsor the newsletter?', field: 'description' },
      }).success
    ).toBe(true);
  });

  it('rejects empty instructions', () => {
    expect(questionSchema.safeParse({ type: 'noul', instructions: '' }).success).toBe(false);
  });
});

describe('evaluationQuestionsSchema', () => {
  it('rejects an empty question map', () => {
    const result = evaluationQuestionsSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/at least one question/i);
    }
  });

  it('rejects question maps with an empty key', () => {
    expect(evaluationQuestionsSchema.safeParse({ '': clarificationQuestion }).success).toBe(false);
  });
});

describe('answer schemas', () => {
  it('parses choice, score, and noul answers as a discriminated union', () => {
    expect(
      answerSchema.safeParse({
        type: 'choice',
        choice: 'accounting',
        probabilities: { accounting: 0.94, research: 0.02, coder: 0.01, human: 0.03 },
        confidence: 0.91,
      }).success
    ).toBe(true);
    expect(
      answerSchema.safeParse({
        type: 'score',
        score: 1.6,
        legend: { '0': 'Calm', '1': 'Frustrated', '2': 'Very angry' },
        probabilities: { '0': 0.05, '1': 0.3, '2': 0.65 },
        confidence: 0.78,
      }).success
    ).toBe(true);
    expect(answerSchema.safeParse({ type: 'noul', noul: 0.18 }).success).toBe(true);
  });

  it('rejects answers whose shape does not match their type', () => {
    expect(answerSchema.safeParse({ type: 'choice', choice: 'a' }).success).toBe(false);
    expect(answerSchema.safeParse({ type: 'noul', noul: 1.5 }).success).toBe(false);
    expect(answerSchema.safeParse({ type: 'score', score: 1 }).success).toBe(false);
  });

  it('validates the full response envelope', () => {
    const result = evaluateResponseSchema.safeParse({
      provider: 'typesafe',
      model: 'jev-latest',
      answers: { needs_clarification: { type: 'noul', noul: 0.18 } },
      usage: { input_tokens: 123, output_tokens: 20, total_tokens: 143 },
    });
    expect(result.success).toBe(true);
  });
});
