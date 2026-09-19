import type { EvaluationProviderName, EvaluationQuestions, EvaluationState } from '../schemas/v1/evaluate';
import { EvaluationError, type EvaluationProvider, type EvaluationResponse } from './evaluation';

/**
 * Shared native-fetch transport for HTTP evaluation providers.
 *
 * Handles per-attempt timeouts, exponential backoff with jitter for 429/529
 * and network errors, Retry-After parsing, and mapping of upstream HTTP
 * statuses to `EvaluationError` codes. Subclasses describe the wire format:
 * where to POST, which headers to send, how to build the body, and how to
 * turn the upstream JSON into an `EvaluationResponse`.
 */

const RETRYABLE_STATUSES = new Set([429, 529]);

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface HttpEvaluationClientOptions {
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

export interface EvaluationHttpRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export abstract class HttpEvaluationProvider implements EvaluationProvider {
  abstract readonly name: EvaluationProviderName;
  /** Human-readable upstream name used in error messages and logs. */
  protected abstract readonly displayName: string;

  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly retryMaxDelayMs: number;
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;

  protected constructor(options: HttpEvaluationClientOptions = {}) {
    this.maxRetries = options.maxRetries ?? 3;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 500;
    this.retryMaxDelayMs = options.retryMaxDelayMs ?? 8_000;
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.sleep = options.sleep ?? defaultSleep;
    this.random = options.random ?? Math.random;
  }

  abstract isConfigured(): boolean;

  /** Per-attempt timeout in milliseconds; resolved per call so config overrides apply. */
  protected abstract get timeout(): number;

  /** Error thrown when `isConfigured()` is false. */
  protected abstract notConfiguredError(): EvaluationError;

  protected abstract buildRequest(state: EvaluationState, questions: EvaluationQuestions, model?: string): EvaluationHttpRequest;

  /** Validates the upstream JSON and maps it to the public response shape. */
  protected abstract parseResponse(
    json: unknown,
    questions: EvaluationQuestions,
    model?: string
  ): EvaluationResponse;

  async evaluate(state: EvaluationState, questions: EvaluationQuestions, model?: string): Promise<EvaluationResponse> {
    if (!this.isConfigured()) {
      throw this.notConfiguredError();
    }

    const request = this.buildRequest(state, questions, model);

    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await this.send(request);
      } catch (error) {
        if (error instanceof EvaluationError) throw error; // timeouts are not retried
        if (attempt < this.maxRetries) {
          await this.backoff(attempt, undefined, `network error (${describeError(error)})`);
          continue;
        }
        throw new EvaluationError(`Could not reach ${this.displayName}`, { code: 'network', cause: error });
      }

      if (response.ok) {
        return this.parseResponse(await this.readJson(response), questions, model);
      }

      const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
      if (RETRYABLE_STATUSES.has(response.status) && attempt < this.maxRetries) {
        await this.backoff(attempt, retryAfterMs, `HTTP ${response.status}`);
        continue;
      }

      throw await this.toError(response, retryAfterMs);
    }
  }

  private async send(request: EvaluationHttpRequest): Promise<Response> {
    const controller = new AbortController();
    const timeout = this.timeout;
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      return await this.fetchImpl(request.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...request.headers,
        },
        body: request.body,
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
        throw new EvaluationError(`${this.displayName} request timed out after ${timeout}ms`, { code: 'timeout', cause: error });
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
    console.warn(`[${this.displayName}] ${reason}; retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${this.maxRetries})`);
    await this.sleep(delay);
  }

  private async readJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch (error) {
      throw new EvaluationError(`${this.displayName} returned a non-JSON response`, { code: 'invalid_response', cause: error });
    }
  }

  protected invalidResponseError(details: unknown): EvaluationError {
    return new EvaluationError(`${this.displayName} returned an unexpected response shape`, {
      code: 'invalid_response',
      details,
    });
  }

  private async toError(response: Response, retryAfterMs?: number): Promise<EvaluationError> {
    const details = await readErrorBody(response);
    const status = response.status;
    const name = this.displayName;

    switch (status) {
      case 401:
      case 403:
        return new EvaluationError(`${name} rejected the API key`, { code: 'unauthorized', status, details });
      case 400:
      case 422:
        return new EvaluationError(`${name} rejected the evaluation request`, { code: 'invalid_request', status, details });
      case 429:
        return new EvaluationError(`${name} rate limit exceeded`, { code: 'rate_limited', status, retryAfterMs, details });
      case 529:
        return new EvaluationError(`${name} is temporarily overloaded`, { code: 'overloaded', status, retryAfterMs, details });
      default:
        return new EvaluationError(`${name} request failed with HTTP ${status}`, { code: 'upstream_error', status, details });
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
  const trimmed = value.trim();
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return seconds >= 0 ? Math.round(seconds * 1000) : undefined;
  }
  const date = Date.parse(trimmed);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return undefined;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
