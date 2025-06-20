import { z } from 'zod'
import { usageSchema } from './responses'

/**
 * Body sent by the client for tweet creation.
 */
export const tweetRequestSchema = z.object({
  topic: z.string().min(1, 'Topic must not be empty').describe('The topic or subject for the tweet'),
})

/**
 * Successful response returned to the client for tweet creation.
 */
export const tweetResponseSchema = z.object({
  tweet: z.string().describe('The generated tweet content'),
  characterCount: z.number().describe('Number of characters in the tweet'),
  author: z.string().describe('The author signature of the tweet'),
  usage: usageSchema,
})

export type TweetReq = z.infer<typeof tweetRequestSchema>
export type TweetRes = z.infer<typeof tweetResponseSchema> 