import { RewriteTone } from '../schemas/v1/rewrite'

/**
 * System prompt template for summarization
 */
export function summarizePrompt(text: string, maxLength?: number): string {
  const lengthInstruction = maxLength ? ` in ${maxLength} words or less.` : '';
  return `Summarize the following text${lengthInstruction}
Just return the summary, no other text or explanation.

If the text is a conversation, do not attempt to answer the questions or be involved in the conversation.
Just return the summary of the conversation.

<text>
${text}
</text>
:`;
} 

/**
 * System prompt template for composing text from a topic
 */
export function composePrompt(
  topic: string,
  maxLength?: number
): string {
  const lengthInstruction = maxLength ? ` Limit to ${maxLength} words or less.` : ''
  const styleInstruction = ' Use Markdown formatting for paragraphs and lists. Do not add headings.'
  return `Compose a clear, informative piece about the topic below.${lengthInstruction}${styleInstruction}
Just return the composed text without extra explanations.

<topic>
${topic}
</topic>
:`
}

/**
 * System prompt template for keyword extraction
 */
export function keywordsPrompt(text: string, maxKeywords?: number): string {
  return `Extract the most important${maxKeywords ? ` ${maxKeywords}` : ''} keywords from the following text.

Text: ${text}`;
}

/**
 * System prompt for translation
 */
export function translatePrompt(text: string, targetLanguage: string): string {
  return `Translate the following text to ${targetLanguage}. Text: ${text} Just return the translated text, no other text or explanation.`;
}

/**
 * System prompt for image description
 */
export function imageDescriptionPrompt(imageUrl: string): string {
  return `Describe the following image in detail:
  
Image URL: ${imageUrl}`;
}

/**
 * System prompt for image description
 */
export function describeImagePrompt(): string {
  return `Describe the following image`
}


/**
 * System prompt for sentiment analysis
 */
export function sentimentPrompt(text: string, categories?: string[]): string {
  const defaultCategories = ['positive', 'negative', 'neutral'];
  // const sentimentCategories = categories && categories.length > 0 ? categories : defaultCategories;
  
  return `Analyze the sentiment of the following text and return your response in JSON format.

  Return the sentiment of the text using the default categories ${defaultCategories.join(', ')}.

Your response must include:
1. "sentiment": The overall sentiment classification
2. "confidence": A confidence score between 0 and 1 (where 1 is most confident)
3. "emotions": An array of emotion objects, each with "emotion" (string) and "score" (number 0-1)

DO NOT CALL ANY TOOLS OR FUNCTIONS

Text to analyze: ${text}`;
}

/**
 * System prompt for email reply generation
 */
export function emailReplyPrompt(
  text: string,
  customInstruction?: string,
  senderName?: string,
  recipientName?: string
): string {
  const instructionLine = customInstruction
    ? `Additional guidance from requester: ${customInstruction}`
    : 'Write the reply in a professional and concise tone.';

  const addressInstruction = senderName ? `Address the reply to ${senderName} by name, but do not add a greeting line.` : '';
  const signoffInstruction = recipientName ? `Sign the reply as ${recipientName} without adding a signature block.` : '';
  const recipientPerspectiveRule = recipientName
    ? `- ${recipientName} is the recipient of the email, reply using ${recipientName}'s perspective.`
    : '';
  const greetingRule = senderName
    ? `- Always include "hi", "hello" or "dear" addressing ${senderName} unless explicitly asked not to.`
    : `- Always include "hi", "hello" or "dear" unless explicitly asked not to.`;

  const promptText = `You are an email assistant. Compose a thoughtful reply to the following email.

${instructionLine}
${addressInstruction ? `\n${addressInstruction}` : ''}
${signoffInstruction ? `\n${signoffInstruction}` : ''}

Rules:
- Understand the email intent thoroughly before replying.${recipientPerspectiveRule ? `\n${recipientPerspectiveRule}` : ''}
- Do not add a subject line to the reply.
${greetingRule ? `\n${greetingRule}` : ''}
- Be polite, clear, and actionable.
- If information is missing, propose reasonable next steps or clarifying questions. Otherwise, be direct and to the point.

<email_to_reply_to>
"""
${text}
</email_to_reply_to>`

  return promptText;
}

