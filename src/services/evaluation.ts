import type {
  EvaluationAnswers,
  EvaluationConfig,
  EvaluationProviderName,
  EvaluationQuestions,
  EvaluationState,
  EvaluationUsage,
} from '../schemas/v1/evaluate';

/**
 * Evaluation / Decision service layer.
 *
 * Evaluation providers (TypeSafe's Jev is the first) answer typed questions
 * about a piece of state with calibrated probabilities. They do not generate
 * text, so they intentionally do NOT implement `AIProvider` and are not part of
 * the generative `serviceRegistry`. This keeps "System One" decision models
 * separate from text-generation providers while leaving room for additional
 * decision models (including small local ones) later.
 *
 * With a single implementation there is no registry yet; `getEvaluationProvider`
 * is the one place to extend when a second provider arrives.
 */

export interface EvaluationResponse {
  provider: EvaluationProviderName;
  /** The resolved model that answered, as reported by the provider. */
  model: string;
  answers: EvaluationAnswers;
  usage: EvaluationUsage;
}

export interface EvaluationProvider {
  name: EvaluationProviderName;

  /** True when the provider has the credentials/config it needs to serve requests. */
  isConfigured(): boolean;

  evaluate(state: EvaluationState, questions: EvaluationQuestions, model?: string): Promise<EvaluationResponse>;
}

export type EvaluationErrorCode =
  | 'not_configured'
  | 'unauthorized'
  | 'invalid_request'
  | 'rate_limited'
  | 'overloaded'
  | 'timeout'
  | 'network'
  | 'invalid_response'
  | 'upstream_error';

export interface EvaluationErrorOptions {
  code: EvaluationErrorCode;
  /** Upstream HTTP status, when the error originated from a provider response. */
  status?: number;
  /** Suggested wait before retrying, when the provider told us. */
  retryAfterMs?: number;
  /** Safe-to-expose detail (e.g. upstream validation message). Never includes credentials. */
  details?: unknown;
  cause?: unknown;
}

export class EvaluationError extends Error {
  readonly code: EvaluationErrorCode;
  readonly status?: number;
  readonly retryAfterMs?: number;
  readonly details?: unknown;
  readonly cause?: unknown;

  constructor(message: string, options: EvaluationErrorOptions) {
    super(message);
    this.name = 'EvaluationError';
    this.code = options.code;
    this.status = options.status;
    this.retryAfterMs = options.retryAfterMs;
    this.details = options.details;
    this.cause = options.cause;
  }
}

export function isEvaluationError(error: unknown): error is EvaluationError {
  return error instanceof EvaluationError || (error instanceof Error && error.name === 'EvaluationError');
}

let typesafeProvider: EvaluationProvider | undefined;

export async function getEvaluationProvider(name: EvaluationProviderName): Promise<EvaluationProvider> {
  switch (name) {
    case 'typesafe': {
      if (!typesafeProvider) {
        const { TypeSafeEvaluationProvider } = await import('./typesafe');
        typesafeProvider = new TypeSafeEvaluationProvider();
      }
      return typesafeProvider;
    }
    default: {
      const unknown: never = name;
      throw new EvaluationError(`Unsupported evaluation provider: ${String(unknown)}`, { code: 'invalid_request' });
    }
  }
}

/** Test hook: replace the provider instance returned by `getEvaluationProvider`. */
export function __setEvaluationProviderForTests(provider: EvaluationProvider | undefined): void {
  typesafeProvider = provider;
}

/**
 * Entry point used by API routes: resolves the provider from `config` and runs
 * the evaluation.
 */
export async function processEvaluationRequest(
  state: EvaluationState,
  questions: EvaluationQuestions,
  config: EvaluationConfig
): Promise<EvaluationResponse> {
  const provider = await getEvaluationProvider(config.provider);
  if (!provider.isConfigured()) {
    throw new EvaluationError(`Evaluation provider "${config.provider}" is not configured`, { code: 'not_configured' });
  }
  return provider.evaluate(state, questions, config.model);
}
