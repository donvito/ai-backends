import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { readFileSync } from 'fs'
import { join } from 'path'

const router = new OpenAPIHono()

const dashboardRoute = createRoute({
  method: 'get',
  path: '/',
  responses: {
    200: {
      description: 'Returns the admin dashboard app.',
      content: {
        'text/html': {
          schema: { type: 'string' }
        }
      }
    }
  },
  summary: 'Admin dashboard',
  description: 'Single-page admin dashboard for managing agents, tools, and provider API keys. The page is public; every action it performs calls the protected Admin API with the bearer token entered in the UI.',
  tags: ['Admin']
})

function getAdminHtml() {
  const templatePath = join(process.cwd(), 'src', 'templates', 'admin.html')
  return readFileSync(templatePath, 'utf-8')
}

router.openapi(dashboardRoute, (c) => c.html(getAdminHtml()))

export default {
  handler: router,
  mountPath: 'admin'
}
