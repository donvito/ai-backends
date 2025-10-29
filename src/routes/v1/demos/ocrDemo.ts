import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { readFileSync } from 'fs'
import { join } from 'path'

const router = new OpenAPIHono()

const ocrDemoRoute = createRoute({
  method: 'get',
  path: '/',
  responses: {
    200: {
      description: 'Returns the OCR demo page.',
      content: {
        'text/html': {
          schema: { type: 'string' }
        }
      }
    }
  },
  tags: ['Demos']
})

function getOcrDemoHtml() {
  const templatePath = join(process.cwd(), 'src', 'templates', 'ocrDemo.html')
  return readFileSync(templatePath, 'utf-8')
}

router.openapi(ocrDemoRoute, (c) => c.html(getOcrDemoHtml()))

export default {
  handler: router,
  mountPath: 'ocr-demo'
}
