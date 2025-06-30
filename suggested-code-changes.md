# Suggested Code Changes for AI Backend

This document outlines the specific code changes needed to fix the critical and high-priority issues identified in the code review.

## 🔴 Critical Fixes (Must Implement)

### 1. Fix OpenAI Service Implementation

**Problem**: The current implementation uses non-existent OpenAI API methods.

**File**: `src/services/openai.ts`

**Replace the entire file with**:

```typescript
import OpenAI from "openai";
import { z } from "zod";

// Configuration with validation
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'
const OPENAI_API_KEY = process.env.OPENAI_API_KEY

if (!OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY environment variable is required')
}

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// Standardized usage type
export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

// API Error class for better error handling
export class OpenAIError extends Error {
  constructor(message: string, public statusCode: number = 500) {
    super(message);
    this.name = 'OpenAIError';
  }
}

/**
 * Generate a response using OpenAI with structured output
 */
export async function generateResponse<T extends z.ZodType>(
  prompt: string,
  schema: T,
): Promise<{ 
  data: z.infer<T>; 
  usage: TokenUsage;
}> {
  try {
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });

    if (!response.choices[0]?.message?.content) {
      throw new OpenAIError('No response content received from OpenAI');
    }

    // Parse the JSON response
    let parsedData;
    try {
      parsedData = JSON.parse(response.choices[0].message.content);
    } catch (error) {
      throw new OpenAIError('Invalid JSON response from OpenAI');
    }

    // Validate against schema
    const validatedData = schema.parse(parsedData);

    // Convert usage data to standardized format
    const usage: TokenUsage = {
      input_tokens: response.usage?.prompt_tokens || 0,
      output_tokens: response.usage?.completion_tokens || 0,
      total_tokens: response.usage?.total_tokens || 0
    };

    return {
      data: validatedData,
      usage
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new OpenAIError(`Response validation failed: ${error.message}`, 422);
    }
    if (error instanceof OpenAIError) {
      throw error;
    }
    throw new OpenAIError(`OpenAI API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generate a tweet using OpenAI
 */
export async function generateTweet(topic: string): Promise<{
  tweet: string;
  characterCount: number;
  author: string;
  usage: TokenUsage;
}> {
  try {
    const systemPrompt = `You are a tweet creator. Create an engaging tweet about the given topic.
    
Rules:
- Use 3-5 phrases with new lines
- Limit to 450 characters (leaving room for author signature)
- Be engaging and use emojis appropriately
- Do NOT include author signature in your response

Examples:
"Google just released an AI app builder 🔥🔥🔥

@Firebase Studio — will it kill competition

see for yourself👇"

"Sonnet 4 is available in Cursor!

We've been very impressed by its coding ability. It is much easier to control than 3.7 and is excellent at understanding codebases.

It appears to be a new state of the art."`;

    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Create a tweet about: ${topic}` }
      ],
      temperature: 1,
      max_tokens: 500,
    });

    if (!response.choices[0]?.message?.content) {
      throw new OpenAIError('No response content received from OpenAI');
    }

    const baseTweet = response.choices[0].message.content.trim();
    
    // Add author signature
    const author = "— @AITweetBot";
    const tweetWithAuthor = `${baseTweet}\n\n${author}`;
    const characterCount = tweetWithAuthor.length;

    // Convert usage data to standardized format
    const usage: TokenUsage = {
      input_tokens: response.usage?.prompt_tokens || 0,
      output_tokens: response.usage?.completion_tokens || 0,
      total_tokens: response.usage?.total_tokens || 0,
    };

    return {
      tweet: tweetWithAuthor,
      characterCount,
      author,
      usage
    };
  } catch (error) {
    if (error instanceof OpenAIError) {
      throw error;
    }
    throw new OpenAIError(`Tweet generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export { openai, OPENAI_MODEL }
```

### 2. Standardize Response Schemas

**Problem**: Inconsistent usage object structures between schemas and actual responses.

**File**: `src/schemas/responses.ts`

**Replace with**:

```typescript
import { z } from '@hono/zod-openapi'

// Standardized usage schema - matches TokenUsage interface
export const usageSchema = z.object({
  input_tokens: z.number(),
  output_tokens: z.number(),
  total_tokens: z.number()
})

export const errorResponseSchema = z.object({
  error: z.string(),
  errorCode: z.string().optional(),
  statusCode: z.number().optional()
})

export const summaryResponseSchema = z.object({
  summary: z.string(),
  usage: usageSchema
})
```

### 3. Improve Error Handling

**File**: `src/utils/errorHandler.ts`

**Replace with**:

```typescript
import { Context } from 'hono'

// Custom API Error class
export class APIError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public errorCode: string = 'INTERNAL_ERROR'
  ) {
    super(message)
    this.name = 'APIError'
  }
}

