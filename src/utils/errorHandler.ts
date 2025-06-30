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