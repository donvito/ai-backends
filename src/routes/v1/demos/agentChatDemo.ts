import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { readFileSync } from 'fs'
import { join } from 'path'

const router = new OpenAPIHono()

const demoRoute = createRoute({
  method: 'get',
  path: '/',
  responses: {
    200: {
      description: 'Returns the multi-turn Agent Chat demo page.',
      content: {
        'text/html': {
          schema: { type: 'string' }
        }
      }
    }
  },
  tags: ['Demos']
})

function getAgentChatDemoHtml() {
  const templatePath = join(process.cwd(), 'src', 'templates', 'agentChatDemo.html')
  return readFileSync(templatePath, 'utf-8')
}

router.openapi(demoRoute, (c) => c.html(getAgentChatDemoHtml()))

export default {
  handler: router,
  mountPath: 'agent-chat-demo'
}
