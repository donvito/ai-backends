import { z } from '@hono/zod-openapi';

/**
 * Schemas for the Evaluation / Decision API (POST /api/v1/evaluate).
 *
 * Evaluation providers (TypeSafe's Jev today) are not generative models: they
 * take a shared `state` plus a map of typed `questions` and return structured,
 * calibrated answers. These schemas are deliberately independent from the
 * generative `llmRequestSchema` / `providersSupported` so that an evaluation
 * provider can never be selected for a text-generation endpoint (and vice versa).
 *
 * The request/response shapes mirror the TypeSafe HTTP API so answers can be
 * returned essentially intact (probabilities and confidence included).
 */

// ---------------------------------------------------------------------------
// JSON helpers
// ---------------------------------------------------------------------------

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

// The OpenAPI generator cannot introspect z.lazy, so the document shape is
// declared explicitly (OpenAPI 3.1 allows a type array).
export const jsonValueSchema: z.ZodType<JsonValue> = z
  .lazy(() =>
    z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(jsonValueSchema)])
  )
  .openapi({
    type: ['string', 'number', 'boolean', 'object', 'array', 'null'] as unknown as 'object',
    description: 'Any JSON value',
  });

/** Text, or structured JSON (object / array). Used for `state` and `instructions`. */
const entrySchema = z.union([
  z.string().min(1, 'Must not be an empty string'),
  z.array(jsonValueSchema),
  z.record(jsonValueSchema),
]);

// ---------------------------------------------------------------------------
// Request: state
// ---------------------------------------------------------------------------

export const MAX_STATE_BYTES = 200_000;

/**
 * The content to evaluate. A plain string for text, or structured data
 * (object / array) for things like chat logs, records, tickets, PR metadata, or
 * the current state of an application.
 */
export const evaluationStateSchema = entrySchema
  .refine((value) => JSON.stringify(value).length <= MAX_STATE_BYTES, {
    message: `State must not exceed ${MAX_STATE_BYTES} characters when serialized`,
  })
  .describe('Content to evaluate: a string, or a JSON object / array');

// ---------------------------------------------------------------------------
// Request: questions
// ---------------------------------------------------------------------------

export const MAX_QUESTIONS = 50;
export const MIN_CHOICE_OPTIONS = 2;
export const MAX_CHOICE_OPTIONS = 255;
export const MIN_SCORE_LEVELS = 2;
/** TypeSafe rejects Score questions with more than 10 levels. */
export const MAX_SCORE_LEVELS = 10;

const instructionsSchema = entrySchema.describe('What the model should decide, as text or structured JSON');

const questionKeySchema = z
  .string()
  .min(1, 'Question key must not be empty')
  .max(128, 'Question key must not exceed 128 characters');

/** Choice: pick one option from a set you define. */
export const choiceQuestionSchema = z.object({
  type: z.literal('choice'),
  instructions: instructionsSchema,
  criteria: z
    .record(z.string().min(1, 'Option name must not be empty'), z.string().nullable())
    .refine((criteria) => Object.keys(criteria).length >= MIN_CHOICE_OPTIONS, {
      message: `Choice criteria must define at least ${MIN_CHOICE_OPTIONS} options`,
    })
    .refine((criteria) => Object.keys(criteria).length <= MAX_CHOICE_OPTIONS, {
      message: `Choice criteria must not define more than ${MAX_CHOICE_OPTIONS} options`,
    })
    .describe('Option name → rubric description (null when no extra detail is needed)'),
});

/** Score: rate the state along an ordered rubric (low → high). */
export const scoreQuestionSchema = z.object({
  type: z.literal('score'),
  instructions: instructionsSchema,
  criteria: z
    .array(z.string().min(1, 'Level description must not be empty'))
    .min(MIN_SCORE_LEVELS, `Score criteria must define at least ${MIN_SCORE_LEVELS} levels`)
    .max(MAX_SCORE_LEVELS, `Score criteria must not define more than ${MAX_SCORE_LEVELS} levels`)
    .describe('Ordered level descriptions, from lowest to highest (2-10 levels)'),
});

/** Noul: a yes/no judgment returning the probability of "yes". */
export const noulQuestionSchema = z.object({
  type: z.literal('noul'),
  instructions: instructionsSchema,
  criteria: z
    .object({
      true: z.string().optional().describe('What a yes (value near 1) means'),
      false: z.string().optional().describe('What a no (value near 0) means'),
    })
    .optional(),
});

