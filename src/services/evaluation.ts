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
 * Evaluation providers answer typed questions about a piece of state with
 * calibrated probabilities. They do not generate text, so they intentionally
 * do NOT implement `AIProvider` and are not part of the generative
 * `serviceRegistry`. This keeps "System One" decision models separate from
 * text-generation providers while leaving room for additional decision models
 * (including small local ones) later.
 *
 * Two transports exist for Jev today: `typesafe` (TypeSafe's API directly) and
 * `aigateway` (the same model via the Vercel AI Gateway). Providers are
 * lazily instantiated and cached in `providers`.
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

const providers = new Map<EvaluationProviderName, EvaluationProvider>();

async function createEvaluationProvider(name: EvaluationProviderName): Promise<EvaluationProvider> {
  switch (name) {
    case 'typesafe': {
      const { TypeSafeEvaluationProvider } = await import('./typesafe');
      return new TypeSafeEvaluationProvider();
    }
    case 'aigateway': {
      const { AIGatewayEvaluationProvider } = await import('./aigateway-evaluation');
      return new AIGatewayEvaluationProvider();
    }
    default: {
      const unknown: never = name;
      throw new EvaluationError(`Unsupported evaluation provider: ${String(unknown)}`, { code: 'invalid_request' });
    }
  }
}

export async function getEvaluationProvider(name: EvaluationProviderName): Promise<EvaluationProvider> {
  let provider = providers.get(name);
  if (!provider) {
    provider = await createEvaluationProvider(name);
    providers.set(name, provider);
  }
  return provider;
}

/**
 * Test hook: replace the cached instance returned by `getEvaluationProvider`
 * for `provider.name`. Passing `undefined` clears every cached provider.
 */
export function __setEvaluationProviderForTests(provider: EvaluationProvider | undefined): void {
  if (provider) {
    providers.set(provider.name, provider);
  } else {
    providers.clear();
  }
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
