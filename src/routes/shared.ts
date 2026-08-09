import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { readFileSync } from 'fs'
import { join } from 'path'

const router = new OpenAPIHono()

function readSharedFile(filename: string) {
  const filePath = join(process.cwd(), 'src', 'templates', 'shared', filename)
  return readFileSync(filePath, 'utf-8')
}

function staticFileRoute(path: string, description: string, contentType: string) {
  return createRoute({
    method: 'get',
    path,
    responses: {
      200: {
        description,
        content: {
          [contentType]: {
            schema: { type: 'string' }
          }
        }
      }
    },
    tags: ['Static']
  })
}

router.openapi(
  staticFileRoute('/safedom.js', 'Returns the safedom.js utility file.', 'application/javascript'),
  (c) => {
    return c.newResponse(readSharedFile('safedom.js'), 200, {
      'Content-Type': 'application/javascript; charset=utf-8'
    })
  }
)

router.openapi(
  staticFileRoute('/theme.js', 'Returns the shared theme toggle script.', 'application/javascript'),
  (c) => {
    return c.newResponse(readSharedFile('theme.js'), 200, {
      'Content-Type': 'application/javascript; charset=utf-8'
    })
  }
)

router.openapi(
  staticFileRoute('/theme.css', 'Returns the shared theme stylesheet.', 'text/css'),
  (c) => {
    return c.newResponse(readSharedFile('theme.css'), 200, {
      'Content-Type': 'text/css; charset=utf-8'
    })
  }
)

export default {
  handler: router,
  mountPath: 'shared'
}