/**
 * Handle API errors consistently with structured responses
 */
export function handleError(c: Context, error: unknown, defaultMessage = 'Internal server error') {
  console.error(`Error: ${defaultMessage}`, error)
  
  if (error instanceof APIError) {
    return c.json({ 
      error: error.message,
      errorCode: error.errorCode,
      statusCode: error.statusCode
    }, error.statusCode)
  }

  // Handle validation errors (Zod errors)
  if (error && typeof error === 'object' && 'issues' in error) {
    const zodError = error as any
    return c.json({
      error: 'Validation failed',
      errorCode: 'VALIDATION_ERROR',
      statusCode: 400,
      details: zodError.issues
    }, 400)
  }

  // Generic error handling
  const message = error instanceof Error ? error.message : defaultMessage
  return c.json({ 
    error: message,
    errorCode: 'INTERNAL_ERROR',
    statusCode: 500
  }, 500)
}

/**
 * Handle validation errors for required fields
 */
export function handleValidationError(c: Context, field: string) {
  return c.json({ 
    error: `${field} is required`,
    errorCode: 'MISSING_FIELD',
    statusCode: 400
  }, 400)
}
```

### 4. Update Route Handlers (Remove Type Assertions)

**File**: `src/routes/summarize.ts`

**Key changes**:
- Remove `as any` type assertions
- Add proper error handling
- Update response schema
- Add request validation

```typescript
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { Context } from 'hono'
import { generateResponse, OpenAIError } from '../services/openai'
import { summarizePrompt } from '../utils/prompts'
import { handleError, handleValidationError, APIError } from '../utils/errorHandler'
import { summarizeRequestSchema } from '../schemas/summarize'
import { usageSchema } from '../schemas/responses'

const router = new OpenAPIHono()

const responseSchema = z.object({
  summary: z.string().describe('The summary of the text'),
  usage: usageSchema
})

const summarizeOutputSchema = z.object({
  summary: z.string()
})

/**
 * Handler for text summarization endpoint
 */
async function handleSummarizeRequest(c: Context) {
  try {
    const body = await c.req.json()
    const validatedBody = summarizeRequestSchema.parse(body)
    const { text, maxLength } = validatedBody

    // Generate the prompt with instructions for JSON output
    const prompt = `${summarizePrompt(text, maxLength)}

Please respond with a JSON object in this format:
{
  "summary": "your summary here"
}`

    // Get response using our service
    const { data, usage } = await generateResponse(
      prompt,
      summarizeOutputSchema
    )

    return c.json({ 
      summary: data.summary,
      usage
    }, 200)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(c, 'Invalid request body')
    }
    if (error instanceof OpenAIError) {
      return handleError(c, new APIError(error.message, error.statusCode, 'OPENAI_ERROR'))
    }
    return handleError(c, error, 'Failed to summarize text')
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
            schema: summarizeRequestSchema
          }
        }
      }
    },
    responses: {
      200: {
        description: 'Returns the summarized text.',
        content: {
          'application/json': {
            schema: responseSchema
          }
        }
      },
      400: {
        description: 'Bad request - validation error'
      },
      500: {
        description: 'Internal server error'
      }
    },
    tags: ['Text Processing']
  }), 
  handleSummarizeRequest  // Removed 'as any'
)  

export default {
  handler: router,
  mountPath: 'summarize'
}
```

**Apply similar changes to**:
- `src/routes/keywords.ts`
- `src/routes/tweet.ts`

## 🟡 High Priority Fixes

### 5. Update Schema Files

**Files to update with standardized usage schema**:

**`src/schemas/summarize.ts`**:
```typescript
import { z } from 'zod'
import { usageSchema } from './responses'

export const summarizeRequestSchema = z.object({
  text: z.string().min(1, 'Text must not be empty'),
  maxLength: z.number().int().positive().optional(),
})

export const summarizeResponseSchema = z.object({
  summary: z.string(),
  usage: usageSchema,
})

export type SummarizeReq = z.infer<typeof summarizeRequestSchema>
export type SummarizeRes = z.infer<typeof summarizeResponseSchema>
```

**`src/schemas/keywords.ts`**:
```typescript
import { z } from 'zod'
import { usageSchema } from './responses'

export const keywordsRequestSchema = z.object({
  text: z.string().min(1, 'Text must not be empty'),
  maxKeywords: z.number().int().positive().optional(),
})

export const keywordsResponseSchema = z.object({
  keywords: z.array(z.string()),
  usage: usageSchema,
})

export type KeywordsReq = z.infer<typeof keywordsRequestSchema>
export type KeywordsRes = z.infer<typeof keywordsResponseSchema>
```

**`src/schemas/tweet.ts`**:
```typescript
import { z } from 'zod'
import { usageSchema } from './responses'

