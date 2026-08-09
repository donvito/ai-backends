import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import type { Context } from 'hono'

const router = new OpenAPIHono()

const SIDECAR_URL = (process.env.AIBACKENDS_SIDECAR_URL || 'http://localhost:8000').replace(/\/$/, '')

const errorSchema = z.object({
  detail: z.string(),
  sidecarUrl: z.string().optional(),
})

async function proxyToSidecar(path: string, init: RequestInit): Promise<Response> {
  const url = `${SIDECAR_URL}${path}`
  try {
    return await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(120_000),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown proxy error'
    return new Response(
      JSON.stringify({
        detail: `Python sidecar unreachable at ${SIDECAR_URL}: ${message}. Start it with: docker compose up python-sidecar`,
        sidecarUrl: SIDECAR_URL,
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}

function forwardAuthHeaders(c: Context): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  const auth = c.req.header('Authorization')
  if (auth) headers.Authorization = auth
  return headers
}

async function jsonFromUpstream(upstream: Response): Promise<Record<string, unknown>> {
  const body = await upstream.json().catch(() => ({ detail: 'Invalid sidecar response' }))
  if (body && typeof body === 'object') {
    return body as Record<string, unknown>
  }
  return { detail: 'Invalid sidecar response' }
}

const healthRoute = createRoute({
  method: 'get',
  path: '/health',
  responses: {
    200: {
      description: 'Python sidecar health status',
      content: {
        'application/json': {
          schema: z.object({
            status: z.string().optional(),
            library: z.string().optional(),
            library_version: z.string().optional(),
            default_runtime: z.string().optional(),
            default_model: z.string().optional(),
            sidecarUrl: z.string(),
            detail: z.string().optional(),
          }),
        },
      },
    },
    503: {
      description: 'Sidecar unavailable',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
  tags: ['Local Python Sidecar'],
})

router.openapi(healthRoute, async (c) => {
  const upstream = await proxyToSidecar('/health', { method: 'GET' })
  const body = await jsonFromUpstream(upstream)
  if (!upstream.ok) {
    return c.json({ detail: String(body.detail || 'Sidecar unavailable'), sidecarUrl: SIDECAR_URL }, 503)
  }
  return c.json({ ...body, sidecarUrl: SIDECAR_URL }, 200)
})

const taskBodySchema = z.record(z.any()).openapi('LocalSidecarTaskBody')
const taskResponseSchema = z.record(z.any()).openapi('LocalSidecarTaskResponse')

function createTaskProxyRoute(taskPath: string, description: string) {
  return createRoute({
    method: 'post',
    path: `/${taskPath}`,
    request: {
      body: {
        required: true,
        content: {
          'application/json': {
            schema: taskBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description,
        content: {
          'application/json': {
            schema: taskResponseSchema,
          },
        },
      },
      400: {
        description: 'Bad request',
        content: { 'application/json': { schema: errorSchema } },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: errorSchema } },
      },
      503: {
        description: 'Sidecar unavailable',
        content: { 'application/json': { schema: errorSchema } },
      },
    },
    tags: ['Local Python Sidecar'],
  })
}

const taskPaths = [
  { path: 'summarize', description: 'Summarize text via aibackends Python library' },
  { path: 'classify', description: 'Classify text via aibackends Python library' },
  { path: 'redact-pii', description: 'Redact PII via aibackends Python library' },
  { path: 'embed', description: 'Embed text via aibackends Python library' },
  { path: 'extract-invoice', description: 'Extract invoice fields via aibackends Python library' },
] as const

for (const task of taskPaths) {
  const route = createTaskProxyRoute(task.path, task.description)
  router.openapi(route, async (c) => {
    const payload = await c.req.json()
    const upstream = await proxyToSidecar(`/v1/${task.path}`, {
      method: 'POST',
      headers: forwardAuthHeaders(c),
      body: JSON.stringify(payload),
    })
    const body = await jsonFromUpstream(upstream)
    return c.json(body, upstream.status as 200 | 400 | 401 | 503)
  })
}

export default {
  handler: router,
  mountPath: 'local',
}
