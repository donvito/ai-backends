import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { readFileSync } from 'fs'
import { join } from 'path'

const router = new OpenAPIHono()

const demoRoute = createRoute({
  method: 'get',
  path: '/',
  responses: {
    200: {
      description: 'Returns the Meeting Notes demo page.',
      content: {
        'text/html': { schema: { type: 'string' } }
      }
    }
  },
  tags: ['Demos']
})

function getMeetingNotesDemoHtml() {
  const templatePath = join(process.cwd(), 'src', 'templates', 'meetingNotesDemo.html')
  return readFileSync(templatePath, 'utf-8')
}

router.openapi(demoRoute, (c) => c.html(getMeetingNotesDemoHtml()))

export default {
  handler: router,
  mountPath: 'meeting-notes-demo'
}


