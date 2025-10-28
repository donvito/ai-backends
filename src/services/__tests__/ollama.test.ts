import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import ollamaProvider, { OllamaProvider } from '../ollama';
import { ollamaConfig } from '../../config/services';

// Mock the AI SDK functions
vi.mock('ai', () => ({
  generateObject: vi.fn(),
  generateText: vi.fn(),
  streamText: vi.fn(),
}));

// Mock the config
vi.mock('../../config/services', () => ({
  ollamaConfig: {
    baseURL: 'http://localhost:11434',
    chatModel: 'gemma3:4b',
  },
}));

// Mock the describeImagePrompt
vi.mock('../utils/prompts', () => ({
  describeImagePrompt: () => 'Describe this image in detail.',
}));

// Mock the OpenAI compatible client
vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: vi.fn(() => vi.fn((model: string) => ({ model }))),
}));

import { generateObject, generateText, streamText } from 'ai';

describe('OllamaProvider', () => {
  let provider: OllamaProvider;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    provider = new OllamaProvider();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe('generateChatStructuredResponse', () => {
    it('should generate structured response using gemma3:4b model by default', async () => {
      const mockSchema = { type: 'object' };
      const mockResult = { object: { test: 'data' } };

      (generateObject as any).mockResolvedValue(mockResult);

      const result = await provider.generateChatStructuredResponse(
        'Test prompt',
        mockSchema as any
      );

      expect(generateObject).toHaveBeenCalledWith({
        model: { model: 'gemma3:4b' },
        prompt: 'Test prompt',
        schema: mockSchema,
        temperature: 0,
      });
      expect(result).toEqual(mockResult);
    });

    it('should use specified model when provided', async () => {
      const mockSchema = { type: 'object' };
      const mockResult = { object: { test: 'data' } };

      (generateObject as any).mockResolvedValue(mockResult);

      const result = await provider.generateChatStructuredResponse(
        'Test prompt',
        mockSchema as any,
        'custom-model'
      );

      expect(generateObject).toHaveBeenCalledWith({
        model: { model: 'custom-model' },
        prompt: 'Test prompt',
        schema: mockSchema,
        temperature: 0,
      });
      expect(result).toEqual(mockResult);
    });

    it('should handle temperature parameter', async () => {
      const mockSchema = { type: 'object' };
      const mockResult = { object: { test: 'data' } };

      (generateObject as any).mockResolvedValue(mockResult);

      await provider.generateChatStructuredResponse(
        'Test prompt',
        mockSchema as any,
        undefined,
        0.7
      );

      expect(generateObject).toHaveBeenCalledWith({
        model: { model: 'gemma3:4b' },
        prompt: 'Test prompt',
        schema: mockSchema,
        temperature: 0.7,
      });
    });

    it('should handle errors gracefully', async () => {
      const mockSchema = { type: 'object' };
      const mockError = new Error('API Error');

      (generateObject as any).mockRejectedValue(mockError);

      await expect(
        provider.generateChatStructuredResponse('Test prompt', mockSchema as any)
      ).rejects.toThrow('Ollama structured response error: Error: API Error');
    });
  });

  describe('generateChatTextResponse', () => {
    it('should generate text response using gemma3:4b model by default', async () => {
      const mockResult = { text: 'Generated response' };

      (generateText as any).mockResolvedValue(mockResult);

      const result = await provider.generateChatTextResponse('Test prompt');

      expect(generateText).toHaveBeenCalledWith({
        model: { model: 'gemma3:4b' },
        prompt: 'Test prompt',
      });
      expect(result).toEqual(mockResult);
    });

    it('should use specified model when provided', async () => {
      const mockResult = { text: 'Generated response' };

      (generateText as any).mockResolvedValue(mockResult);

      const result = await provider.generateChatTextResponse(
        'Test prompt',
        'custom-model'
      );

      expect(generateText).toHaveBeenCalledWith({
        model: { model: 'custom-model' },
        prompt: 'Test prompt',
      });
      expect(result).toEqual(mockResult);
    });

    it('should handle errors gracefully', async () => {
      const mockError = new Error('API Error');

      (generateText as any).mockRejectedValue(mockError);

      await expect(
        provider.generateChatTextResponse('Test prompt')
      ).rejects.toThrow('Ollama text response error: Error: API Error');
    });
  });

  describe('generateChatTextStreamResponse', () => {
    it('should generate streaming response using chat model by default', async () => {
      const mockStream = { toDataStream: vi.fn() };

      (streamText as any).mockReturnValue(mockStream);

      const result = await provider.generateChatTextStreamResponse('Test prompt');

      expect(streamText).toHaveBeenCalledWith({
        model: { model: 'gemma3:4b' },
        prompt: 'Test prompt',
      });
      expect(result).toEqual(mockStream);
    });

    it('should use specified model when provided', async () => {
      const mockStream = { toDataStream: vi.fn() };

      (streamText as any).mockReturnValue(mockStream);

      const result = await provider.generateChatTextStreamResponse(
        'Test prompt',
        'custom-model'
      );

      expect(streamText).toHaveBeenCalledWith({
        model: { model: 'custom-model' },
        prompt: 'Test prompt',
      });
      expect(result).toEqual(mockStream);
    });

    it('should handle errors gracefully', async () => {
      const mockError = new Error('Stream API Error');

      (streamText as any).mockImplementation(() => {
        throw mockError;
      });

      await expect(
        provider.generateChatTextStreamResponse('Test prompt')
      ).rejects.toThrow('Ollama streaming response error: Error: Stream API Error');
    });
  });

  describe('getAvailableModels', () => {
    it('should return list of available models', async () => {
      const mockModelsResponse = {
        models: [
          { name: 'gemma3:4b', modified_at: '2024-01-01T00:00:00Z', size: 4700000000, digest: 'test-digest' },
          { name: 'llama3.2:latest', modified_at: '2024-01-01T00:00:00Z', size: 4900000000, digest: 'test-digest-2' },
          { name: 'custom-model:1.0', modified_at: '2024-01-01T00:00:00Z', size: 3000000000, digest: 'test-digest-3' }
        ]
      };

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockModelsResponse)
      });

      const result = await provider.getAvailableModels();

      expect(fetch).toHaveBeenCalledWith(`${ollamaConfig.baseURL}/api/tags`);
      expect(result).toEqual(['gemma3:4b', 'llama3.2:latest', 'custom-model:1.0']);
    });

    it('should return empty array when fetch fails', async () => {
      (fetch as any).mockRejectedValueOnce(new Error('Network error'));

      const result = await provider.getAvailableModels();

      expect(result).toEqual([]);
    });

    it('should return empty array when response is not ok', async () => {
      (fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500
      });

      const result = await provider.getAvailableModels();

      expect(result).toEqual([]);
    });

    it('should handle empty models list', async () => {
      const mockModelsResponse = { models: [] };

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockModelsResponse)
      });

      const result = await provider.getAvailableModels();

      expect(result).toEqual([]);
    });

    it('should handle malformed response', async () => {
      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ invalid: 'response' })
      });

      const result = await provider.getAvailableModels();

      expect(result).toEqual([]);
    });
  });

  describe('describeImage', () => {
    it('should describe image using llama3.2:latest model by default', async () => {
      const mockImages = ['data:image/png;base64,iVBORw0KGgoAAAANS...'];
      const mockResponse = {
        model: 'llama3.2:latest',
        created_at: '2024-01-01T00:00:00Z',
        message: {
          role: 'assistant',
          content: 'This is an image description'
        },
        done: true,
        total_duration: 1000000,
        load_duration: 500000,
        prompt_eval_count: 10,
        prompt_eval_duration: 300000,
        eval_count: 15,
        eval_duration: 700000
      };

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await provider.describeImage(mockImages);

      expect(fetch).toHaveBeenCalledWith(`${ollamaConfig.baseURL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: expect.stringContaining('llama3.2:latest'),
      });
      expect(result).toEqual({
        model: 'llama3.2:latest',
        created_at: '2024-01-01T00:00:00Z',
        message: {
          role: 'assistant',
          content: 'This is an image description'
        },
        done_reason: 'stop',
        done: true,
        total_duration: 1000000,
        load_duration: 500000,
        prompt_eval_count: 10,
        prompt_eval_duration: 300000,
        eval_count: 15,
        eval_duration: 700000
      });
    });

    it('should use specified model when provided', async () => {
      const mockImages = ['data:image/png;base64,iVBORw0KGgoAAAANS...'];
      const mockResponse = {
        model: 'custom-model',
        created_at: '2024-01-01T00:00:00Z',
        message: {
          role: 'assistant',
          content: 'This is an image description'
        },
        done: true
      };

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await provider.describeImage(mockImages, 'custom-model');

      expect(fetch).toHaveBeenCalledWith(`${ollamaConfig.baseURL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: expect.stringContaining('custom-model'),
      });
      expect(result.model).toBe('custom-model');
    });

    it('should handle streaming parameter', async () => {
      const mockImages = ['data:image/png;base64,iVBORw0KGgoAAAANS...'];
      const mockResponse = {
        model: 'llama3.2:latest',
        created_at: '2024-01-01T00:00:00Z',
        message: {
          role: 'assistant',
          content: 'This is an image description'
        },
        done: true
      };

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      await provider.describeImage(mockImages, undefined, true);

      expect(fetch).toHaveBeenCalledWith(`${ollamaConfig.baseURL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: expect.stringContaining('"stream":true'),
      });
    });

    it('should handle temperature parameter', async () => {
      const mockImages = ['data:image/png;base64,iVBORw0KGgoAAAANS...'];
      const mockResponse = {
        model: 'llama3.2:latest',
        created_at: '2024-01-01T00:00:00Z',
        message: {
          role: 'assistant',
          content: 'This is an image description'
        },
        done: true
      };

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      await provider.describeImage(mockImages, undefined, false, 0.8);

      expect(fetch).toHaveBeenCalledWith(`${ollamaConfig.baseURL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: expect.stringContaining('"temperature":0.8'),
      });
    });

    it('should handle API errors gracefully', async () => {
      const mockImages = ['data:image/png;base64,iVBORw0KGgoAAAANS...'];

      (fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () => Promise.resolve('Invalid image format')
      });

      await expect(provider.describeImage(mockImages))
        .rejects.toThrow('Ollama API error: 400 Bad Request - Invalid image format');
    });

    it('should handle network errors', async () => {
      const mockImages = ['data:image/png;base64,iVBORw0KGgoAAAANS...'];

      (fetch as any).mockRejectedValueOnce(new Error('Network error'));

      await expect(provider.describeImage(mockImages))
        .rejects.toThrow('Network error');
    });

    it('should handle responses without metrics', async () => {
      const mockImages = ['data:image/png;base64,iVBORw0KGgoAAAANS...'];
      const mockResponse = {
        model: 'llama3.2:latest',
        created_at: '2024-01-01T00:00:00Z',
        message: {
          role: 'assistant',
          content: 'This is an image description'
        },
        done: true
      };

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await provider.describeImage(mockImages);

      expect(result).toEqual({
        model: 'llama3.2:latest',
        created_at: '2024-01-01T00:00:00Z',
        message: {
          role: 'assistant',
          content: 'This is an image description'
        },
        done_reason: 'stop',
        done: true,
        total_duration: undefined,
        load_duration: undefined,
        prompt_eval_count: undefined,
        prompt_eval_duration: undefined,
        eval_count: undefined,
        eval_duration: undefined
      });
    });
  });

  describe('provider properties', () => {
    it('should have correct provider name', () => {
      expect(provider.name).toBe('ollama');
    });
  });

  describe('integration scenarios', () => {
    it('should work with gemma3:4b model for text generation', async () => {
      const mockResult = { text: 'Response from Gemma3:4b' };

      (generateText as any).mockResolvedValue(mockResult);

      const result = await provider.generateChatTextResponse('Test with Gemma3:4b', 'gemma3:4b');

      expect(generateText).toHaveBeenCalledWith({
        model: { model: 'gemma3:4b' },
        prompt: 'Test with Gemma3:4b',
      });
      expect(result.text).toBe('Response from Gemma3:4b');
    });

    it('should work with gemma3:4b model for structured responses', async () => {
      const mockSchema = { type: 'object', properties: { name: { type: 'string' } } };
      const mockResult = { object: { name: 'Gemma3 Response' } };

      (generateObject as any).mockResolvedValue(mockResult);

      const result = await provider.generateChatStructuredResponse(
        'Generate structured data',
        mockSchema as any,
        'gemma3:4b'
      );

      expect(generateObject).toHaveBeenCalledWith({
        model: { model: 'gemma3:4b' },
        prompt: 'Generate structured data',
        schema: mockSchema,
        temperature: 0,
      });
      expect(result.object).toEqual({ name: 'Gemma3 Response' });
    });

    it('should work with gemma3:4b model for streaming', async () => {
      const mockStream = {
        toDataStream: vi.fn(),
        text: vi.fn()
      };

      (streamText as any).mockReturnValue(mockStream);

      const result = await provider.generateChatTextStreamResponse('Stream with Gemma3:4b', 'gemma3:4b');

      expect(streamText).toHaveBeenCalledWith({
        model: { model: 'gemma3:4b' },
        prompt: 'Stream with Gemma3:4b',
      });
      expect(result).toBe(mockStream);
    });
  });
});