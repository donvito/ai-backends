import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { readFileSync } from 'fs'
import { join } from 'path'

const router = new OpenAPIHono()

const demoRoute = createRoute({
  method: 'get',
  path: '/',
  responses: {
    200: {
      description: 'Returns the Highlighter demo page.',
      content: {
        'text/html': {
          schema: { type: 'string' }
        }
      }
    }
  },
  tags: ['Demos']
})

function getHighlighterDemoHtml() {
  const templatePath = join(process.cwd(), 'src', 'templates', 'highlighterDemo.html')
  return readFileSync(templatePath, 'utf-8')
}

router.openapi(demoRoute, (c) => c.html(getHighlighterDemoHtml()))

export default {
  handler: router,
  mountPath: 'highlighter-demo'
}
