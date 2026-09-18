import { describe, expect, it } from 'vitest';
import {
  evaluateRequestSchema,
  evaluateResponseSchema,
  evaluationStateSchema,
  jsonValueSchema,
  questionSchema,
  typeSafeResponseSchema,
} from '../evaluate';
import { llmRequestSchema } from '../llm';
import { questions, state, upstreamResponse } from '../../../services/tests/evaluation-fixtures';

describe('evaluation schemas', () => {
  it('accepts mixed questions and preserves nested JSON state and instructions', () => {
    const request = { payload: { state, questions }, config: { provider: 'typesafe' } };
    expect(evaluateRequestSchema.parse(request)).toEqual(request);
  });

  it.each(['text', {}, [], ['chat message', { nested: [1, true, null] }]])('accepts state %j', value => {
    expect(evaluationStateSchema.parse(value)).toEqual(value);
  });

  it.each([null, true, 42, undefined, { nested: undefined }, { nested: Infinity }])('rejects state %j', value => {
    expect(evaluationStateSchema.safeParse(value).success).toBe(false);
  });

  it.each([null, 1, true, 'Instructions', ['one', 'two'], { nested: { a: null } }])('accepts JSON instructions %j', instructions => {
    expect(questionSchema.parse({ type: 'noul', instructions })).toEqual({ type: 'noul', instructions });
  });

  it.each([undefined, NaN, Infinity, () => null, new Date()])('rejects non-JSON instructions', instructions => {
    expect(jsonValueSchema.safeParse(instructions).success).toBe(false);
  });

  it.each([
    { type: 'choice', instructions: 'Pick', criteria: {} },
    { type: 'choice', instructions: 'Pick', criteria: ['a', 'b'] },
    { type: 'choice', instructions: 'Pick', criteria: { a: 1, b: false } },
    { type: 'choice', instructions: 'Pick', criteria: { '': null } },
    { type: 'score', instructions: 'Rate', criteria: ['Only one'] },
    { type: 'score', instructions: 'Rate', criteria: [] },
    { type: 'noul' },
    { type: 'noul', instructions: 'Check', criteria: { true: true } },
    { type: 'noul', instructions: 'Check', criteria: { yes: 'Yes' } },
    { type: 'text', instructions: 'Generate' },
  ])('rejects malformed question %j', question => {
    expect(questionSchema.safeParse(question).success).toBe(false);
  });

  it.each([
    { payload: { state, questions: {} }, config: { provider: 'typesafe' } },
    { payload: { state, questions }, config: { provider: 'openai' } },
    { payload: { state, questions }, config: { provider: 'typesafe', model: ' ' } },
    { payload: { state, questions }, config: { provider: 'typesafe', stream: true } },
    { payload: { questions }, config: { provider: 'typesafe' } },
  ])('rejects invalid requests', request => {
    expect(evaluateRequestSchema.safeParse(request).success).toBe(false);
  });

  it('preserves all structured answer fields and normalizes the response contract', () => {
    expect(typeSafeResponseSchema.parse(upstreamResponse)).toEqual(upstreamResponse);
    const response = {
      ...upstreamResponse,
      provider: 'typesafe',
      usage: { ...upstreamResponse.usage, total_tokens: 143 },
    };
    expect(evaluateResponseSchema.parse(response)).toEqual(response);
  });

  it.each([
    { type: 'noul', noul: 1.1 },
    { type: 'noul', noul: -0.1 },
    { type: 'choice', choice: 'a', probabilities: { a: 1 } },
    { type: 'choice', choice: 'a', probabilities: { a: 1.1 }, confidence: 1 },
    { type: 'choice', choice: 'a', probabilities: {}, confidence: 1 },
    { type: 'score', score: 1, probabilities: { '0': 1 }, confidence: 1 },
    { type: 'unknown' },
  ])('rejects malformed upstream answers', answer => {
    expect(typeSafeResponseSchema.safeParse({
      ...upstreamResponse, answers: { answer },
    }).success).toBe(false);
  });

  it('keeps TypeSafe out of generative requests', () => {
    expect(llmRequestSchema.safeParse({ provider: 'typesafe', model: 'jev-latest' }).success).toBe(false);
  });
});
