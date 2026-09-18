import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { readFileSync } from 'fs'
import { join } from 'path'

const router = new OpenAPIHono()

router.openapi(createRoute({
  method: 'get',
  path: '/',
  responses: {
    200: {
      description: 'Returns the Jev evaluation playground.',
      content: { 'text/html': { schema: { type: 'string' } } }
    }
  },
  tags: ['Demos']
}), (c) => c.html(readFileSync(join(process.cwd(), 'src', 'templates', 'jevDemo.html'), 'utf-8')))

export default {
  handler: router,
  mountPath: 'jev-demo'
}
