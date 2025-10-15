import { swaggerUI } from "@hono/swagger-ui"
import { OpenAPIHono } from "@hono/zod-openapi"
import { readFileSync } from 'fs'
import { join } from 'path'
import { createMarkdownFromOpenApi } from '@scalar/openapi-to-markdown'

function getLandingPageHtml() {
    const templatePath = join(process.cwd(), 'src', 'templates', 'landing.html')
    return readFileSync(templatePath, 'utf-8')
}

function getRedocHtml() {
    const templatePath = join(process.cwd(), 'src', 'templates', 'redoc.html')
    return readFileSync(templatePath, 'utf-8')
}

async function configureApiDocs(app: OpenAPIHono) {
    // The OpenAPI documentation will be available at /doc
    const openApiSpec = {
        openapi: '3.1.0',
        info: {
            title: 'AI Backends',
            version: 'v1.0.0',
            description: 'Making common AI use cases easily accessible and customizable. Skip the heavy lifting of understanding OpenAI or other providers with our open source stack.',
            contact: {
                name: 'AI Backends Support',
                url: 'https://github.com/donvito/ai-backend'
            }
        },
        servers: [
            {
                url: process.env.NODE_ENV === 'production' ? process.env.API_BASE_URL || 'http://localhost:3000' : 'http://localhost:3000',   
                description: process.env.NODE_ENV === 'production' ? 'Production server' : 'Development server'
            }
        ]
    }

    app.doc('/api/doc', openApiSpec)

    // Generate Markdown from the OpenAPI document for LLMs
    // This is done after app.doc() is called so the spec is fully populated
    app.get('/api/llms.txt', async (c) => {
        try {
            // Fetch the complete OpenAPI document
            const baseUrl = process.env.NODE_ENV === 'production' 
                ? process.env.API_BASE_URL || 'http://localhost:3000'
                : 'http://localhost:3000'

            const response = await fetch(`${baseUrl}/api/doc`)
            const content = await response.json()

            // Filter out specific routes that shouldn't be included in llms.txt
            const excludedPaths = ['/api/jsoneditor', '/api/shared/safedom.js', '/api/v1/hello', '/api/v2/hello']
            if (content.paths) {
                excludedPaths.forEach(path => {
                    delete content.paths[path]
                })
            }

            // Generate Markdown from the OpenAPI document
            const markdown = await createMarkdownFromOpenApi(content)

            return c.text(markdown)
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'
            return c.text(`Error generating markdown: ${errorMessage}`, 500)
        }
    })

    // The Swagger UI will be available at /ui
    app.get('/api/ui', swaggerUI({ url: '/api/doc' }))

    // The ReDoc UI will be available at /redoc
    app.get('/api/redoc', (c) => c.html(getRedocHtml()))

    // Root page with links to documentation
    app.get('/', (c) => c.html(getLandingPageHtml()))
}

export default configureApiDocs
