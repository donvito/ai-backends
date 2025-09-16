import { OpenAPIHono } from '@hono/zod-openapi'
import fs from 'fs'
import path from 'path'

const router = new OpenAPIHono()

// Serve the outline demo page
router.get('/', (c) => {
  try {
    const htmlPath = path.join(__dirname, '../../../templates/outlineDemo.html')
    const html = fs.readFileSync(htmlPath, 'utf-8')
    return c.html(html)
  } catch (error) {
    console.error('Error loading outline demo page:', error)
    return c.text('Error loading outline demo page', 500)
  }
})

export default {
  handler: router,
  mountPath: 'outline-demo'
}

