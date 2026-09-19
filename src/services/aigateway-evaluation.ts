import { z } from 'zod';
import { aigatewayConfig } from '../config/services';
import {
  evaluationAnswersSchema,
  type EvaluationAnswers,
  type EvaluationQuestions,
  type EvaluationState,
} from '../schemas/v1/evaluate';
import { EvaluationError, type EvaluationProvider, type EvaluationResponse } from './evaluation';
import { parseRetryAfter, type FetchLike } from './typesafe';

/**
 * Evaluation provider that calls TypeSafe's Jev through Vercel AI Gateway.
 *
 * The gateway exposes evaluation models only on its AI SDK protocol surface
 * (not on the OpenAI-compatible endpoints):
 *
 *   POST {evaluationBaseURL}/evaluation-model
 *   Authorization: Bearer AI_GATEWAY_API_KEY
 *   ai-evaluation-model-specification-version: 4
 *   ai-model-id: typesafe-ai/jev
 *   body: { state, questions }
 *
 * Wire differences vs the direct TypeSafe API: the model travels in the
 * `ai-model-id` header (not the body), boolean questions/answers are typed
 * `boolean` instead of `noul`, score answers carry no `legend` (rebuilt from
 * the request's criteria), and per-question `confidence` arrives under
 * `providerMetadata.typesafe.confidence` instead of inside each answer.
 * All of this is translated here so API consumers see one shape regardless
 * of which provider serves the evaluation.
 */

export const AIGATEWAY_EVALUATION_DEFAULT_MODEL = 'typesafe-ai/jev';

const RETRYABLE_STATUSES = new Set([429, 529]);

const gatewayAnswerSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('choice'),
    choice: z.string(),
    probabilities: z.record(z.string(), z.number()).optional(),
  }),
  z.object({
    type: z.literal('score'),
    score: z.number(),
    probabilities: z.record(z.string(), z.number()).optional(),
  }),
  z.object({
    type: z.literal('boolean'),
    probability: z.number(),
  }),
]);