export const questionSchema = z.discriminatedUnion('type', [
  choiceQuestionSchema,
  scoreQuestionSchema,
  noulQuestionSchema,
]);

export const evaluationQuestionsSchema = z
  .record(questionKeySchema, questionSchema)
  .refine((questions) => Object.keys(questions).length > 0, { message: 'At least one question is required' })
  .refine((questions) => Object.keys(questions).length <= MAX_QUESTIONS, {
    message: `No more than ${MAX_QUESTIONS} questions per request`,
  })
  .describe('Typed questions keyed by an id you choose; answers come back under the same keys');

// ---------------------------------------------------------------------------
// Request: config
// ---------------------------------------------------------------------------

/**
 * `typesafe` calls TypeSafe's API directly; `aigateway` routes the same Jev
 * model through the Vercel AI Gateway (model slug `typesafe-ai/jev`).
 */
export const evaluationProvidersSupported = z.enum(['typesafe', 'aigateway']);

export const evaluationConfigSchema = z.object({
  provider: evaluationProvidersSupported.default('typesafe').describe('Evaluation provider to use'),
  model: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Evaluation model to use (defaults to the provider default: jev-latest for typesafe, typesafe-ai/jev for aigateway)'
    ),
});

export const evaluatePayloadSchema = z.object({
  state: evaluationStateSchema,
  questions: evaluationQuestionsSchema,
});

export const evaluateRequestSchema = z.object({
  payload: evaluatePayloadSchema,
  config: evaluationConfigSchema.default({ provider: 'typesafe' }),
});

// ---------------------------------------------------------------------------
// Response
// ---------------------------------------------------------------------------

const probability = z.number().min(0).max(1);

export const choiceAnswerSchema = z
  .object({
    type: z.literal('choice'),
    choice: z.string().describe('The highest-probability option'),
    probabilities: z.record(z.string(), probability).describe('Every option mapped to its probability'),
    confidence: probability.describe('How peaked the distribution is on the winner'),
  })
  .passthrough();

export const scoreAnswerSchema = z
  .object({
    type: z.literal('score'),
    score: z.number().describe('Probability-weighted score across levels; may land between levels'),
    legend: z.record(z.string(), z.string()).describe('Level index (as string) → level description'),
    probabilities: z.record(z.string(), probability).describe('Level index (as string) → probability'),
    confidence: probability,
  })
  .passthrough();

export const noulAnswerSchema = z
  .object({
    type: z.literal('noul'),
    noul: probability.describe('Probability that the answer is yes (0 = no, 1 = yes)'),
  })
  .passthrough();

export const answerSchema = z.discriminatedUnion('type', [choiceAnswerSchema, scoreAnswerSchema, noulAnswerSchema]);

export const evaluationAnswersSchema = z.record(z.string(), answerSchema);

export const evaluationUsageSchema = z.object({
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  total_tokens: z.number().int().nonnegative(),
});

export const evaluateResponseSchema = z.object({
  provider: evaluationProvidersSupported.describe('The evaluation provider that was used'),
  model: z.string().describe('The resolved model that answered (e.g. a versioned jev model)'),
  answers: evaluationAnswersSchema,
  usage: evaluationUsageSchema,
});

export const evaluateErrorResponseSchema = z.object({
  error: z.string(),
  details: z.unknown().optional(),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EvaluationState = z.infer<typeof evaluationStateSchema>;
export type ChoiceQuestion = z.infer<typeof choiceQuestionSchema>;
export type ScoreQuestion = z.infer<typeof scoreQuestionSchema>;
export type NoulQuestion = z.infer<typeof noulQuestionSchema>;
export type EvaluationQuestion = z.infer<typeof questionSchema>;
export type EvaluationQuestions = z.infer<typeof evaluationQuestionsSchema>;
export type EvaluationProviderName = z.infer<typeof evaluationProvidersSupported>;
export type EvaluationConfig = z.infer<typeof evaluationConfigSchema>;
export type ChoiceAnswer = z.infer<typeof choiceAnswerSchema>;
export type ScoreAnswer = z.infer<typeof scoreAnswerSchema>;
export type NoulAnswer = z.infer<typeof noulAnswerSchema>;
export type EvaluationAnswer = z.infer<typeof answerSchema>;
export type EvaluationAnswers = z.infer<typeof evaluationAnswersSchema>;
export type EvaluationUsage = z.infer<typeof evaluationUsageSchema>;
export type EvaluateReq = z.infer<typeof evaluateRequestSchema>;
export type EvaluateRes = z.infer<typeof evaluateResponseSchema>;
