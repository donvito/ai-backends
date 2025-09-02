import { OpenAPIHono } from '@hono/zod-openapi'
import { readFileSync } from 'fs'
import { join } from 'path'

const router = new OpenAPIHono()

function getModelsGuideHtml(): string {
  const templatePath = join(process.cwd(), 'src', 'templates', 'models.html')
  return readFileSync(templatePath, 'utf-8')
}

// Use a plain route so it does not appear in the OpenAPI/Swagger docs
router.get('/', (c) => c.html(getModelsGuideHtml()))

export default {
  handler: router,
  mountPath: 'models'
}


