import { z } from 'zod/v3';
import { llmRequestSchema } from './llm'

/**
 * Body sent by the client for meeting notes extraction
 */
export const payloadSchema = z.object({
  text: z.string().min(1, 'Text must not be empty')
})

export const meetingNotesRequestSchema = z.object({
  payload: payloadSchema,
  config: llmRequestSchema
})

/**
 * Successful response returned to the client.
 */
export const meetingNotesResponseSchema = z.object({
  decisions: z.array(z.string()).describe('Decisions made during the meeting'),
  tasks: z.array(z.object({
    task: z.string(),
    owner: z.string().optional(),
    estimate: z.string().optional().describe('Estimated completion time or effort (e.g., "2 weeks", "3 days", "high priority")')
  })).describe('Action items identified during the meeting'),
  attendees: z.array(z.string()).describe('List of attendees if mentioned'),
  meeting_date: z.string().optional().describe('Meeting date/time in ISO 8601 (e.g., YYYY-MM-DD or YYYY-MM-DDTHH:mm) if mentioned'),
  updates: z.array(z.string()).describe('Status updates or progress mentioned during the meeting'),
  summary: z.string().describe('Short summary (1–2 sentences) of the meeting'),
  provider: z.string().optional().describe('The AI service that was actually used'),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
    total_tokens: z.number()
  })
})

export type MeetingNotesReq = z.infer<typeof meetingNotesRequestSchema>
export type MeetingNotesRes = z.infer<typeof meetingNotesResponseSchema>

export function createMeetingNotesResponse(
  data: { decisions: string[]; tasks: { task: string; owner?: string; estimate?: string }[]; attendees: string[]; meeting_date?: string; updates: string[]; summary: string },
  provider?: string,
  usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 }
): z.infer<typeof meetingNotesResponseSchema> {
  return {
    decisions: data.decisions,
    tasks: data.tasks,
    attendees: data.attendees,
    meeting_date: data.meeting_date,
    updates: data.updates,
    summary: data.summary,
    provider,
    usage
  }
}


