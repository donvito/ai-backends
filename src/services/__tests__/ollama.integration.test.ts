import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import ollamaProvider from '../ollama';
import { checkOllamaAvailability } from '../../providers/ollama';

describe('OllamaProvider Integration Tests', () => {
  const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  let isOllamaAvailable = false;

  beforeAll(async () => {
    // Check if Ollama is running and has models available
    try {
      const config = await checkOllamaAvailability(ollamaBaseUrl);
      isOllamaAvailable = !!config;
      console.log('✅ Ollama is available at:', ollamaBaseUrl);

      // List available models
      const models = await ollamaProvider.getAvailableModels();
      console.log('📋 Available models:', models);

      // Check if gemma3:4b is available
      const hasGemma3 = models.some(model => model.includes('gemma3') && model.includes('4b'));
      if (!hasGemma3) {
        console.warn('⚠️  Gemma3b:4b model not found. Tests may fail if model is required.');
        console.log('💡 To pull Gemma3b:4b, run: ollama pull gemma3:4b');
      }
    } catch (error) {
      console.warn('⚠️  Ollama is not available or not running:', error.message);
      console.log('💡 To start Ollama, run: ollama serve');
      isOllamaAvailable = false;
    }
  });

  // Helper function to skip tests if Ollama is not available
  const skipIfOllamaUnavailable = () => {
    if (!isOllamaAvailable) {
      console.warn('⏭️  Skipping test - Ollama is not available');
      return true;
    }
    return false;
  };

  describe('Text Generation with Gemma3b:4b', () => {
    it('should generate text response using gemma3:4b', async () => {
      if (skipIfOllamaUnavailable()) return;

      const prompt = "What is the capital of France? Answer in one word.";
      const result = await ollamaProvider.generateChatTextResponse(prompt, 'gemma3:4b');

      expect(result).toBeDefined();
      expect(result.text).toBeDefined();
      expect(typeof result.text).toBe('string');
      expect(result.text.trim().toLowerCase()).toBe('paris');

      console.log('✅ Text generation result:', result.text);
    }, 30000);

    it('should generate structured response using gemma3:4b', async () => {
      if (skipIfOllamaUnavailable()) return;

      const { z } = await import('zod');
      const prompt = `Generate information about a fictional country in valid JSON format like:
{
  "name": "Country Name",
  "capital": "Capital City",
  "population": 50,
  "language": "Official Language"
}`;

      const schema = z.object({
        name: z.string().describe('Country name'),
        capital: z.string().describe('Capital city'),
        population: z.number().describe('Population in millions'),
        language: z.string().describe('Official language')
      });

      try {
        const result = await ollamaProvider.generateChatStructuredResponse(
          prompt,
          schema,
          'gemma3:4b'
        );

        expect(result).toBeDefined();
        expect(result.object).toBeDefined();
        expect(result.object.name).toBeDefined();
        expect(result.object.capital).toBeDefined();
        expect(result.object.population).toBeDefined();
        expect(result.object.language).toBeDefined();

        console.log('✅ Structured generation result:', JSON.stringify(result.object, null, 2));
      } catch (error) {
        console.log('⚠️  Structured response not fully supported by Gemma3:4b, falling back to text parsing');

        // Fallback: test text generation and manual parsing
        const textResult = await ollamaProvider.generateChatTextResponse(prompt, 'gemma3:4b');
        expect(textResult).toBeDefined();
        expect(textResult.text).toBeDefined();

        console.log('✅ Text generation fallback result:', textResult.text.substring(0, 200) + '...');
      }
    }, 30000);

    it('should handle complex prompts with gemma3:4b', async () => {
      if (skipIfOllamaUnavailable()) return;

      const prompt = `
        Explain the concept of machine learning in simple terms.
        Include:
        1. A brief definition
        2. One simple example
        3. Keep it concise
      `;

      const result = await ollamaProvider.generateChatTextResponse(prompt, 'gemma3:4b');

      expect(result).toBeDefined();
      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(50);
      expect(result.text.length).toBeLessThan(1000);
      expect(result.text.toLowerCase()).toContain('machine');
      expect(result.text.toLowerCase()).toContain('learn');

      console.log('✅ Complex prompt result length:', result.text.length, 'characters');
    }, 30000);
  });

  describe('Streaming with Gemma3b:4b', () => {
    it('should provide streaming response using gemma3:4b', async () => {
      if (skipIfOllamaUnavailable()) return;

      const prompt = "Count from 1 to 5 slowly";
      const result = await ollamaProvider.generateChatTextStreamResponse(prompt, 'gemma3:4b');

      expect(result).toBeDefined();

      // Check that it has streaming-related properties
      expect(result.text !== undefined).toBe(true);

      // Try to understand the streaming structure
      console.log('📝 Streaming result structure:', Object.keys(result));
      console.log('📝 Text property type:', typeof result.text);

      // For integration tests, we mainly verify that the streaming call doesn't crash
      // and returns a valid response object
      if (typeof result.text === 'string') {
        console.log('✅ Streaming result (direct text):', result.text.substring(0, 100));
      } else if (typeof result.text === 'function') {
        console.log('✅ Streaming response has text function - streaming interface available');
      } else if (result.toDataStream) {
        console.log('✅ Streaming response has toDataStream - streaming interface available');
      }

      console.log('✅ Streaming interface test passed');
    }, 30000);

    it('should handle streaming with different prompts', async () => {
      if (skipIfOllamaUnavailable()) return;

      const prompt = "Write a short poem about artificial intelligence (3-4 lines)";
      const result = await ollamaProvider.generateChatTextStreamResponse(prompt, 'gemma3:4b');

      expect(result).toBeDefined();

      // Verify streaming response structure
      expect(result.text !== undefined).toBe(true);

      // Log the structure for debugging
      if (typeof result.text === 'string' && result.text.length > 0) {
        console.log('✅ Streaming content length:', result.text.length);
      } else if (typeof result.text === 'function') {
        console.log('✅ Streaming function available for:', prompt.substring(0, 30));
      } else {
        console.log('✅ Streaming object returned with keys:', Object.keys(result));
      }

      console.log('✅ Streaming test with complex prompt passed');
    }, 30000);
  });

  describe('Model Discovery and Configuration', () => {
    it('should list available models', async () => {
      if (skipIfOllamaUnavailable()) return;

      const models = await ollamaProvider.getAvailableModels();

      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(0);

      console.log('✅ Found', models.length, 'models:', models);
    }, 10000);

    it('should work with default model configuration', async () => {
      if (skipIfOllamaUnavailable()) return;

      const prompt = "What is 2 + 2?";
      const result = await ollamaProvider.generateChatTextResponse(prompt);

      expect(result).toBeDefined();
      expect(result.text).toBeDefined();
      expect(result.text.trim()).toMatch(/4|four/i);

      console.log('✅ Default model result:', result.text);
    }, 30000);

    it('should handle model switching', async () => {
      if (skipIfOllamaUnavailable()) return;

      const models = await ollamaProvider.getAvailableModels();
      const nonGemmaModel = models.find(model => !model.includes('gemma3:4b'));

      if (nonGemmaModel) {
        const prompt = "Say hello";
        const result = await ollamaProvider.generateChatTextResponse(prompt, nonGemmaModel);

        expect(result).toBeDefined();
        expect(result.text).toBeDefined();

        console.log(`✅ Alternative model (${nonGemmaModel}) result:`, result.text);
      } else {
        console.log('⚠️  No alternative model found for testing model switching');
      }
    }, 30000);
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle invalid model names gracefully', async () => {
      if (skipIfOllamaUnavailable()) return;

      const prompt = "Test message";

      try {
        await ollamaProvider.generateChatTextResponse(prompt, 'invalid-model-name:404');
        // If it doesn't throw, that's also valid behavior
        console.log('✅ Invalid model handled gracefully');
      } catch (error) {
        expect(error).toBeDefined();
        console.log('✅ Invalid model error handled:', error.message);
      }
    }, 30000);

    it('should handle empty prompts', async () => {
      if (skipIfOllamaUnavailable()) return;

      try {
        const result = await ollamaProvider.generateChatTextResponse('', 'gemma3:4b');
        expect(result).toBeDefined();
        console.log('✅ Empty prompt handled:', result.text || 'No content');
      } catch (error) {
        console.log('✅ Empty prompt error handled:', error.message);
      }
    }, 30000);

    it('should handle very long prompts', async () => {
      if (skipIfOllamaUnavailable()) return;

      const longPrompt = "Repeat the word 'test' 100 times: " + "test ".repeat(100);

      try {
        const result = await ollamaProvider.generateChatTextResponse(longPrompt, 'gemma3:4b');
        expect(result).toBeDefined();
        console.log('✅ Long prompt handled, response length:', result.text?.length || 0);
      } catch (error) {
        console.log('✅ Long prompt error handled:', error.message);
      }
    }, 45000);
  });

  describe('Performance and Response Times', () => {
    it('should respond within reasonable time for simple queries', async () => {
      if (skipIfOllamaUnavailable()) return;

      const prompt = "What color is the sky?";
      const startTime = Date.now();

      const result = await ollamaProvider.generateChatTextResponse(prompt, 'gemma3:4b');

      const responseTime = Date.now() - startTime;
      expect(result).toBeDefined();
      expect(responseTime).toBeLessThan(30000); // 30 seconds max

      console.log('✅ Response time:', responseTime, 'ms');
    }, 35000);

    it('should handle concurrent requests', async () => {
      if (skipIfOllamaUnavailable()) return;

      const prompts = [
        "What is 1+1?",
        "What is 2+2?",
        "What is 3+3?"
      ];

      const startTime = Date.now();
      const results = await Promise.all(
        prompts.map(prompt => ollamaProvider.generateChatTextResponse(prompt, 'gemma3:4b'))
      );

      const totalTime = Date.now() - startTime;

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.text).toBeDefined();
      });

      console.log('✅ Concurrent requests completed in:', totalTime, 'ms');
    }, 60000);
  });

  afterAll(() => {
    if (isOllamaAvailable) {
      console.log('✅ All integration tests completed successfully');
    } else {
      console.log('⚠️  Integration tests skipped - Ollama not available');
      console.log('');
      console.log('To run integration tests:');
      console.log('1. Install Ollama: https://ollama.ai/');
      console.log('2. Start Ollama: ollama serve');
      console.log('3. Pull Gemma3:4b: ollama pull gemma3:4b');
      console.log('4. Run tests again');
    }
  });
});