const gatewayResponseSchema = z
  .object({
    answers: z.record(z.string(), gatewayAnswerSchema),
    usage: z
      .object({
        inputTokens: z.number().optional(),
        outputTokens: z.number().optional(),
      })
      .passthrough()
      .optional(),
    providerMetadata: z
      .object({
        typesafe: z
          .object({ confidence: z.record(z.string(), z.number()).optional() })
          .passthrough()
          .optional(),
        gateway: z
          .object({
            routing: z.object({ canonicalSlug: z.string().optional() }).passthrough().optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export interface AIGatewayEvaluationProviderOptions {
  /** Overrides; anything omitted is read from `aigatewayConfig` at call time. */
  apiKey?: string;
  baseURL?: string;
  model?: string;
  /** Per-attempt timeout in milliseconds. */
  timeout?: number;
  /** Number of retries after the first attempt for 429/529/network errors. */
  maxRetries?: number;
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
  /** Injectable for tests. */
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class AIGatewayEvaluationProvider implements EvaluationProvider {
  readonly name = 'aigateway' as const;

  private readonly options: AIGatewayEvaluationProviderOptions;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly retryMaxDelayMs: number;
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;

  constructor(options: AIGatewayEvaluationProviderOptions = {}) {
    this.options = options;
    this.maxRetries = options.maxRetries ?? 3;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 500;
    this.retryMaxDelayMs = options.retryMaxDelayMs ?? 8_000;
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.sleep = options.sleep ?? defaultSleep;
    this.random = options.random ?? Math.random;
  }

  // Credentials are resolved per call so dashboard-managed key overrides
  // (admin-store mutates aigatewayConfig.apiKey) take effect immediately.
  private get apiKey(): string {
    return this.options.apiKey ?? aigatewayConfig.apiKey;
  }

  private get baseURL(): string {
    return (this.options.baseURL ?? aigatewayConfig.evaluationBaseURL).replace(/\/+$/, '');
  }

  private get defaultModel(): string {
    return this.options.model ?? aigatewayConfig.evaluationModel ?? AIGATEWAY_EVALUATION_DEFAULT_MODEL;
  }

  private get timeout(): number {
    return this.options.timeout ?? aigatewayConfig.evaluationTimeout;
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  async evaluate(state: EvaluationState, questions: EvaluationQuestions, model?: string): Promise<EvaluationResponse> {
    if (!this.isConfigured()) {
      throw new EvaluationError('AI Gateway is not configured. Set AI_GATEWAY_API_KEY or add a key in the admin dashboard.', {
        code: 'not_configured',
      });
    }

    const modelId = model || this.defaultModel;
    const body = JSON.stringify({ state, questions: toGatewayQuestions(questions) });

    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await this.send(body, modelId);
      } catch (error) {
        if (error instanceof EvaluationError) throw error; // timeouts are not retried
        if (attempt < this.maxRetries) {
          await this.backoff(attempt, undefined, `network error (${describeError(error)})`);
          continue;
        }
        throw new EvaluationError('Could not reach Vercel AI Gateway', { code: 'network', cause: error });
      }

      if (response.ok) {
        return this.parseResponse(response, questions, modelId);
      }

      const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
      if (RETRYABLE_STATUSES.has(response.status) && attempt < this.maxRetries) {
        await this.backoff(attempt, retryAfterMs, `HTTP ${response.status}`);
        continue;
      }

      throw await this.toError(response, retryAfterMs);
    }
  }

  private async send(body: string, modelId: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      return await this.fetchImpl(`${this.baseURL}/evaluation-model`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'ai-gateway-protocol-version': '0.0.1',
          'ai-gateway-auth-method': 'api-key',
          'ai-evaluation-model-specification-version': '4',
          'ai-model-id': modelId,
        },
        body,
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
        throw new EvaluationError(`AI Gateway request timed out after ${this.timeout}ms`, { code: 'timeout', cause: error });
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private async backoff(attempt: number, retryAfterMs: number | undefined, reason: string): Promise<void> {
    const exponential = this.retryBaseDelayMs * 2 ** attempt;
    const jitter = this.random() * this.retryBaseDelayMs * 0.5;
    // Retry-After is the upstream rate-limit deadline; only cap our own backoff.
    const delay = retryAfterMs ?? Math.min(this.retryMaxDelayMs, exponential + jitter);
    console.warn(`[AIGateway] ${reason}; retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${this.maxRetries})`);
    await this.sleep(delay);
  }

  private async parseResponse(
    response: Response,
    questions: EvaluationQuestions,
    modelId: string
  ): Promise<EvaluationResponse> {
    let json: unknown;
    try {
      json = await response.json();
    } catch (error) {
      throw new EvaluationError('AI Gateway returned a non-JSON response', { code: 'invalid_response', cause: error });
    }

    const parsed = gatewayResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new EvaluationError('AI Gateway returned an unexpected response shape', {
        code: 'invalid_response',
        details: parsed.error.flatten(),
      });
    }

    const confidenceByQuestion = parsed.data.providerMetadata?.typesafe?.confidence ?? {};
    const answers = fromGatewayAnswers(parsed.data.answers, questions, confidenceByQuestion);

    const inputTokens = parsed.data.usage?.inputTokens ?? 0;
    const outputTokens = parsed.data.usage?.outputTokens ?? 0;

    return {
      provider: this.name,
      model: parsed.data.providerMetadata?.gateway?.routing?.canonicalSlug ?? modelId,
      answers,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
      },
    };
  }

  private async toError(response: Response, retryAfterMs?: number): Promise<EvaluationError> {
    const details = await readErrorBody(response);
    const status = response.status;

    switch (status) {
      case 401:
      case 403:
        return new EvaluationError('AI Gateway rejected the API key', { code: 'unauthorized', status, details });
      case 400:
      case 404:
      case 422:
        return new EvaluationError('AI Gateway rejected the evaluation request', { code: 'invalid_request', status, details });
      case 429:
        return new EvaluationError('AI Gateway rate limit exceeded', { code: 'rate_limited', status, retryAfterMs, details });
      case 529:
        return new EvaluationError('AI Gateway is temporarily overloaded', { code: 'overloaded', status, retryAfterMs, details });
      default:
        return new EvaluationError(`AI Gateway request failed with HTTP ${status}`, { code: 'upstream_error', status, details });
    }
  }
}

/**
 * The gateway's evaluation protocol calls yes/no questions "boolean" while the
 * AIBackends API follows TypeSafe's native "noul" naming. `criteria` is
 * unchanged ({ true: ..., false: ... }) between the two.
 */
function toGatewayQuestions(questions: EvaluationQuestions): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  for (const [key, question] of Object.entries(questions)) {
    mapped[key] = question.type === 'noul' ? { ...question, type: 'boolean' } : question;
  }
  return mapped;
}

type GatewayAnswers = z.infer<typeof gatewayResponseSchema>['answers'];
type GatewayAnswer = GatewayAnswers[string];
type RequestedQuestion = EvaluationQuestions[string];

function fromGatewayAnswers(
  answers: GatewayAnswers,
  questions: EvaluationQuestions,
  confidence: Record<string, number>
): EvaluationAnswers {
  const mapped: EvaluationAnswers = {};
  for (const [key, answer] of Object.entries(answers)) {
    mapped[key] = translateAnswer(key, answer, questions[key], confidence[key]);
  }
  // Missing calibration is an upstream defect, not a real zero — validate the
  // translated answers so fabricated probabilities/confidence never reach clients.
  const validated = evaluationAnswersSchema.safeParse(mapped);
  if (!validated.success) {
    throw new EvaluationError('AI Gateway returned invalid answer calibration', {
      code: 'invalid_response',
      details: validated.error.flatten(),
    });
  }
  return validated.data;
}

function translateAnswer(
  key: string,
  answer: GatewayAnswer,
  question: RequestedQuestion | undefined,
  confidence: number | undefined
): EvaluationAnswers[string] {
  switch (answer.type) {
    case 'boolean': {
      if (question?.type !== 'noul') throw mismatchedAnswer(key, answer.type, question);
      return { type: 'noul', noul: answer.probability };
    }
    case 'choice': {
      if (question?.type !== 'choice') throw mismatchedAnswer(key, answer.type, question);
      const probabilities = requireProbabilities(key, answer.probabilities);
      for (const option of Object.keys(probabilities)) {
        if (!(option in question.criteria)) {
          throw new EvaluationError(
            `AI Gateway returned a probability for unknown option "${option}" in question "${key}"`,
            { code: 'invalid_response' }
          );
        }
      }
      if (!(answer.choice in question.criteria)) {
        throw new EvaluationError(`AI Gateway chose unknown option "${answer.choice}" for question "${key}"`, {
          code: 'invalid_response',
        });
      }
      return {
        type: 'choice',
        choice: answer.choice,
        probabilities,
        confidence: requireConfidence(key, confidence),
      };
    }
    case 'score': {
      if (question?.type !== 'score') throw mismatchedAnswer(key, answer.type, question);
      const probabilities = requireProbabilities(key, answer.probabilities);
      for (const level of Object.keys(probabilities)) {
        const index = Number(level);
        if (!Number.isInteger(index) || index < 0 || index >= question.criteria.length) {
          throw new EvaluationError(
            `AI Gateway returned a probability for out-of-range level "${level}" in question "${key}"`,
            { code: 'invalid_response' }
          );
        }
      }
      if (!Number.isFinite(answer.score)) {
        throw new EvaluationError(`AI Gateway returned a non-finite score for question "${key}"`, {
          code: 'invalid_response',
        });
      }
      // The gateway drops `legend`; rebuild it from the request's ordered criteria.
      const legend: Record<string, string> = {};
      question.criteria.forEach((level, index) => {
        legend[String(index)] = level;
      });
      return {
        type: 'score',
        score: answer.score,
        legend,
        probabilities,
        confidence: requireConfidence(key, confidence),
      };
    }
  }
}

function requireProbabilities(key: string, probabilities: Record<string, number> | undefined): Record<string, number> {
  if (!probabilities || Object.keys(probabilities).length === 0) {
    throw new EvaluationError(`AI Gateway omitted the probability distribution for question "${key}"`, {
      code: 'invalid_response',
    });
  }
  return probabilities;
}

function requireConfidence(key: string, confidence: number | undefined): number {
  if (confidence === undefined || !Number.isFinite(confidence)) {
    throw new EvaluationError(`AI Gateway omitted confidence for question "${key}"`, { code: 'invalid_response' });
  }
  return confidence;
}

function mismatchedAnswer(key: string, answerType: string, question: RequestedQuestion | undefined): never {
  throw new EvaluationError(
    `AI Gateway answered question "${key}" with type "${answerType}" but the request asked "${question?.type ?? 'no such question'}"`,
    { code: 'invalid_response' }
  );
}

async function readErrorBody(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    if (!text) return undefined;
    try {
      return JSON.parse(text);
    } catch {
      return text.slice(0, 500);
    }
  } catch {
    return undefined;
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
