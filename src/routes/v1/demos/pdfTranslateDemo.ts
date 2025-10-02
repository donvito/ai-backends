import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { readFileSync } from 'fs'
import { join } from 'path'

const router = new OpenAPIHono()

const demoRoute = createRoute({
  method: 'get',
  path: '/',
  responses: {
    200: {
      description: 'Returns the PDF Translation demo page.',
      content: {
        'text/html': {
          schema: { type: 'string' }
        }
      }
    }
  },
  tags: ['Demos']
})

function getPdfTranslateDemoHtml() {
  const templatePath = join(process.cwd(), 'src', 'templates', 'pdfTranslateDemo.html')
  return readFileSync(templatePath, 'utf-8')
}

router.openapi(demoRoute, (c) => c.html(getPdfTranslateDemoHtml()))

export default {
  handler: router,
  mountPath: 'pdf-translate-demo'
}
