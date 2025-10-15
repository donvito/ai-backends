import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { Context } from 'hono'
import { getServiceStatus, getAvailableModels, checkServiceAvailability } from '../../services/ai'
import { getModelsByCapability, getModelsCatalogByProvider } from '../../config/models'
import { handleError } from '../../utils/errorHandler'

const router = new OpenAPIHono()

const serviceStatusSchema = z.object({
  services: z.object({
    openai: z.object({
      enabled: z.boolean(),
      available: z.boolean(),
      config: z.object({
        model: z.string(),
        hasApiKey: z.boolean(),
      })
    }),
    ollama: z.object({
      enabled: z.boolean(),
      available: z.boolean(),
      config: z.object({
        baseURL: z.string(),
        model: z.string(),
        chatModel: z.string(),
      })
      }),
      openrouter: z.object({
        enabled: z.boolean(),
        available: z.boolean(),
        config: z.object({
          model: z.string(),
          hasApiKey: z.boolean(),
          baseURL: z.string().nullable().optional()
        })
      }),
      anthropic: z.object({
        enabled: z.boolean(),
        available: z.boolean(),
        config: z.object({
          model: z.string(),
          hasApiKey: z.boolean(),
        })
      }),
      lmstudio: z.object({
        enabled: z.boolean(),
        available: z.boolean(),
        config: z.object({
          baseURL: z.string(),
          model: z.string(),
          chatModel: z.string(),
        })
      }),
      google: z.object({
        enabled: z.boolean(),
        available: z.boolean(),
        config: z.object({
          model: z.string(),
          hasApiKey: z.boolean(),
        })
      })
  }),
  primary: z.string().nullable(),
  anyAvailable: z.boolean()
})

const modelsSchema = z.object({
  service: z.string(),
  models: z.array(z.string()),
  available: z.boolean()
})

const capabilityEnum = z.enum(['summarize', 'web-search', 'pdf-summarizer', 'pdf-translate', 'rewrite', 'compose', 'keywords', 'sentiment', 'emailReply', 'vision', 'askText', 'translate', 'meetingNotes', 'planning', 'outline'])
const byProviderSchema = z.record(z.array(z.string()))
const providerViewSchema = z.record(z.array(z.object({
  name: z.string(),
  capabilities: z.array(capabilityEnum),
  notes: z.string().optional()
})))
  const modelsGuidanceSchema = z.object({
    source: z.literal('config'),
    byCapability: z.object({
      summarize: byProviderSchema,
      'web-search': byProviderSchema,
      'pdf-summarizer': byProviderSchema,
      'pdf-translate': byProviderSchema,
      rewrite: byProviderSchema,
      compose: byProviderSchema,
      keywords: byProviderSchema,
      sentiment: byProviderSchema,
      emailReply: byProviderSchema,
      planning: byProviderSchema,
      vision: byProviderSchema,
      askText: byProviderSchema,
      translate: byProviderSchema,
      meetingNotes: byProviderSchema,
      outline: byProviderSchema,
    })
  })

async function handleServiceStatus(c: Context) {
  try {
    const status = await getServiceStatus()
    return c.json(status, 200)
  } catch (error) {
    return handleError(c, error, 'Failed to get service status')
  }
}

