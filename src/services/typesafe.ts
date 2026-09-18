import { z } from 'zod';
import { typesafeConfig } from '../config/services';
import { evaluationAnswersSchema, type EvaluationQuestions, type EvaluationState } from '../schemas/v1/evaluate';
import { EvaluationError, type EvaluationProvider, type EvaluationResponse } from './evaluation';

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

const RETRYABLE_STATUSES = new Set([429, 529]);

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

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface TypeSafeClientOptions {
  /** Overrides; anything omitted is read from `typesafeConfig` at call time. */
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

export class TypeSafeEvaluationProvider implements EvaluationProvider {
  readonly name = 'typesafe' as const;

  private readonly options: TypeSafeClientOptions;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly retryMaxDelayMs: number;
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;

  constructor(options: TypeSafeClientOptions = {}) {
    this.options = options;
    this.maxRetries = options.maxRetries ?? 3;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 500;
    this.retryMaxDelayMs = options.retryMaxDelayMs ?? 8_000;
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.sleep = options.sleep ?? defaultSleep;
    this.random = options.random ?? Math.random;
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

  private get timeout(): number {
    return this.options.timeout ?? typesafeConfig.timeout;
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  async evaluate(state: EvaluationState, questions: EvaluationQuestions, model?: string): Promise<EvaluationResponse> {
    if (!this.isConfigured()) {
      throw new EvaluationError('TypeSafe is not configured. Set TYPESAFE_API_KEY or add a key in the admin dashboard.', {
        code: 'not_configured',
      });
    }

    const body = JSON.stringify({
      model: model || this.defaultModel,
      state,
      questions,
    });

    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await this.send(body);
      } catch (error) {
        if (error instanceof EvaluationError) throw error; // timeouts are not retried
        if (attempt < this.maxRetries) {
          await this.backoff(attempt, undefined, `network error (${describeError(error)})`);
          continue;
        }
        throw new EvaluationError('Could not reach TypeSafe', { code: 'network', cause: error });
      }

      if (response.ok) {
        return this.parseResponse(response);
      }

      const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
      if (RETRYABLE_STATUSES.has(response.status) && attempt < this.maxRetries) {
        await this.backoff(attempt, retryAfterMs, `HTTP ${response.status}`);
        continue;
      }

      throw await this.toError(response, retryAfterMs);
    }
  }

  private async send(body: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      return await this.fetchImpl(`${this.baseURL}${TYPESAFE_SYSTEMONE_PATH}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body,
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
        throw new EvaluationError(`TypeSafe request timed out after ${this.timeout}ms`, { code: 'timeout', cause: error });
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private async backoff(attempt: number, retryAfterMs: number | undefined, reason: string): Promise<void> {
    const exponential = this.retryBaseDelayMs * 2 ** attempt;
    const jitter = this.random() * this.retryBaseDelayMs * 0.5;
    const delay = Math.min(this.retryMaxDelayMs, retryAfterMs ?? exponential + jitter);
    console.warn(`[TypeSafe] ${reason}; retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${this.maxRetries})`);
    await this.sleep(delay);
  }

  private async parseResponse(response: Response): Promise<EvaluationResponse> {
    let json: unknown;
    try {
      json = await response.json();
    } catch (error) {
      throw new EvaluationError('TypeSafe returned a non-JSON response', { code: 'invalid_response', cause: error });
    }

    const parsed = upstreamResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new EvaluationError('TypeSafe returned an unexpected response shape', {
        code: 'invalid_response',
        details: parsed.error.flatten(),
      });
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

  private async toError(response: Response, retryAfterMs?: number): Promise<EvaluationError> {
    const details = await readErrorBody(response);
    const status = response.status;

    switch (status) {
      case 401:
      case 403:
        return new EvaluationError('TypeSafe rejected the API key', { code: 'unauthorized', status, details });
      case 400:
      case 422:
        return new EvaluationError('TypeSafe rejected the evaluation request', { code: 'invalid_request', status, details });
      case 429:
        return new EvaluationError('TypeSafe rate limit exceeded', { code: 'rate_limited', status, retryAfterMs, details });
      case 529:
        return new EvaluationError('TypeSafe is temporarily overloaded', { code: 'overloaded', status, retryAfterMs, details });
      default:
        return new EvaluationError(`TypeSafe request failed with HTTP ${status}`, { code: 'upstream_error', status, details });
    }
  }
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

/** Parses a Retry-After header (delta-seconds or HTTP date) into milliseconds. */
export function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return undefined;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
