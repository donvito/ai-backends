import { z } from 'zod/v3';
import { llmRequestSchema } from './llm'

/**
 * Highlighter payload schema
 */
export const highlighterPayloadSchema = z.object({
	text: z.string().min(1, 'Text must not be empty'),
	maxHighlights: z.number().int().positive().optional(),
	temperature: z.number().min(0).max(1).optional(),
})

export const highlighterRequestSchema = z.object({
	payload: highlighterPayloadSchema,
	config: llmRequestSchema
})

export const highlightSpanSchema = z.object({
	char_start_position: z.number().int().nonnegative(),
	char_end_position: z.number().int().nonnegative().describe('Exclusive end index'),
	label: z.string().min(1).max(80).describe('Short label identifying the highlight'),
	description: z.string()
}).refine((val) => val.char_start_position < val.char_end_position, {
	message: 'char_start_position must be less than char_end_position'
})

export const highlighterResponseSchema = z.object({
	highlights: z.array(highlightSpanSchema),
	provider: z.string().optional().describe('The AI service that was actually used'),
	model: z.string().optional().describe('The model that was actually used'),
	usage: z.object({
		input_tokens: z.number(),
		output_tokens: z.number(),
		total_tokens: z.number(),
	})
})

export type HighlighterReq = z.infer<typeof highlighterRequestSchema>
export type HighlighterRes = z.infer<typeof highlighterResponseSchema>

export function createHighlighterResponse(
	highlights: z.infer<typeof highlightSpanSchema>[],
	provider?: string,
	model?: string,
	usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 }
): z.infer<typeof highlighterResponseSchema> {
	return {
		highlights,
		provider,
		model,
		usage,
	}
}
