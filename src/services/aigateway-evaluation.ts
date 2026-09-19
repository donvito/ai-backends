import { createGateway, GatewayError, GatewayResponseError, type GatewayProviderSettings } from '@ai-sdk/gateway';
import {
  APICallError,
  experimental_evaluate as evaluate,
  Experimental_EvaluationUnsupportedQuestionTypeError,
  InvalidArgumentError,
  InvalidResponseDataError,
  RetryError,
  type Experimental_EvaluationQuestion,
} from 'ai';
import { z } from 'zod';
import { aigatewayConfig } from '../config/services';
import { gatewayEvaluationAnswersSchema, type EvaluationQuestions, type EvaluationState } from '../schemas/v1/evaluate';
import { EvaluationError, type EvaluationErrorCode, type EvaluationProvider, type EvaluationResponse } from './evaluation';
import { parseRetryAfter } from './typesafe';

export interface AIGatewayEvaluationOptions {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  timeout?: number;
  maxRetries?: number;
  fetch?: GatewayProviderSettings['fetch'];
}

const confidenceSchema = z.record(z.number().min(0).max(1));

export class AIGatewayEvaluationProvider implements EvaluationProvider {
  readonly name = 'aigateway' as const;

  constructor(private readonly options: AIGatewayEvaluationOptions = {}) {}

  private get apiKey(): string {
    return this.options.apiKey ?? aigatewayConfig.apiKey;
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

    const gateway = createGateway({
      apiKey: this.apiKey,
      baseURL: this.options.baseURL,
      fetch: this.options.fetch,
    });
    const sdkQuestions: Record<string, Experimental_EvaluationQuestion> = Object.fromEntries(
      Object.entries(questions).map(([id, question]) => [
        id, question.type === 'noul' ? { ...question, type: 'boolean' } : question,
      ])
    );
    const controller = new AbortController();
    const timeout = this.options.timeout ?? aigatewayConfig.evaluationTimeout;
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const result = await evaluate({
        model: gateway.evaluationModel(model || this.options.model || aigatewayConfig.evaluationModel),
        state,
        questions: sdkQuestions,
        maxRetries: this.options.maxRetries ?? 2,
        abortSignal: controller.signal,
      });
      const confidence = confidenceSchema.safeParse(result.providerMetadata?.typesafe?.confidence);
      const answers = Object.fromEntries(Object.entries(result.answers).map(([id, answer]) => {
        const question = questions[id];
        if (answer.type === 'boolean') {
          return [id, question.type === 'noul' ? { type: 'noul', noul: answer.probability } : answer];
        }
        return [id, {
          ...answer,
          ...(confidence.success && confidence.data[id] !== undefined ? { confidence: confidence.data[id] } : {}),
          ...(question.type === 'score'
            ? { legend: Object.fromEntries(question.criteria.map((level, index) => [String(index), level])) }
            : {}),
        }];
      }));
      const parsed = gatewayEvaluationAnswersSchema.safeParse(answers);
      if (!parsed.success) {
        throw new EvaluationError('AI Gateway returned an unexpected evaluation response', { code: 'invalid_response' });
      }
      const inputTokens = result.usage.inputTokens ?? 0;
      const outputTokens = result.usage.outputTokens ?? 0;
      return {
        provider: this.name,
        model: result.response.modelId,
        answers: parsed.data,
        usage: {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          total_tokens: result.usage.totalTokens ?? inputTokens + outputTokens,
        },
      };
    } catch (error) {
      if (controller.signal.aborted) {
        throw new EvaluationError(`AI Gateway request timed out after ${timeout}ms`, { code: 'timeout' });
      }
      throw toEvaluationError(error);
    } finally {
      clearTimeout(timer);
    }
  }
}

function toEvaluationError(error: unknown): EvaluationError {
  if (error instanceof EvaluationError) return error;
  if (RetryError.isInstance(error)) return toEvaluationError(error.lastError);
  if (InvalidArgumentError.isInstance(error) || Experimental_EvaluationUnsupportedQuestionTypeError.isInstance(error)) {
    return new EvaluationError('AI Gateway rejected the evaluation request', { code: 'invalid_request' });
  }
  const apiError = APICallError.isInstance(error)
    ? error
    : GatewayError.isInstance(error) && APICallError.isInstance(error.cause) ? error.cause : undefined;
  const status = apiError?.statusCode ?? (GatewayError.isInstance(error) ? error.statusCode : undefined);
  let code: EvaluationErrorCode = 'upstream_error';
  if ((apiError && apiError.statusCode === undefined) ||
      (GatewayError.isInstance(error) && error.cause instanceof TypeError)) code = 'network';
  else if (status === 401 || status === 403) code = 'unauthorized';
  else if (status === 400 || status === 404 || status === 422) code = 'invalid_request';
  else if (status === 429) code = 'rate_limited';
  else if (status === 503 || status === 529) code = 'overloaded';
  else if (status === 408 || status === 504) code = 'timeout';
  else if (InvalidResponseDataError.isInstance(error) || GatewayResponseError.isInstance(error)) code = 'invalid_response';
  return new EvaluationError('AI Gateway evaluation request failed', {
    code,
    status,
    retryAfterMs: parseRetryAfter(apiError?.responseHeaders?.['retry-after'] ?? null),
  });
}