/**
 * System prompt for answering questions based on provided text
 */
export function askTextPrompt(text: string, question: string): string {
  return `Based on the following text, answer the question comprehensively and accurately.

Text:
"""
${text}
"""

Question: ${question}

Instructions:
- Answer the question based solely on the information provided in the text.
- If the text does not contain enough information to answer the question, say so clearly.
- Be concise but thorough in your response.
- Do not add information from outside the provided text.

Answer:`;
}

/**
 * System prompt for text highlighter
 */
export function highlighterPrompt(text: string, maxHighlights?: number): string {
  const maxLine = maxHighlights ? `Identify up to ${maxHighlights} of the most important segments in the text.` : `Identify the most important segments in the text.`;
  return `You are a text highlighter. ${maxLine}

Return your answer strictly as JSON with this exact structure:
{
  "highlights": [
    { "char_start_position": number, "char_end_position": number, "label": string, "description": string }
  ]
}

Rules:
- Use zero-based character indices based on the raw input string.
- "char_end_position" must be exclusive (i.e., the highlight covers characters in [char_start_position, char_end_position)).
- Ensure 0 <= char_start_position < char_end_position <= input length.
- Provide a short "label" (2–3 words) that identifies the type of information for each highlight. Example labels include "Problem Identification", "Order Information", "Root Cause Analysis", "Solution Implementation", and "Additional Support". Choose the best label based on context; create a concise label if none of the examples apply.
- Provide a concise human-readable description for why each span is important.
- Do not include any explanation outside the JSON.
 - IMPORTANT: When selecting spans, snap to whole words. Do not cut a word in the middle. If a span would split a word, expand to include the entire word. Also trim leading/trailing whitespace from spans.

Text:
"""
${text}
"""`;
}

/**
 * System prompt for meeting notes extraction
 */
export function meetingNotesPrompt(text: string): string {
  return `Extract structured meeting notes from the transcript below.

Return STRICT JSON that matches this TypeScript type exactly:
{
  "decisions": string[],
  "tasks": { "task": string, "owner": string | null, "estimate": string | null }[],
  "attendees": string[],
  "meeting_date": string | null,
  "updates": string[],
  "summary": string
}

Rules:
- Identify explicit decisions made.
- Extract actionable tasks; include owner names if present (e.g., Alice, Bob). If not present, omit the owner field.
- Include task estimates when mentioned (e.g., "2 weeks", "3 days", "quick task", "high priority"). If not present, omit the estimate field.
- Normalize dates to ISO 8601 (YYYY-MM-DD or YYYY-MM-DDTHH:mm) when possible; otherwise omit fields.
- Do not include any text outside JSON.
- Extract attendee names if mentioned; include distinct names only.
- Extract meeting date/time if present and normalize to ISO 8601 (YYYY-MM-DD or YYYY-MM-DDTHH:mm) as meeting_date.
 - Extract short status updates or progress statements as "updates".
 - Provide a concise 1–2 sentence "summary" of the meeting at the end.

Transcript:
"""
${text}
"""`;
}

/**
 * System prompt for task planning
 */
