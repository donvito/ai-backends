import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { evaluateRequestSchema, evaluateResponseSchema } from '../../schemas/v1/evaluate';
import { TypeSafeEvaluationError, TypeSafeEvaluationProvider } from '../../services/typesafe';

const router = new OpenAPIHono({
  defaultHook: (result, c) => {
    if (!result.success) return c.json({ error: 'Invalid evaluation request.', issues: result.error.issues }, 400);
  },
});
const provider = new TypeSafeEvaluationProvider();
const errorSchema = z.object({ error: z.string() });
const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: errorSchema } },
});

router.openapi(createRoute({
  path: '/',
  method: 'post',
  security: [{ BearerAuth: [] }],
  tags: ['Evaluation'],
  summary: 'Evaluate state with typed atomic questions',
  description: 'Returns choice, score, and noul answers from TypeSafe Jev. Compose multi-step decisions in application code.',
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: evaluateRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'Typed answers with probabilities, confidence, and token usage.',
      content: { 'application/json': { schema: evaluateResponseSchema } },
    },
    400: errorResponse('Invalid evaluation request.'),
    401: { description: 'AIBackends bearer token required.' },
    429: errorResponse('TypeSafe rate limit exceeded after retries.'),
    502: errorResponse('TypeSafe authentication, validation, network, or response failure.'),
    503: errorResponse('TypeSafe is not configured or temporarily unavailable.'),
    504: errorResponse('TypeSafe evaluation exceeded the configured timeout.'),
  },
}), async c => {
  const { payload, config } = c.req.valid('json');
  try {
    return c.json(await provider.evaluate(payload.state, payload.questions, config.model), 200);
  } catch (error) {
    if (error instanceof TypeSafeEvaluationError) {
      return c.json({ error: error.message }, error.status);
    }
    return c.json({ error: 'Evaluation failed.' }, 502);
  }
});

export default { handler: router, mountPath: 'evaluate' };
