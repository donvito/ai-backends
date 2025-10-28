import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { syntheticDataPrompt } from '../../utils/prompts'
import { handleError } from '../../utils/errorHandler'
import { 
  syntheticDataRequestSchema, 
  syntheticDataResponseSchema, 
  createSyntheticDataResponse 
} from '../../schemas/v1/syntheticData'
import { processTextOutputRequest } from '../../services/ai'
import { apiVersion } from './versionConfig'
import { createFinalResponse } from './finalResponse'

const router = new OpenAPIHono()

/**
 * Validates generated JSON data against provided schema
 */
function validateAgainstSchema(data: any, schema: any): boolean {
  try {
    // Basic validation - in a production environment, you might want to use a proper JSON schema validator
    // like ajv for more comprehensive validation
    if (!schema) return true;
    
    // Simple type checking for common schema properties
    if (schema.type) {
      const expectedType = schema.type;
      const actualType = Array.isArray(data) ? 'array' : typeof data;
      
      if (expectedType === 'object' && actualType !== 'object') return false;
      if (expectedType === 'array' && actualType !== 'array') return false;
      if (expectedType === 'string' && actualType !== 'string') return false;
      if (expectedType === 'number' && actualType !== 'number') return false;
      if (expectedType === 'boolean' && actualType !== 'boolean') return false;
    }
    
    return true;
  } catch (error) {
    console.error('Schema validation error:', error);
    return false;
  }
}

/**
 * Parses and validates JSON response from AI
 */
function parseAndValidateJSON(text: string, schema?: any): { data: any; valid: boolean } {
  try {
    // Clean up the response - remove any markdown code blocks or extra text
    let cleanedText = text.trim();
    
    // Remove markdown code blocks if present
    if (cleanedText.startsWith('```json')) {
      cleanedText = cleanedText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    
    // Try to parse as JSON
    const data = JSON.parse(cleanedText);
    const valid = validateAgainstSchema(data, schema);
    
    return { data, valid };
  } catch (error) {
    console.error('JSON parsing error:', error);
    return { data: { error: 'Failed to parse generated data as valid JSON' }, valid: false };
  }
}

/**
 * Specialized streaming function for synthetic data that includes JSON parsing and validation
 */
async function writeSyntheticDataStreamSSE(
  stream: any,
  result: any,
  meta: { provider: string; model: string; version: string },
  payload: any
) {
  const textStream = result.textStream
  if (!textStream) {
    throw new Error('Streaming not supported for this provider/model')
  }

  let accumulatedText = ''

  // Stream chunks while accumulating text
  for await (const chunk of textStream) {
    accumulatedText += chunk
    await stream.writeSSE({
      data: JSON.stringify({
        chunk,
        provider: meta.provider,
        model: meta.model,
        version: meta.version,
      }),
    })
  }

  // Parse and validate the complete response
  const { data, valid } = parseAndValidateJSON(accumulatedText, payload.schema)

  // Get usage information
  const usage = await result.usage

  // Send final event with validation metadata (matching non-streaming format)
  if (usage) {
    await stream.writeSSE({
      data: JSON.stringify({
        done: true,
        data,
        usage: {
          input_tokens: usage.inputTokens,
          output_tokens: usage.outputTokens,
          total_tokens: usage.totalTokens,
        },
        metadata: {
          count: payload.count || 1,
          validation_passed: valid
        },
        provider: meta.provider,
        model: meta.model,
        version: meta.version,
      }),
    })
  }
}

/**
 * Handler for synthetic data generation requests
 */
async function handleSyntheticDataRequest(c: Context) {
  try {
    const { payload, config } = await c.req.json()
    const provider = config.provider
    const model = config.model
    const isStreaming = config.stream || false
    
    // Create prompt for synthetic data generation
    const prompt = syntheticDataPrompt(
      payload.prompt, 
      payload.count || 1, 
      payload.schema
    )
    
    // Handle streaming response
    if (isStreaming) {
      const result = await processTextOutputRequest(prompt, config)
      
      // Set SSE headers
      c.header('Content-Type', 'text/event-stream')
      c.header('Cache-Control', 'no-cache')
      c.header('Connection', 'keep-alive')
      
      return streamSSE(c, async (stream) => {
        try {
          await writeSyntheticDataStreamSSE(
            stream,
            result,
            { provider, model, version: apiVersion },
            payload
          )
        } catch (error) {
          await stream.writeSSE({
            data: JSON.stringify({
              error: error instanceof Error ? error.message : 'Streaming error',
              done: true
            })
          })
        } finally {
          await stream.close()
        }
      })
    }
    
    // Handle non-streaming response
    const result = await processTextOutputRequest(prompt, config)
    
    // Parse and validate the generated JSON
    const { data, valid } = parseAndValidateJSON(result.text, payload.schema);
    
    // Create response with generated data and metadata
    const finalResponse = createSyntheticDataResponse(
      data,
      provider,
      model,
      {
        input_tokens: result.usage.inputTokens,
        output_tokens: result.usage.outputTokens,
        total_tokens: result.usage.totalTokens,
      },
      {
        count: payload.count || 1,
        validation_passed: valid
      }
    )
    
    // Add API version to response
    const finalResponseWithVersion = createFinalResponse(finalResponse, apiVersion)
    
    return c.json(finalResponseWithVersion, 200)
  } catch (error) {
    return handleError(c, error, 'Failed to generate synthetic data')
  }
}

// Define OpenAPI route
router.openapi(
  createRoute({
    path: '/',
    method: 'post',
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: {
          'application/json': {
            schema: syntheticDataRequestSchema
          }
        }
      }
    },
    responses: {
      200: {
        description: 'Returns generated synthetic data in the requested format.',
        content: {
          'application/json': {
            schema: syntheticDataResponseSchema
          }
        }
      },
      401: {
        description: 'Unauthorized - Bearer token required',
        content: {
          'application/json': {
            schema: z.object({
              error: z.string()
            })
          }
        }
      },
      400: {
        description: 'Bad Request - Invalid input',
        content: {
          'application/json': {
            schema: z.object({
              error: z.string()
            })
          }
        }
      },
      500: {
        description: 'Internal Server Error',
        content: {
          'application/json': {
            schema: z.object({
              error: z.string()
            })
          }
        }
      }
    },
    summary: 'Generate synthetic data based on user prompt',
    description: 'This endpoint generates synthetic data based on a user-provided prompt. Users must provide a JSON schema that defines the structure of the generated data.',
    tags: ['API']
  }),
  handleSyntheticDataRequest as any
)

export default {
  handler: router,
  mountPath: 'synthetic-data'
}

