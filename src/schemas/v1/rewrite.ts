import { z } from 'zod'
import { llmRequestSchema } from './llm'

const REWRITE_TONES = [
  'Friendly',
  'Formal',
  'Casual',
  'Professional',
  'Confident',
  'Empathetic',
  'Persuasive',
  'Playful',
  'Direct',
  'Funny',
  'Positive',
  'Negative',
  'Neutral',
  'Dramatic',
  'Whimsical',
  'Educational',
  'Technical',
  'Sarcastic',
] as const

export type RewriteTone = typeof REWRITE_TONES[number]

const toneCanonicalMap: Record<string, RewriteTone> = {
  friendly: 'Friendly',
  formal: 'Formal',
  casual: 'Casual',
  professional: 'Professional',
  confident: 'Confident',
  empathetic: 'Empathetic',
  persuasive: 'Persuasive',
  playful: 'Playful',
  direct: 'Direct',
  funny: 'Funny',
  positive: 'Positive',
  negative: 'Negative',
  neutral: 'Neutral',
  dramatic: 'Dramatic',
  whimsical: 'Whimsical',
  educational: 'Educational',
  technical: 'Technical',
  sarcastic: 'Sarcastic',
} as const


export function canonicalizeTone(input: string | undefined | null): RewriteTone | undefined {
  if (!input) return undefined
  const key = String(input).toLowerCase().trim()
  return toneCanonicalMap[key]
}

export function isValidTone(input: string | undefined | null): boolean {
  return canonicalizeTone(input) !== undefined
}

export function getAvailableTones(): readonly RewriteTone[] {
  return REWRITE_TONES
}

export function getTonesDisplayList(): string {
  return REWRITE_TONES.join(', ')
}

export const rewriteInstructionEnum = z.enum([
  'improve_text',
  'fix_spelling_grammar',
  'brainstorm_ideas',
  'shorten',
  'rewrite_with_tone',
])

export const rewriteToneEnum = z.enum(REWRITE_TONES)

export const payloadSchema = z
  .object({
    text: z.string().min(1, 'Text must not be empty').describe('Text to rewrite'),
    instruction: z
      .string()
      .transform((v) => v.toLowerCase())
      .pipe(rewriteInstructionEnum)
      .describe('Predefined rewrite instruction (case-insensitive)'),
    tone: z
      .string()
      .transform((v) => (canonicalizeTone(v) ?? v) as string)
      .pipe(rewriteToneEnum)
      .optional()
      .describe('Required only when instruction = rewrite_with_tone (case-insensitive)'),
    maxLength: z.number().min(0).optional(),
  })
  .refine(
    (data) => (data.instruction === 'rewrite_with_tone' ? !!data.tone && data.tone.trim().length > 0 : true),
    {
      message: 'tone is required when instruction is rewrite_with_tone',
      path: ['tone'],
    }
  )

export const rewriteRequestSchema = z.object({
  payload: payloadSchema,
  config: llmRequestSchema,
})

/**
 * Successful response returned to the client.
 */
export const rewriteResponseSchema = z.object({
  text: z.string(),
  provider: z.string().optional().describe('The AI service that was actually used'),
  model: z.string().optional().describe('The model that was actually used'),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
    total_tokens: z.number(),
  }),
})

export function createRewriteResponse(
  text: string,
  provider?: string,
  model?: string,
  usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 }
) {
  return { text, provider, model, usage }
}

export type RewriteReq = z.infer<typeof rewriteRequestSchema>
export type RewriteRes = z.infer<typeof rewriteResponseSchema>
