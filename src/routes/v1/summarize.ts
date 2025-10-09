import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { summarizePrompt } from '../../utils/prompts'
import { handleError } from '../../utils/errorHandler'
import { summarizeRequestSchema, summarizeResponseSchema, createSummarizeResponse, createAgentSummarizeResponse } from '../../schemas/v1/summarize'
import { processTextOutputRequest } from '../../services/ai'
import { apiVersion } from './versionConfig'
import { createFinalResponse } from './finalResponse'
import { writeTextStreamSSE } from './streamUtils'
import { AgentFactory } from '../../agents/agent-factory'

const router = new OpenAPIHono()

async function handleSummarizeRequest(c: Context) {
  try {
    const { payload, config } = await c.req.json()
    const provider = config.provider
    const model = config.model
    const isStreaming = config.stream || false
    const useAgent = config.useAgent || false
    
    // Handle agent-enhanced processing
    if (useAgent) {
      return handleAgentSummarize(c, payload, config)
    }
    
    // Handle standard processing (existing logic)
    const prompt = summarizePrompt(payload.text, payload.maxLength)
    
    // Handle streaming response
    if (isStreaming) {
      const result = await processTextOutputRequest(prompt, config)
      
      // Set SSE headers
      c.header('Content-Type', 'text/event-stream')
      c.header('Cache-Control', 'no-cache')
      c.header('Connection', 'keep-alive')
      
      return streamSSE(c, async (stream) => {
        try {
          await writeTextStreamSSE(
            stream,
            result,
            { provider, model, version: apiVersion }
          )
        } catch (error) {
          console.error('Streaming error:', error)
          try {
            await stream.writeSSE({
              data: JSON.stringify({
                error: error instanceof Error ? error.message : 'Streaming error',
                done: true
              })
            })
          } catch (writeError) {
            console.error('Error writing error message to stream:', writeError)
          }
        } finally {
          try {
            await stream.close()
          } catch (closeError) {
            console.error('Error closing stream:', closeError)
          }
        }
      })
    }
    
    // Handle non-streaming response (existing logic)
    const result = await processTextOutputRequest(prompt, config)
    const finalResponse = createSummarizeResponse(result.text, provider, model, {
      input_tokens: result.usage.promptTokens,
      output_tokens: result.usage.completionTokens,
      total_tokens: result.usage.totalTokens,
    })

    const finalResponseWithVersion = createFinalResponse(finalResponse, apiVersion)

    return c.json(finalResponseWithVersion, 200)
  } catch (error) {
    return handleError(c, error, 'Failed to summarize text')
  }
}

// NEW: Agent-enhanced summarization handler
async function handleAgentSummarize(c: Context, payload: any, config: any) {
  try {
    // Create agent with user's provider configuration
    const agent = AgentFactory.createEnhancedSummarizeAgent({
      provider: config.provider,
      model: config.model,
      temperature: config.temperature || 0.3
    });

    // Create a simple, clear prompt for the agent
    const agentPrompt = `Please analyze this document. Maximum summary length: ${payload.maxLength || 300} characters.

Document:
${payload.text}

Use the word_counter tool to get document statistics, then provide a comprehensive analysis with summary, keywords, sentiment, insights, and action items.`;

    // Execute the agent - it will automatically use the word_counter tool
    const result = await agent.generate(agentPrompt);

    // Parse the agent's response
    let parsedResult;
    try {
      // Extract JSON from the response if it's wrapped in text
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      parsedResult = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(result.text);
    } catch (parseError) {
      console.warn('Failed to parse agent response as JSON, using fallback:', parseError);
      // Fallback if parsing fails
      parsedResult = {
        summary: result.text.substring(0, payload.maxLength || 300),
        originalStats: { words: 0, characters: 0, sentences: 0, paragraphs: 0 },
        analysis: {
          documentType: 'general',
          complexity: 'medium',
          keyThemes: [],
          sentiment: {
            overall: 'neutral',
            confidence: 0.5,
            emotions: [],
            explanation: 'Analysis completed'
          },
          keywords: []
        },
        insights: ['Analysis completed using agent processing'],
        actionItems: []
      };
    }

    // Use actual usage data from the agent
    const totalUsage = {
      input_tokens: result.usage?.promptTokens || 0,
      output_tokens: result.usage?.completionTokens || 0,
      total_tokens: result.usage?.totalTokens || 0
    };

    const enhancedResponse = createAgentSummarizeResponse(
      parsedResult.summary || '',
      {
        ...parsedResult.analysis,
        originalStats: parsedResult.originalStats
      },
      parsedResult.insights || [],
      parsedResult.actionItems || [],
      config.provider,
      config.model,
      totalUsage
    );

    const finalResponseWithVersion = createFinalResponse(enhancedResponse, apiVersion);

    return c.json(finalResponseWithVersion, 200);

  } catch (error) {
    console.error('Agent summarization error:', error);
    return handleError(c, error, 'Failed to process agent summarization');
  }
}

router.openapi(
  createRoute({
    path: '/',
    method: 'post',
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: {
          'application/json': {
            schema: summarizeRequestSchema
          }
        }
      }
    },
    responses: {
      200: {
        description: 'Returns the summarized text (standard or agent-enhanced)',
        content: {
          'application/json': {
            schema: summarizeResponseSchema
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
      }
    },
    summary: 'Summarize text (Standard or Agent-Enhanced)',
    description: 'This endpoint summarizes text. Set useAgent: true for enhanced analysis with insights and action items.',
    tags: ['API']
  }),
  handleSummarizeRequest as any
)

export default {
  handler: router,
  mountPath: 'summarize'
}
