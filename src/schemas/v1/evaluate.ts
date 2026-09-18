import { z } from '@hono/zod-openapi';

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
    && Object.values(value).every(isJsonValue);
}

export const jsonValueSchema = z.unknown().refine(isJsonValue, 'Must be a JSON value').openapi('EvaluationJsonValue', {
  description: 'Any JSON value, including nested objects and arrays.',
  anyOf: [
    { type: 'string' }, { type: 'number' }, { type: 'boolean' }, { type: 'null' },
    { type: 'object', additionalProperties: {} }, { type: 'array', items: {} },
  ],
});

export const evaluationStateSchema = z.union([
  z.string(),
  z.record(jsonValueSchema),
  z.array(jsonValueSchema),
]).openapi('EvaluationState');

export const choiceQuestionSchema = z.object({
  type: z.literal('choice'),
  instructions: jsonValueSchema,
  criteria: z.record(z.string().min(1), z.string().nullable())
    .refine(value => Object.keys(value).length > 0, 'At least one choice is required'),
}).strict().openapi('ChoiceQuestion');

export const scoreQuestionSchema = z.object({
  type: z.literal('score'),
  instructions: jsonValueSchema,
  criteria: z.array(z.string()).min(2),
}).strict().openapi('ScoreQuestion');

export const noulQuestionSchema = z.object({
  type: z.literal('noul'),
  instructions: jsonValueSchema,
  criteria: z.object({
    true: z.string().optional(),
    false: z.string().optional(),
  }).strict().optional(),
}).strict().openapi('NoulQuestion');

export const questionSchema = z.discriminatedUnion('type', [
  choiceQuestionSchema, scoreQuestionSchema, noulQuestionSchema,
]);

export const evaluationQuestionsSchema = z.record(z.string().min(1), questionSchema)
  .refine(value => Object.keys(value).length > 0, 'At least one question is required');

export const evaluationProviderSchema = z.literal('typesafe');

export const evaluateRequestSchema = z.object({
  payload: z.object({
    state: evaluationStateSchema,
    questions: evaluationQuestionsSchema,
  }).strict(),
  config: z.object({
    provider: evaluationProviderSchema,
    model: z.string().trim().min(1).optional(),
  }).strict(),
}).strict().openapi('EvaluateRequest');

const probabilitySchema = z.number().finite().min(0).max(1);
const probabilitiesSchema = z.record(z.string().min(1), probabilitySchema)
  .refine(value => Object.keys(value).length > 0, 'Probabilities must not be empty');

export const choiceAnswerSchema = z.object({
  type: z.literal('choice'),
  choice: z.string(),
  probabilities: probabilitiesSchema,
  confidence: probabilitySchema,
}).passthrough().openapi('ChoiceAnswer');

export const scoreAnswerSchema = z.object({
  type: z.literal('score'),
  score: z.number().finite().min(0),
  legend: z.record(z.string()),
  probabilities: probabilitiesSchema,
  confidence: probabilitySchema,
}).passthrough().openapi('ScoreAnswer');

export const noulAnswerSchema = z.object({
  type: z.literal('noul'),
  noul: probabilitySchema,
}).passthrough().openapi('NoulAnswer');

export const answerSchema = z.discriminatedUnion('type', [
  choiceAnswerSchema, scoreAnswerSchema, noulAnswerSchema,
]);

const tokenCountSchema = z.number().int().nonnegative();
const usageSchema = z.object({
  input_tokens: tokenCountSchema,
  output_tokens: tokenCountSchema,
  total_tokens: tokenCountSchema.optional(),
}).passthrough();

export const typeSafeResponseSchema = z.object({
  model: z.string().min(1),
  answers: z.record(answerSchema),
  usage: usageSchema,
}).passthrough();

export const evaluateResponseSchema = typeSafeResponseSchema.extend({
  provider: evaluationProviderSchema,
  usage: usageSchema.extend({ total_tokens: tokenCountSchema }),
}).openapi('EvaluateResponse');

export type EvaluationProviderName = z.infer<typeof evaluationProviderSchema>;
export type EvaluationState = z.infer<typeof evaluationStateSchema>;
export type EvaluationQuestions = z.infer<typeof evaluationQuestionsSchema>;
export type EvaluationResponse = z.infer<typeof evaluateResponseSchema>;

export interface EvaluationProvider {
  name: EvaluationProviderName;
  evaluate(state: EvaluationState, questions: EvaluationQuestions, model?: string): Promise<EvaluationResponse>;
}
