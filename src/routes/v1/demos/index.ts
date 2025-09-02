import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { readFileSync } from 'fs'
import { join } from 'path'

const router = new OpenAPIHono()

const demosRoute = createRoute({
  method: 'get',
  path: '/',
  responses: {
    200: {
      description: 'Returns the demos index page.',
      content: {
        'text/html': {
          schema: { type: 'string' }
        }
      }
    }
  },
  tags: ['Demos']
})

function getDemosHtml() {
  const templatePath = join(process.cwd(), 'src', 'templates', 'demos.html')
  return readFileSync(templatePath, 'utf-8')
}

router.openapi(demosRoute, (c) => c.html(getDemosHtml()))

export default {
  handler: router,
  mountPath: 'demos'
}
