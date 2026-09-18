import { setTimeout as delay } from 'node:timers/promises';
import { typesafeConfig, type TypeSafeConfig } from '../config/services';
import {
  type EvaluationProvider,
  type EvaluationQuestions,
  type EvaluationResponse,
  type EvaluationState,
  typeSafeResponseSchema,
} from '../schemas/v1/evaluate';

export class TypeSafeEvaluationError extends Error {
  constructor(message: string, public readonly status: 429 | 502 | 503 | 504) {
    super(message);
    this.name = 'TypeSafeEvaluationError';
  }
}

function upstreamError(status: number): TypeSafeEvaluationError {
  if (status === 401 || status === 403) {
    return new TypeSafeEvaluationError('TypeSafe authentication failed. Check the configured API key.', 502);
  }
  if (status === 422) return new TypeSafeEvaluationError('TypeSafe rejected the evaluation request.', 502);
  if (status === 429) return new TypeSafeEvaluationError('TypeSafe rate limit exceeded. Try again later.', 429);
  if (status === 529 || status === 503) {
    return new TypeSafeEvaluationError('TypeSafe is temporarily unavailable.', 503);
  }
  return new TypeSafeEvaluationError('TypeSafe evaluation failed.', 502);
}

export function getTypeSafeStatus() {
  return {
    enabled: typesafeConfig.enabled,
    available: typesafeConfig.enabled && !!typesafeConfig.apiKey,
    config: { model: typesafeConfig.model, hasApiKey: !!typesafeConfig.apiKey },
  };
}

function matchesQuestions(
  answers: EvaluationResponse['answers'],
  questions: EvaluationQuestions,
): boolean {
  if (Object.keys(answers).length !== Object.keys(questions).length) return false;
  return Object.entries(questions).every(([key, question]) => {
    const answer = answers[key];
    if (!answer || answer.type !== question.type) return false;
    if (answer.type === 'choice' && question.type === 'choice') {
      const options = Object.keys(question.criteria);
      return options.includes(answer.choice)
        && Object.keys(answer.probabilities).length === options.length
        && options.every(option => Object.prototype.hasOwnProperty.call(answer.probabilities, option));
    }
    if (answer.type === 'score' && question.type === 'score') {
      return answer.score <= question.criteria.length - 1
        && Object.keys(answer.legend).length === question.criteria.length
        && Object.keys(answer.probabilities).length === question.criteria.length
        && question.criteria.every((level, index) =>
          answer.legend[index] === level && Object.prototype.hasOwnProperty.call(answer.probabilities, index));
    }
    return true;
  });
}

export class TypeSafeEvaluationProvider implements EvaluationProvider {
  readonly name = 'typesafe';

  constructor(private readonly config: TypeSafeConfig = typesafeConfig) {}

  async evaluate(
    state: EvaluationState,
    questions: EvaluationQuestions,
    model = this.config.model,
  ): Promise<EvaluationResponse> {
    if (!this.config.enabled || !this.config.apiKey) {
      throw new TypeSafeEvaluationError('TypeSafe is not configured.', 503);
    }
    if (!Number.isSafeInteger(this.config.timeout) || this.config.timeout <= 0) {
      throw new TypeSafeEvaluationError('TypeSafe timeout configuration is invalid.', 503);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeout);
    const body = JSON.stringify({ state, questions, model });
    try {
      for (let attempt = 0; ; attempt++) {
        const response = await fetch(`${this.config.baseURL.replace(/\/+$/, '')}/v1/systemone`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body,
          signal: controller.signal,
          redirect: 'error',
        });

        if (!response.ok) {
          await response.body?.cancel();
          if ((response.status === 429 || response.status === 529) && attempt < 2) {
            const retryAfter = response.headers.get('Retry-After');
            const seconds = retryAfter === null ? NaN : Number(retryAfter);
            const retryDelay = Number.isFinite(seconds)
              ? seconds * 1000
              : Date.parse(retryAfter || '') - Date.now();
            await delay(Math.min(this.config.timeout, Math.max(250 * 2 ** attempt, retryDelay || 0)), undefined, {
              signal: controller.signal,
            });
            continue;
          }
          throw upstreamError(response.status);
        }

        const parsed = typeSafeResponseSchema.safeParse(await response.json());
        if (!parsed.success || !matchesQuestions(parsed.data.answers, questions)) {
          throw new TypeSafeEvaluationError('TypeSafe returned an invalid evaluation response.', 502);
        }
        const result = parsed.data;
        return {
          ...result,
          provider: this.name,
          usage: {
            ...result.usage,
            total_tokens: result.usage.total_tokens ?? result.usage.input_tokens + result.usage.output_tokens,
          },
        };
      }
    } catch (error) {
      if (controller.signal.aborted) {
        throw new TypeSafeEvaluationError('TypeSafe evaluation timed out.', 504);
      }
      if (error instanceof TypeSafeEvaluationError) throw error;
      throw new TypeSafeEvaluationError('Unable to complete TypeSafe evaluation.', 502);
    } finally {
      clearTimeout(timeout);
    }
  }
}