export function plannerPrompt(
  task: string,
  context?: string,
  maxSteps?: number,
  detailLevel?: 'basic' | 'detailed' | 'comprehensive',
  includeTimeEstimates?: boolean,
  includeRisks?: boolean,
  domain?: string
): string {
  const contextLine = context ? `\nContext/Constraints: ${context}` : '';
  const domainLine = domain ? `\nDomain/Field: ${domain}` : '';
  const stepsLine = maxSteps ? `\nMaximum number of steps: ${maxSteps}` : '';
  
  let detailInstructions = '';
  switch (detailLevel) {
    case 'basic':
      detailInstructions = 'Keep descriptions brief and high-level.';
      break;
    case 'comprehensive':
      detailInstructions = 'Provide comprehensive, detailed descriptions for each step with specific implementation details.';
      break;
    default: // 'detailed'
      detailInstructions = 'Provide clear, actionable descriptions with moderate detail.';
  }

  return `Create a well-structured, actionable plan to accomplish the following task.

Task: ${task}${contextLine}${domainLine}${stepsLine}

${detailInstructions}

Format the plan as follows:

# [Plan Title]

## Overview
[Brief description of what the plan accomplishes]

## Timeline
[Detailed timeline of the plan in a table markdown format]

${includeTimeEstimates ? '## Estimated Total Time\n[Total time estimate]\n\n' : ''}## Steps

[For each step, format as:]
### Step [number]: [Step Title]
${includeTimeEstimates ? '**Time Estimate:** [time]\n' : ''}**Priority:** [high/medium/low]
**Dependencies:** [List any prerequisite steps or "None"]

[Detailed description of what needs to be done]

${includeRisks ? '## Potential Risks\n\n[List potential risks or challenges with mitigation strategies]\n\n' : ''}## Success Criteria

[List clear criteria for successful completion]

## Key Assumptions

[List any assumptions made while creating this plan]

Rules:
- Number steps sequentially (Step 1, Step 2, etc.)
- Make each step actionable and specific
- Clearly indicate dependencies between steps
- ${includeTimeEstimates ? 'Provide realistic time estimates in human-readable format (e.g., "30 minutes", "2 hours")' : 'Focus on clear action items'}
- ${includeRisks ? 'Include mitigation strategies for each risk' : 'Focus on actionable steps'}
- Ensure the plan is practical and achievable
- Use clear, professional language
- Structure the plan for easy reading and understanding`;
}


/**
 * System prompt template for rewrite
 */
export type RewriteInstruction =
  | 'improve_text'
  | 'fix_spelling_grammar'
  | 'brainstorm_ideas'
  | 'shorten'
  | 'rewrite_with_tone'

export function rewritePrompt(
  text: string,
  instruction: RewriteInstruction,
  opts?: { maxLength?: number; tone?: RewriteTone }
): string {
  const maxLength = opts?.maxLength
  const tone = opts?.tone

  const instructionText = (() => {
    switch (instruction) {
      case 'improve_text':
        return 'Rewrite the text to improve clarity, grammar, and flow, preserving meaning and voice. Return only the rewritten text.'
      case 'fix_spelling_grammar':
        return 'Fix spelling, grammar, and punctuation without changing meaning or tone. Return only the corrected text.'
      case 'brainstorm_ideas':
        return 'Brainstorm 6-10 concise ideas based on the text. Use a bulleted list, each idea on its own line.'
      case 'shorten':
        return 'Rewrite the text to be significantly shorter (around 30-50% reduction) while preserving key points and tone. Return only the shortened version.'
      case 'rewrite_with_tone': {
        const t = (tone || '').toLowerCase()
        return `Rewrite the text in a ${t} tone while preserving meaning and intent. Return only the rewritten text.`
      }
      default:
        return 'Rewrite to improve clarity and readability while preserving meaning. Return only the rewritten text.'
    }
  })()

  const lengthInstruction = maxLength ? ` Limit the output to ${maxLength} words or less.` : ''

  return `Rewrite the text below according to the guidance.
${instructionText}${lengthInstruction}

Rules:
- Preserve the original meaning and key details.
- Keep the language and formatting unless the instruction says otherwise.
- Do not add explanations or meta commentary.
- Just return the rewritten text.

<text>
${text}
</text>
:`
}

/**
 * System prompt for creating an outline from text
 */
