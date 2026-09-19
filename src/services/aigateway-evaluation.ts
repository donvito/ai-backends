import { z } from 'zod';
import { aigatewayConfig } from '../config/services';
import type {
  EvaluationAnswer,
  EvaluationAnswers,
  EvaluationQuestion,
  EvaluationQuestions,
  EvaluationState,
} from '../schemas/v1/evaluate';
import { EvaluationError, type EvaluationResponse } from './evaluation';
import { HttpEvaluationProvider, type EvaluationHttpRequest, type HttpEvaluationClientOptions } from './evaluation-http';

/**
 * Runs Jev (and any other evaluation model the gateway exposes) through the
 * Vercel AI Gateway using the AI SDK's evaluation-model wire protocol, the
 * same one `experimental_evaluate({ model: 'typesafe-ai/jev' })` speaks:
 *
 *   POST {evaluationBaseURL}/evaluation-model
 *   Authorization: Bearer AI_GATEWAY_API_KEY
 *   ai-gateway-protocol-version: 0.0.1
 *   ai-evaluation-model-specification-version: 4
 *   ai-model-id: typesafe-ai/jev
 *
 * The public AIBackends contract stays identical to the direct TypeSafe
 * provider, so callers can switch providers with a single config change:
 *
 *   - `noul` questions are sent as the SDK's `boolean` type and the returned
 *     `probability` comes back as `noul`.
 *   - `confidence` is not part of the SDK answer shape; it is read from
 *     `providerMetadata.typesafe.confidence[questionId]` when present and
 *     otherwise derived as the probability of the winning option/level.
 *   - `score.legend` is rebuilt from the request's ordered `criteria`.
 */

export const AIGATEWAY_DEFAULT_EVALUATION_MODEL = 'typesafe-ai/jev';
export const AIGATEWAY_EVALUATION_PATH = '/evaluation-model';
export const AIGATEWAY_PROTOCOL_VERSION = '0.0.1';
export const AIGATEWAY_EVALUATION_SPEC_VERSION = '4';

const probability = z.number().min(0).max(1);

const gatewayAnswerSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('choice'),
    choice: z.string(),
    probabilities: z.record(z.string(), probability).optional(),
  }),
  z.object({
    type: z.literal('score'),
    score: z.number(),
    probabilities: z.record(z.string(), probability).optional(),
  }),
  z.object({
    type: z.literal('boolean'),
    probability,
  }),
]);

