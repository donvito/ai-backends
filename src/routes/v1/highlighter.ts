import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { Context } from 'hono'
import { processStructuredOutputRequest } from '../../services/ai'
import { highlighterPrompt } from '../../utils/prompts'
import { handleError } from '../../utils/errorHandler'
import { apiVersion } from './versionConfig'
import { createFinalResponse } from './finalResponse'
import { 
	highlighterRequestSchema, 
	highlighterResponseSchema, 
	createHighlighterResponse,
	highlightSpanSchema
} from '../../schemas/v1/highlighter'

const router = new OpenAPIHono()

const responseSchema = z.object({
	highlights: z.array(highlightSpanSchema)
})

function isAlphaNumeric(char: string | undefined): boolean {
	// Guard against undefined
	if (char === undefined) return false
	// Use a more comprehensive regex that includes common Unicode ranges for letters and numbers
	// This includes Latin, common European extensions, and digit characters
	// For full Unicode support, consider using a library like XRegExp
	return /[A-Za-z0-9\u00C0-\u024F\u1E00-\u1EFF]/.test(char);
}

function snapToWordBoundaries(text: string, start: number, end: number) {
	const length = text.length
	let s = Math.max(0, Math.min(start, length))
	let e = Math.max(0, Math.min(end, length))
	if (e <= s) {
		// minimal 1-char span
		e = Math.min(length, s + 1)
	}

	// Trim leading/trailing whitespace first
	while (s < e && /\s/.test(text[s])) s++
	while (e > s && /\s/.test(text[e - 1])) e--

	// Expand to word boundaries when the selection cuts through a word
	// Check bounds before accessing characters
	if (s > 0 && s < length && isAlphaNumeric(text[s]) && isAlphaNumeric(text[s - 1])) {
		while (s > 0 && isAlphaNumeric(text[s - 1])) s--
	}
	if (e > 0 && e < length && isAlphaNumeric(text[e - 1]) && isAlphaNumeric(text[e])) {
		while (e < length && isAlphaNumeric(text[e])) e++
	}

	return { start: s, end: e }
}

function normaliseHighlights(text: string, highlights: Array<{ char_start_position: number; char_end_position: number; label?: string; description?: string }>) {
	const length = text.length
	const normalised = highlights
		.map((h) => {
			const { start, end } = snapToWordBoundaries(text, h.char_start_position ?? 0, h.char_end_position ?? 0)
			return {
				char_start_position: Math.max(0, Math.min(start, length)),
				char_end_position: Math.max(0, Math.min(end, length)),
				label: h.label ?? 'Highlight',
				description: h.description ?? ''
			}
		})
		.filter((h) => h.char_end_position > h.char_start_position)
		.sort((a, b) => a.char_start_position - b.char_start_position)

	// Merge only truly overlapping highlights to avoid visual glitches
	const merged: typeof normalised = []
	for (const h of normalised) {
		const last = merged[merged.length - 1]
		if (last && h.char_start_position < last.char_end_position) {
			// Only merge if there's actual overlap (not just adjacent)
			last.char_end_position = Math.max(last.char_end_position, h.char_end_position)
			if (!last.description && h.description) last.description = h.description
			continue
		}
		merged.push({ ...h })
	}

	return merged
}

async function handleHighlighterRequest(c: Context) {
	try {
		const { payload, config } = await c.req.json()
		const prompt = highlighterPrompt(payload.text, payload.maxHighlights)
		const temperature = payload.temperature ?? config.temperature ?? 0
		const result = await processStructuredOutputRequest(
			prompt,
			responseSchema,
			{ ...config, temperature },
			temperature
		)
		const rawHighlights = result.object.highlights
		const highlights = normaliseHighlights(payload.text, rawHighlights)
		const finalResponse = createHighlighterResponse(
			highlights,
			config.provider,
			config.model,
			{
				input_tokens: result.usage.inputTokens,
				output_tokens: result.usage.outputTokens,
				total_tokens: result.usage.totalTokens
			}
		)
		const finalResponseWithVersion = createFinalResponse(finalResponse, apiVersion)
		return c.json(finalResponseWithVersion, 200)
	} catch (error) {
		return handleError(c, error, 'Failed to generate highlights')
	}
}

router.openapi(
	createRoute({
		path: '/',
		method: 'post',
		security: [ { BearerAuth: [] } ],
		request: {
			body: {
				content: {
					'application/json': {
						schema: highlighterRequestSchema
					}
				}
			}
		},
		responses: {
			200: {
				description: 'Returns highlight spans with labels and descriptions for key parts of the text.',
				content: {
					'application/json': {
						schema: highlighterResponseSchema
					}
				}
			}
		},
		summary: 'Highlight key parts of text',
		description: 'This endpoint receives a text and uses an LLM to generate highlight spans with labels and descriptions for key parts of the text.',
		tags: ['API']
	}),
	handleHighlighterRequest as any
)

export default {
	handler: router,
	mountPath: 'highlighter'
}
