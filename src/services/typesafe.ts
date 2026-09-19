import { z } from 'zod';
import { typesafeConfig } from '../config/services';
import { evaluationAnswersSchema, type EvaluationQuestions, type EvaluationState } from '../schemas/v1/evaluate';
import { EvaluationError, type EvaluationResponse } from './evaluation';
import { HttpEvaluationProvider, type EvaluationHttpRequest, type HttpEvaluationClientOptions } from './evaluation-http';

export { parseRetryAfter, type FetchLike } from './evaluation-http';

/**
 * Thin native-fetch wrapper around TypeSafe's System One endpoint (Jev).
 *
 *   POST {baseURL}/v1/systemone
 *   Authorization: Bearer TYPESAFE_API_KEY
 *
 * The request body is forwarded as-is (`state`, `questions`, `model`) and the
 * response is validated but otherwise returned intact. 429 and 529 responses
 * are retried with exponential backoff, mirroring the official SDK.
 */

export const TYPESAFE_DEFAULT_MODEL = 'jev-latest';
export const TYPESAFE_SYSTEMONE_PATH = '/v1/systemone';

const upstreamResponseSchema = z
  .object({
    model: z.string(),
    answers: evaluationAnswersSchema,
    usage: z
      .object({
        input_tokens: z.number().int().nonnegative().optional(),
        output_tokens: z.number().int().nonnegative().optional(),
        total_tokens: z.number().int().nonnegative().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export interface TypeSafeClientOptions extends HttpEvaluationClientOptions {
  /** Overrides; anything omitted is read from `typesafeConfig` at call time. */
  apiKey?: string;
  baseURL?: string;
  model?: string;
}

export class TypeSafeEvaluationProvider extends HttpEvaluationProvider {
  readonly name = 'typesafe' as const;
  protected readonly displayName = 'TypeSafe';

  private readonly options: TypeSafeClientOptions;

  constructor(options: TypeSafeClientOptions = {}) {
    super(options);
    this.options = options;
  }

  // Credentials are resolved per call so dashboard-managed key overrides
  // (admin-store mutates typesafeConfig.apiKey) take effect immediately.
  private get apiKey(): string {
    return this.options.apiKey ?? typesafeConfig.apiKey;
  }

  private get baseURL(): string {
    return (this.options.baseURL ?? typesafeConfig.baseURL).replace(/\/+$/, '');
  }

  private get defaultModel(): string {
    return this.options.model ?? typesafeConfig.model ?? TYPESAFE_DEFAULT_MODEL;
  }

  protected get timeout(): number {
    return this.options.timeout ?? typesafeConfig.timeout;
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  protected notConfiguredError(): EvaluationError {
    return new EvaluationError('TypeSafe is not configured. Set TYPESAFE_API_KEY or add a key in the admin dashboard.', {
      code: 'not_configured',
    });
  }

  protected buildRequest(state: EvaluationState, questions: EvaluationQuestions, model?: string): EvaluationHttpRequest {
    return {
      url: `${this.baseURL}${TYPESAFE_SYSTEMONE_PATH}`,
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: model || this.defaultModel, state, questions }),
    };
  }

  protected parseResponse(json: unknown): EvaluationResponse {
    const parsed = upstreamResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw this.invalidResponseError(parsed.error.flatten());
    }

    const inputTokens = parsed.data.usage?.input_tokens ?? 0;
    const outputTokens = parsed.data.usage?.output_tokens ?? 0;

    return {
      provider: this.name,
      model: parsed.data.model,
      answers: parsed.data.answers,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: parsed.data.usage?.total_tokens ?? inputTokens + outputTokens,
      },
    };
  }
}
