import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { readFileSync } from 'fs'
import { join } from 'path'

const router = new OpenAPIHono()

const route = createRoute({
  method: 'get',
  path: '/',
  responses: {
    200: {
      description: 'Returns the Project Planner demo page.',
      content: {
        'text/html': { schema: { type: 'string' } }
      }
    }
  },
  tags: ['Demos']
})

function getHtml() {
  const templatePath = join(process.cwd(), 'src', 'templates', 'projectPlannerDemo.html')
  return readFileSync(templatePath, 'utf-8')
}

router.openapi(route, (c) => c.html(getHtml()))

export default {
  handler: router,
  mountPath: 'project-planner-demo'
}


