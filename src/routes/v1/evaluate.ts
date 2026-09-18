import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { Context } from 'hono'
import { z } from 'zod'
import { handleError } from '../../utils/errorHandler'
import {
  evaluateErrorResponseSchema,
  evaluateRequestSchema,
  evaluateResponseSchema,
  type EvaluateReq,
} from '../../schemas/v1/evaluate'
import { isEvaluationError, processEvaluationRequest, type EvaluationError } from '../../services/evaluation'
import { createFinalResponse } from './finalResponse'
import { apiVersion } from './versionConfig'

const router = new OpenAPIHono({
  defaultHook: (result, c) => {
    if (!result.success) {
      return c.json({ error: 'Invalid evaluation request', details: result.error.flatten() }, 400)
    }
  },
})

/**
 * Maps provider-level failures to HTTP responses. Upstream auth failures are a
 * server misconfiguration from the caller's point of view, so they surface as
 * 502 rather than 401 (which would be confused with AIBackends' own bearer auth).
 */
function evaluationErrorResponse(c: Context, error: EvaluationError) {
  console.error(`[evaluate] ${error.code}: ${error.message}`, error.status ?? '', error.details ?? '')
  const retryAfterSeconds = error.retryAfterMs ? Math.max(1, Math.ceil(error.retryAfterMs / 1000)) : undefined
  if (retryAfterSeconds) c.header('Retry-After', String(retryAfterSeconds))

  switch (error.code) {
    case 'invalid_request':
      return c.json({ error: error.message, details: error.details }, 400)
    case 'rate_limited':
      return c.json({ error: 'Evaluation provider rate limit exceeded. Retry later.' }, 429)
    case 'not_configured':
      return c.json({ error: error.message }, 503)
    case 'overloaded':
      return c.json({ error: 'Evaluation provider is temporarily unavailable. Retry later.' }, 503)
    case 'timeout':
      return c.json({ error: 'Evaluation provider did not respond in time' }, 504)
    case 'unauthorized':
      return c.json({ error: 'Evaluation provider authentication failed. Check the configured TypeSafe API key.' }, 502)
    case 'network':
    case 'invalid_response':
    case 'upstream_error':
    default:
      return c.json({ error: 'Evaluation provider request failed' }, 502)
  }
}

async function handleEvaluateRequest(c: Context) {
  try {
    const { payload, config } = (c.req as any).valid('json') as EvaluateReq
    const result = await processEvaluationRequest(payload.state, payload.questions, config)
    return c.json(createFinalResponse(result, apiVersion), 200)
  } catch (error) {
    if (isEvaluationError(error)) {
      return evaluationErrorResponse(c, error)
    }
    return handleError(c, error, 'Failed to evaluate request')
  }
}

router.openapi(
  createRoute({
    path: '/',
    method: 'post',
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: {
          'application/json': {
            schema: evaluateRequestSchema.openapi({
              example: {
                payload: {
                  state: { user_request: 'Create an invoice for Acme Corp' },
                  questions: {
                    route: {
                      type: 'choice',
                      instructions: 'Which agent should handle this request?',
                      criteria: {
                        accounting: 'Invoices and bookkeeping',
                        research: 'Research and documents',
                        coder: 'Software development',
                        human: 'Ambiguous or unsupported',
                      },
                    },
                    urgency: {
                      type: 'score',
                      instructions: 'How urgent is this request?',
                      criteria: ['Not urgent', 'Somewhat urgent', 'Very urgent'],
                    },
                    needs_clarification: {
                      type: 'noul',
                      instructions: 'Is information required before this request can be executed?',
                    },
                  },
                },
                config: { provider: 'typesafe', model: 'jev-latest' },
              },
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Structured answers, one per question, keyed by the ids used in the request.',
        content: {
          'application/json': {
            schema: evaluateResponseSchema.extend({ apiVersion: z.string() }),
          },
        },
      },
      400: {
        description: 'Invalid request (failed AIBackends validation, or rejected by the evaluation provider).',
        content: { 'application/json': { schema: evaluateErrorResponseSchema } },
      },
      401: {
        description: 'Unauthorized - Bearer token required',
        content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      },
      429: {
        description: 'Evaluation provider rate limit exceeded after retries. Honors Retry-After when available.',
        content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      },
      502: {
        description: 'Evaluation provider returned an error (including invalid provider credentials).',
        content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      },
      503: {
        description: 'Evaluation provider is not configured or temporarily overloaded.',
        content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      },
      504: {
        description: 'Evaluation provider timed out.',
        content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      },
    },
    summary: 'Evaluate state with typed decision questions (Jev)',
    description:
      'Evaluation / Decision API. Sends a shared `state` (text or JSON) plus a map of typed questions to a System One ' +
      'decision model (TypeSafe Jev) and returns structured answers. `choice` returns the selected option with a full ' +
      'probability distribution and confidence; `score` returns a probability-weighted score over ordered levels with a ' +
      'legend, probabilities, and confidence; `noul` returns the probability (0-1) that a yes/no question is true. ' +
      'This model does not generate text; keep each question a small, atomic judgment and compose them in code.',
    tags: ['Evaluation'],
  }),
  handleEvaluateRequest as any
)

export default {
  handler: router,
  mountPath: 'evaluate',
}
