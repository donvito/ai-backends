import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const wordCounterTool = createTool({
  id: 'word_counter',
  description: 'Count the exact number of words, characters, sentences, and paragraphs in text. Use this when you need precise text statistics.',
  inputSchema: z.object({
    text: z.string().describe('Text to analyze for word count and statistics')
  }),
  execute: async ({ context }: { context: { text: string } }) => {
    const { text } = context;

    // Actual computation the LLM can't do precisely
    const wordCount = text.trim().split(/\s+/).filter(word => word.length > 0).length;
    const charCount = text.length;
    const charCountNoSpaces = text.replace(/\s/g, '').length;
    const sentenceCount = text.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
    const paragraphCount = text.split(/\n\n+/).filter(p => p.trim().length > 0).length;
    const avgWordLength = charCountNoSpaces / wordCount || 0;

    return {
      statistics: {
        words: wordCount,
        characters: charCount,
        charactersNoSpaces: charCountNoSpaces,
        sentences: sentenceCount,
        paragraphs: paragraphCount,
        averageWordLength: Math.round(avgWordLength * 10) / 10
      }
    };
  }
});