import OpenAI from "openai";
import { z } from "zod";

// Configuration with environment variable validation
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'
const OPENAI_API_KEY = process.env.OPENAI_API_KEY

if (!OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY environment variable is required')
  process.exit(1)
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