export const tweetRequestSchema = z.object({
  topic: z.string().min(1, 'Topic must not be empty').describe('The topic or subject for the tweet'),
})

export const tweetResponseSchema = z.object({
  tweet: z.string().describe('The generated tweet content'),
  characterCount: z.number().describe('Number of characters in the tweet'),
  author: z.string().describe('The author signature of the tweet'),
  usage: usageSchema,
})

export type TweetReq = z.infer<typeof tweetRequestSchema>
export type TweetRes = z.infer<typeof tweetResponseSchema>
```

### 6. Improve Docker Configuration

**File**: `Dockerfile`

**Replace with**:

```dockerfile
FROM oven/bun:1-slim as builder
WORKDIR /app

# Copy package files and install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN bun run build

FROM oven/bun:1-slim

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 hono

# Set working directory and copy files with correct ownership
WORKDIR /app
COPY --from=builder --chown=hono:nodejs /app/dist ./dist
COPY --from=builder --chown=hono:nodejs /app/package.json ./
COPY --from=builder --chown=hono:nodejs /app/node_modules ./node_modules

# Switch to non-root user
USER hono

# Set environment variable
ENV NODE_ENV=production

# Expose the port
EXPOSE 3000

# Start the application
CMD ["bun", "dist/index.js"]
```

## 🟢 Medium Priority Improvements

### 7. Add Rate Limiting

**Create**: `src/middleware/rateLimiter.ts`

```typescript
import { Context, Next } from 'hono'

interface RateLimitStore {
  [key: string]: {
    count: number
    resetTime: number
  }
}

const store: RateLimitStore = {}

export function rateLimit(options: {
  windowMs: number
  max: number
  message?: string
}) {
  return async (c: Context, next: Next) => {
    const key = c.req.header('x-forwarded-for') || 'unknown'
    const now = Date.now()
    
    if (!store[key] || now > store[key].resetTime) {
      store[key] = {
        count: 1,
        resetTime: now + options.windowMs
      }
    } else {
      store[key].count++
    }
    
    if (store[key].count > options.max) {
      return c.json({
        error: options.message || 'Too many requests',
        errorCode: 'RATE_LIMIT_EXCEEDED',
        statusCode: 429
      }, 429)
    }
    
    await next()
  }
}
```

### 8. Add Request Logging Middleware

**Create**: `src/middleware/logger.ts`

```typescript
import { Context, Next } from 'hono'

export function requestLogger() {
  return async (c: Context, next: Next) => {
    const start = Date.now()
    const method = c.req.method
    const path = c.req.path
    
    console.log(`[${new Date().toISOString()}] ${method} ${path} - Started`)
    
    await next()
    
    const duration = Date.now() - start
    const status = c.res.status
    
    console.log(`[${new Date().toISOString()}] ${method} ${path} - ${status} (${duration}ms)`)
  }
}
```

### 9. Add Input Sanitization

**Create**: `src/utils/sanitizer.ts`

```typescript
/**
 * Sanitize text input to prevent potential security issues
 */
export function sanitizeText(input: string): string {
  return input
    .trim()
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
    .substring(0, 10000) // Limit length
}

/**
 * Validate and sanitize request body
 */
export function sanitizeRequestBody(body: any): any {
  if (typeof body === 'object' && body !== null) {
    const sanitized: any = {}
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === 'string') {
        sanitized[key] = sanitizeText(value)
      } else if (typeof value === 'number' && !isNaN(value)) {
        sanitized[key] = Math.max(0, Math.min(value, 1000)) // Reasonable bounds
      } else {
        sanitized[key] = value
      }
    }
    return sanitized
  }
  return body
}
```

## 🔧 Implementation Order

1. **First**: Fix OpenAI service (`src/services/openai.ts`)
2. **Second**: Update error handling (`src/utils/errorHandler.ts`)
3. **Third**: Update response schemas (`src/schemas/responses.ts`)
4. **Fourth**: Update all route handlers to remove `as any`
5. **Fifth**: Update all schema files for consistency
6. **Sixth**: Add middleware for rate limiting and logging
7. **Seventh**: Improve Docker configuration

## 🧪 Testing Recommendations

After implementing these changes, test:

1. **API Endpoints**: Verify all endpoints work with curl/Postman
2. **Error Scenarios**: Test with invalid inputs, missing API keys
3. **Rate Limiting**: Test with multiple rapid requests
4. **OpenAI Integration**: Test with actual OpenAI API calls
5. **Docker Build**: Ensure the improved Dockerfile builds successfully

## 📝 Environment Variables

Ensure these environment variables are set:

```bash
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4o-mini  # or your preferred model
DEFAULT_ACCESS_TOKEN=your_secure_token_here
NODE_ENV=development  # or production
PORT=3000  # optional, defaults to 3000
```

These changes will resolve the critical issues and significantly improve the codebase's reliability, maintainability, and production-readiness.