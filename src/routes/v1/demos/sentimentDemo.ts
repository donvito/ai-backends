import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { readFileSync } from 'fs'
import { join } from 'path'

const router = new OpenAPIHono()

const demoRoute = createRoute({
  method: 'get',
  path: '/',
  responses: {
    200: {
      description: 'Returns the Sentiment Analysis demo page.',
      content: {
        'text/html': {
          schema: { type: 'string' }
        }
      }
    }
  },
  tags: ['Demos']
})

function getSentimentDemoHtml() {
  const templatePath = join(process.cwd(), 'src', 'templates', 'sentimentDemo.html')
  return readFileSync(templatePath, 'utf-8')
}

router.openapi(demoRoute, (c) => c.html(getSentimentDemoHtml()))

export default {
  handler: router,
  mountPath: 'sentiment-demo'
}