async function handleGetModels(c: Context) {
  try {
    const service = c.req.query('service') || 'auto'
    const source = (c.req.query('source') || 'live') as 'live' | 'config'
    const view = (c.req.query('view') || 'capability') as 'capability' | 'provider' | 'both'

    if (source === 'config') {
      const byCapability = {
        summarize: getModelsByCapability('summarize'),
        'web-search': getModelsByCapability('web-search'),
        'pdf-summarizer': getModelsByCapability('pdf-summarizer'),
        'pdf-translate': getModelsByCapability('pdf-translate'),
        rewrite: getModelsByCapability('rewrite'),
        compose: getModelsByCapability('compose'),
        keywords: getModelsByCapability('keywords'),
        sentiment: getModelsByCapability('sentiment'),
        emailReply: getModelsByCapability('emailReply'),
        planning: getModelsByCapability('planning'),
        vision: getModelsByCapability('vision'),
        askText: getModelsByCapability('askText'),
        translate: getModelsByCapability('translate'),
        meetingNotes: getModelsByCapability('meetingNotes'),
        outline: getModelsByCapability('outline'),
      }
      const byProvider = getModelsCatalogByProvider()
      if (view === 'provider') return c.json({ source: 'config', byProvider }, 200)
      if (view === 'both') return c.json({ source: 'config', byCapability, byProvider }, 200)
      return c.json({ source: 'config', byCapability }, 200)
    }
    if (service === 'auto') {
      const results = await Promise.allSettled([
        getAvailableModels('openai'),
        getAvailableModels('ollama'),
        getAvailableModels('openrouter'),
        getAvailableModels('anthropic'),
        getAvailableModels('lmstudio'),
        getAvailableModels('google')
      ])
      const response = {
        openai: {
          service: 'openai',
          models: results[0].status === 'fulfilled' ? results[0].value : [],
          available: await checkServiceAvailability('openai')
        },
        ollama: {
          service: 'ollama',
          models: results[1].status === 'fulfilled' ? results[1].value : [],
          available: await checkServiceAvailability('ollama')
        },
        openrouter: {
          service: 'openrouter',
          models: results[2].status === 'fulfilled' ? results[2].value : [],
          available: await checkServiceAvailability('openrouter')
        },
        anthropic: {
          service: 'anthropic',
          models: results[3].status === 'fulfilled' ? results[3].value : [],
          available: await checkServiceAvailability('anthropic')
        },
        lmstudio: {
          service: 'lmstudio',
          models: results[4].status === 'fulfilled' ? results[4].value : [],
          available: await checkServiceAvailability('lmstudio')
        },
        google: {
          service: 'google',
          models: results[5].status === 'fulfilled' ? results[5].value : [],
          available: await checkServiceAvailability('google')
        }
      }
      return c.json(response, 200)
    } else {
      const models = await getAvailableModels(service as any)
      const available = await checkServiceAvailability(service as any)
      return c.json({
        service,
        models,
        available
      }, 200)
    }
  } catch (error) {
    return handleError(c, error, 'Failed to get available models')
  }
}

async function handleServiceHealth(c: Context) {
  try {
    const service = c.req.param('service')
    if (!service || !['openai', 'ollama', 'openrouter', 'anthropic', 'lmstudio', 'google'].includes(service)) {
      return c.json({ error: 'Invalid service. Must be one of: openai, ollama, openrouter, anthropic, lmstudio, google' }, 400)
    }
    const available = await checkServiceAvailability(service as any)
    return c.json({
      service,
      available,
      timestamp: new Date().toISOString()
    }, 200)
  } catch (error) {
    return handleError(c, error, 'Failed to check service health')
  }
}

router.openapi(
  createRoute({
    path: '/status',
    method: 'get',
    responses: {
      200: {
        description: 'Returns status of all AI services',
        content: { 'application/json': { schema: serviceStatusSchema } }
      }
    }
  }),
  handleServiceStatus as any
)

router.openapi(
  createRoute({
    path: '/models',
    method: 'get',
    request: {
      query: z.object({
        service: z.string().optional().openapi({
          description: 'Service to get models for (openai, ollama, openrouter, anthropic, lmstudio, or auto for all)',
          example: 'auto'
        }),
        source: z.enum(['live', 'config']).optional().openapi({
          description: 'Data source: live fetch from providers, or config-guidance from models.json',
          example: 'config'
        }),
        view: z.enum(['capability', 'provider', 'both']).optional().openapi({
          description: 'When source=config, return models grouped by capability (default), by provider, or both',
          example: 'both'
        })
      })
    },
    responses: {
      200: {
        description: 'Returns available models for the specified service(s)',
        content: {
          'application/json': {
            schema: z.union([
              modelsSchema,
              z.object({
                openai: modelsSchema,
                ollama: modelsSchema,
                openrouter: modelsSchema,
                anthropic: modelsSchema,
                lmstudio: modelsSchema,
                google: modelsSchema,
              }),
              modelsGuidanceSchema.extend({ byProvider: providerViewSchema }).partial({ byCapability: true, byProvider: true })
            ])
          }
        }
      }
    }
  }),
  handleGetModels as any
)

router.openapi(
  createRoute({
    path: '/health/{service}',
    method: 'get',
    request: {
      params: z.object({
        service: z.string().openapi({
          description: 'Service to check health for',
          example: 'ollama'
        })
      })
    },
    responses: {
      200: {
        description: 'Returns health status of the specified service',
        content: {
          'application/json': {
            schema: z.object({
              service: z.string(),
              available: z.boolean(),
              timestamp: z.string()
            })
          }
        }
      }
    }
  }),
  handleServiceHealth as any
)

export default {
  handler: router,
  mountPath: 'services'
}

