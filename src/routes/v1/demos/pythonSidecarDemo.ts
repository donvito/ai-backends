import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { readFileSync } from 'fs'
import { join } from 'path'

const router = new OpenAPIHono()

const demoRoute = createRoute({
  method: 'get',
  path: '/',
  responses: {
    200: {
      description: 'Returns the Python aibackends sidecar demo page.',
      content: {
        'text/html': {
          schema: { type: 'string' },
        },
      },
    },
  },
  tags: ['Demos'],
})

function getPythonSidecarDemoHtml() {
  const templatePath = join(process.cwd(), 'src', 'templates', 'pythonSidecarDemo.html')
  return readFileSync(templatePath, 'utf-8')
}

router.openapi(demoRoute, (c) => c.html(getPythonSidecarDemoHtml()))

export default {
  handler: router,
  mountPath: 'python-sidecar-demo',
}
