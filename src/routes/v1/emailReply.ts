import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { Context } from 'hono'
import { emailReplyPrompt } from '../../utils/prompts'
import { handleError } from '../../utils/errorHandler'
import { emailReplyRequestSchema, emailReplyResponseSchema, createEmailReplyResponse } from '../../schemas/v1/emailReply'
import { processTextOutputRequest } from '../../services/ai'
import { apiVersion } from './versionConfig'
import { createFinalResponse } from './finalResponse'
import {handleStreaming} from "../../utils/streamingHandler";

const router = new OpenAPIHono()

async function handleEmailReplyRequest(c: Context) {
  try {
    const { payload, config } = await c.req.json()
    const provider = config.provider
    const model = config.model
    const isStreaming = config.stream || false
    const prompt = emailReplyPrompt(
      payload.text,
      payload.customInstruction,
      payload.senderName,
      payload.recipientName
    )
    
    // Handle streaming response
    if (isStreaming) {
      const result = await processTextOutputRequest(prompt, config)
      return handleStreaming(c, result, provider, model, apiVersion)
    }
    
    // Handle non-streaming response (existing logic)
    const result = await processTextOutputRequest(prompt, config)
    const finalResponse = createEmailReplyResponse(result.text, provider, model, {
      input_tokens: result.usage.promptTokens,
      output_tokens: result.usage.completionTokens,
      total_tokens: result.usage.totalTokens,
    })
    const finalResponseWithVersion = createFinalResponse(finalResponse, apiVersion)
    return c.json(finalResponseWithVersion, 200)
  } catch (error) {
    return handleError(c, error, 'Failed to generate email reply')
  }
}

router.openapi(
  createRoute({
    path: '/',
    method: 'post',
    request: {
      body: {
        content: {
          'application/json': {
            schema: emailReplyRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Returns an email reply to the provided email text.',
        content: {
          'application/json': {
            schema: emailReplyResponseSchema,
          },
        },
      },
    },
    summary: 'Generate an email reply',
    description: 'This endpoint receives an email text and uses an LLM to generate a reply to the email.',
    tags: ['API']
  }),
  handleEmailReplyRequest as any
)

export default {
  handler: router,
  mountPath: 'email-reply',
}


