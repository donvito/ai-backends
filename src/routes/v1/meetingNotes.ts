import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { Context } from 'hono'
import { processStructuredOutputRequest } from '../../services/ai'
import { handleError } from '../../utils/errorHandler'
import { apiVersion } from './versionConfig'
import { createFinalResponse } from './finalResponse'
import { meetingNotesRequestSchema, meetingNotesResponseSchema, createMeetingNotesResponse } from '../../schemas/v1/meetingNotes'
import { meetingNotesPrompt } from '../../utils/prompts'

const router = new OpenAPIHono()

// Structured response schema returned by the model
const responseSchema = z.object({
  decisions: z.array(z.string()).describe('Decisions made during the meeting'),
  tasks: z.array(z.object({
    task: z.string(),
    owner: z.string().nullable(),
    estimate: z.string().nullable()
  })),
  attendees: z.array(z.string()),
  meeting_date: z.string().nullable(),
  updates: z.array(z.string()),
  summary: z.string()
})

async function handleMeetingNotesRequest(c: Context) {
  try {
    const { payload, config } = await c.req.json()    
    const prompt = meetingNotesPrompt(payload.text)
    const temperature = config.temperature || 0
    const result = await processStructuredOutputRequest(prompt, responseSchema, config, temperature)
    const data = result.object
    const normalizedTasks = Array.isArray(data.tasks) ? data.tasks.map((t: any) => ({
      task: t.task,
      owner: t.owner ?? undefined,
      estimate: t.estimate ?? undefined,
    })) : []
    const normalizedMeetingDate = data.meeting_date ?? undefined
    const finalResponse = createMeetingNotesResponse(
      { decisions: data.decisions, tasks: normalizedTasks, attendees: data.attendees || [], meeting_date: normalizedMeetingDate, updates: data.updates || [], summary: data.summary || '' },
      config.provider,
      {
        input_tokens: result.usage.inputTokens,
        output_tokens: result.usage.outputTokens,
        total_tokens: result.usage.totalTokens
      }
    )
    const finalResponseWithVersion = createFinalResponse(finalResponse, apiVersion)
    return c.json(finalResponseWithVersion, 200)
  } catch (error) {
    return handleError(c, error, 'Failed to extract meeting notes')
  }
}

router.openapi(
  createRoute({
    path: '/',
    method: 'post',
    request: { body: { content: { 'application/json': { schema: meetingNotesRequestSchema } } } },
    responses: {
      200: {
        description: 'Returns structured meeting notes (date, attendees, tasks, decisions, updates, summary).',
        content: { 'application/json': { schema: meetingNotesResponseSchema } }
      }
    },
    summary: 'Extract meeting notes from text',
    description: 'This endpoint receives a text and uses an LLM to extract meeting notes from the text.',
    tags: ['API']
  }),
  handleMeetingNotesRequest as any
)

export default {
  handler: router,
  mountPath: 'meeting-notes'
}