export function outlinePrompt(
  text: string,
  maxDepth?: number,
  style?: 'numbered' | 'bulleted' | 'mixed',
  includeIntro?: boolean,
  includeConclusion?: boolean
): string {
  const depth = maxDepth || 3;
  const outlineStyle = style || 'numbered';
  
  const styleInstructions = {
    numbered: 'Use numbered lists (1., 1.1., 1.1.1., etc.)',
    bulleted: 'Use bulleted lists with dashes (-) and indentation',
    mixed: 'Use numbered lists for main sections and bullets for subsections'
  };

  const introInstruction = includeIntro ? '\nInclude a brief introduction paragraph before the outline.' : '';
  const conclusionInstruction = includeConclusion ? '\nInclude a brief conclusion paragraph after the outline.' : '';

  return `Create a structured outline from the following text.

Guidelines:
- Extract the main topics and organize them hierarchically
- Create up to ${depth} levels of depth
- ${styleInstructions[outlineStyle]}
- Focus on key concepts, main ideas, and important details
- Maintain logical flow and coherent structure${introInstruction}${conclusionInstruction}

Return the outline in markdown code. Use headers notation # when making the outline output without any additional explanations. Add new lines.
Use proper spacing and indentation so markdown can render it correctly. Do not return in a code block just the markdown. Indentation should be 
also followed for subsections.

<example_output_markdown>
# Project Outline

## 1. Main Topic
- Overview of subject  
- Key importance  

### 1.1 Subtopic A
1. Definition  
2. Examples  

#### 1.1.1 Detailed Point
- Explanation of concept  
- Related terminology  

##### 1.1.1.1 Sub-detail
- Supporting fact A  
- Supporting fact B  

###### 1.1.1.1.1 Deep Detail
- Edge case 1  
- Edge case 2  

### 1.2 Subtopic B
- Applications  
- Challenges  

## 2. Another Main Topic
1. Category 1  
   - Item A  
   - Item B  
2. Category 2  
   - Item C  
   - Item D  

### 2.1 Subtopic C
- Nested insight  
   - Further breakdown  
      - Even more granular  
</example_output_markdown>

<text>
${text}
</text>
:`;
}

/**
 * System prompt template for PDF summarization
 */
export function pdfSummarizePrompt(text: string, maxLength?: number): string {
  const lengthInstruction = maxLength ? ` in ${maxLength} words or less.` : '';
  return `Summarize the following PDF document${lengthInstruction}
Provide a clear, concise summary that captures the main points, key findings, and important conclusions.
Just return the summary, no other text or explanation.

<document>
${text}
</document>
:`;
}

/**
 * System prompt template for PDF translation
 */
export function pdfTranslatePrompt(text: string, targetLanguage: string): string {
  return `Translate the following PDF document content to ${targetLanguage}.
Preserve the structure and formatting of the text as much as possible.
Just return the translated text, no other text or explanation.

Format the output in markdown.

<document>
${text}
</document>
:`;
}

/**
 * Create a prompt for converting search results to natural language
 */
export function webSearchResultsPrompt(searchResults: Array<{
  url: string;
  title: string;
  markdown: string;
}>): string {
  const resultsText = searchResults.map(result =>
    `Title: ${result.title}\nURL: ${result.url}\n\nSummary: ${result.markdown}`
  ).join('\n\n---\n\n');

  return `Please provide a comprehensive summary of the following web search results in markdown format. 
  The summary should be well-organized, informative, and easy to read. 
  Focus on the most relevant information and present it in a way that answers the user's original query effectively.
  Use only the data provided in the search results when doing the summary

Search Results:
${resultsText}

Please provide a detailed summary that:
1. Synthesizes the key information from multiple sources
2. Highlights the most relevant findings
3. Organizes the information logically
4. Is written in natural, conversational language
5. Helps the user understand what they were searching for
6. List links and urls to relevant sources when mentioned
7. Also list all links to sources at the end of the summary
8. Do not converse with the user

Summary:`;
}

/**
 * System prompt for synthetic data generation
 */
export function syntheticDataPrompt(
  prompt: string,
  count: number,
  format: 'json' | 'array',
  schema?: any
): string {
  const schemaInstruction = schema 
    ? `\n\nThe generated data MUST conform to this JSON schema:\n${JSON.stringify(schema, null, 2)}`
    : '';
    
  const formatInstruction = format === 'array' 
    ? `Generate an array of ${count} objects.`
    : count === 1 
      ? 'Generate a single JSON object.'
      : `Generate ${count} separate JSON objects, each on its own line.`;

  return `Generate synthetic data based on the following prompt. Return ONLY valid JSON with no additional text, explanations, or formatting.

Prompt: ${prompt}

Requirements:
- ${formatInstruction}
- Ensure all data is realistic and follows logical patterns
- Use varied but plausible values
- Include appropriate data types (strings, numbers, booleans, arrays, objects as needed)
- Make the data internally consistent${schemaInstruction}

CRITICAL: Return ONLY the JSON data. No markdown code blocks, no explanations, no additional text.`;
}