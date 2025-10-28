import { z } from 'zod/v3';
import { providersSupported } from '../../services/providers'

/**
 * Body sent by the client.
 */
export const llmRequestSchema = z.object({
  provider: providersSupported.describe('AI service to use'),
  model: z.string().describe('Specific model to use'),
  temperature: z.number().optional().default(0),
  stream: z.boolean().optional().default(false).describe('Enable streaming response')
})
