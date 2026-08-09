import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { readFileSync } from 'fs'
import { join } from 'path'

const router = new OpenAPIHono()

const demoRoute = createRoute({
  method: 'get',
  path: '/',
  responses: {
    200: {
      description: 'Returns the aibackends-python demo page.',
      content: {
        'text/html': {
          schema: { type: 'string' },
        },
      },
    },
  },
  tags: ['Demos'],
})

function getAibackendsPythonDemoHtml() {
  const templatePath = join(process.cwd(), 'src', 'templates', 'aibackendsPythonDemo.html')
  return readFileSync(templatePath, 'utf-8')
}

router.openapi(demoRoute, (c) => c.html(getAibackendsPythonDemoHtml()))

export default {
  handler: router,
  mountPath: 'aibackends-python-demo',
}