const gatewayResponseSchema = z
  .object({
    answers: z.record(z.string(), gatewayAnswerSchema),
    usage: z
      .object({
        inputTokens: z.number().int().nonnegative().optional(),
        outputTokens: z.number().int().nonnegative().optional(),
      })
      .passthrough()
      .optional(),
    warnings: z.array(z.object({ type: z.string() }).passthrough()).optional(),
    providerMetadata: z
      .object({
        typesafe: z
          .object({
            confidence: z.record(z.string(), probability).optional(),
          })
          .passthrough()
          .optional(),
        gateway: z
          .object({
            routing: z
              .object({
                canonicalSlug: z.string().optional(),
                originalModelId: z.string().optional(),
              })
              .passthrough()
              .optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

type GatewayAnswer = z.infer<typeof gatewayAnswerSchema>;
type GatewayResponse = z.infer<typeof gatewayResponseSchema>;

export interface AIGatewayEvaluationClientOptions extends HttpEvaluationClientOptions {
  /** Overrides; anything omitted is read from `aigatewayConfig` at call time. */
  apiKey?: string;
  baseURL?: string;
  model?: string;
}

/** Translates AIBackends question types to the AI SDK evaluation spec (`noul` -> `boolean`). */
export function toGatewayQuestions(questions: EvaluationQuestions): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, question] of Object.entries(questions)) {
    out[key] = question.type === 'noul' ? { ...question, type: 'boolean' } : question;
  }
  return out;
}

export class AIGatewayEvaluationProvider extends HttpEvaluationProvider {
  readonly name = 'aigateway' as const;
  protected readonly displayName = 'AI Gateway';

  private readonly options: AIGatewayEvaluationClientOptions;

  constructor(options: AIGatewayEvaluationClientOptions = {}) {
    super(options);
    this.options = options;
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
    return this.options.model ?? aigatewayConfig.evaluationModel ?? AIGATEWAY_DEFAULT_EVALUATION_MODEL;
  }

  protected get timeout(): number {
    return this.options.timeout ?? aigatewayConfig.evaluationTimeout;
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  protected notConfiguredError(): EvaluationError {
    return new EvaluationError(
      'AI Gateway is not configured. Set AI_GATEWAY_API_KEY or add a key in the admin dashboard.',
      { code: 'not_configured' }
    );
  }

  protected buildRequest(state: EvaluationState, questions: EvaluationQuestions, model?: string): EvaluationHttpRequest {
    return {
      url: `${this.baseURL}${AIGATEWAY_EVALUATION_PATH}`,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'ai-gateway-protocol-version': AIGATEWAY_PROTOCOL_VERSION,
        'ai-evaluation-model-specification-version': AIGATEWAY_EVALUATION_SPEC_VERSION,
        'ai-model-id': model || this.defaultModel,
      },
      body: JSON.stringify({ state, questions: toGatewayQuestions(questions) }),
    };
  }

  protected parseResponse(json: unknown, questions: EvaluationQuestions, model?: string): EvaluationResponse {
    const parsed = gatewayResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw this.invalidResponseError(parsed.error.flatten());
    }

    const requestedModel = model || this.defaultModel;
    const answers = this.toAnswers(parsed.data, questions);
    const inputTokens = parsed.data.usage?.inputTokens ?? 0;
    const outputTokens = parsed.data.usage?.outputTokens ?? 0;

    return {
      provider: this.name,
      model: parsed.data.providerMetadata?.gateway?.routing?.canonicalSlug ?? requestedModel,
      answers,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
      },
    };
  }

  private toAnswers(response: GatewayResponse, questions: EvaluationQuestions): EvaluationAnswers {
    const confidences = response.providerMetadata?.typesafe?.confidence ?? {};
    const answers: EvaluationAnswers = {};
    const missing: string[] = [];

    for (const [key, question] of Object.entries(questions)) {
      const answer = response.answers[key];
      if (!answer) {
        missing.push(key);
        continue;
      }
      answers[key] = this.toAnswer(answer, question, confidences[key], key);
    }

    if (missing.length > 0) {
      throw this.invalidResponseError({ missingAnswers: missing });
    }
    return answers;
  }

  private toAnswer(
    answer: GatewayAnswer,
    question: EvaluationQuestion,
    confidence: number | undefined,
    key: string
  ): EvaluationAnswer {
    if (answer.type !== expectedAnswerType(question)) {
      throw this.invalidResponseError({ question: key, expected: expectedAnswerType(question), received: answer.type });
    }

    switch (answer.type) {
      case 'boolean':
        return { type: 'noul', noul: answer.probability };
      case 'choice': {
        const probabilities = answer.probabilities ?? { [answer.choice]: 1 };
        return {
          type: 'choice',
          choice: answer.choice,
          probabilities,
          confidence: confidence ?? probabilities[answer.choice] ?? 1,
        };
      }
      case 'score': {
        const levels = question.type === 'score' ? question.criteria : [];
        const legend = Object.fromEntries(levels.map((description, index) => [String(index), description]));
        const probabilities = answer.probabilities ?? { [String(Math.round(answer.score))]: 1 };
        return {
          type: 'score',
          score: answer.score,
          legend,
          probabilities,
          confidence: confidence ?? Math.max(0, ...Object.values(probabilities)),
        };
      }
    }
  }
}

function expectedAnswerType(question: EvaluationQuestion): GatewayAnswer['type'] {
  return question.type === 'noul' ? 'boolean' : question.type;
}
