import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { readFileSync } from 'fs'
import { join } from 'path'

const router = new OpenAPIHono()

// Route for safedom.js
const safedomRoute = createRoute({
  method: 'get',
  path: '/safedom.js',
  responses: {
    200: {
      description: 'Returns the safedom.js utility file.',
      content: {
        'application/javascript': {
          schema: { type: 'string' }
        }
      }
    }
  },
  tags: ['Static']
})

function getSafedomJs() {
  const filePath = join(process.cwd(), 'src', 'templates', 'shared', 'safedom.js')
  return readFileSync(filePath, 'utf-8')
}

router.openapi(safedomRoute, (c) => {
  const jsContent = getSafedomJs()
  return c.newResponse(jsContent, 200, {
    'Content-Type': 'application/javascript; charset=utf-8'
  })
})

export default {
  handler: router,
  mountPath: 'shared'
}
