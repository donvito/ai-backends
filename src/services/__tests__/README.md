# Ollama Provider Tests

This directory contains comprehensive tests for the Ollama AI provider implementation.

## Test Files

- **`ollama.test.ts`** - Unit tests with mocked dependencies (fast, reliable)
- **`ollama.integration.test.ts`** - Integration tests that call real Ollama API (requires Ollama running)

## Test Coverage

The test suite covers all major functionality of the OllamaProvider class:

### ✅ Core Methods
- **`generateChatStructuredResponse`** - Tests structured data generation with Zod schemas using gemma3:4b model
- **`generateChatTextResponse`** - Tests plain text generation using gemma3:4b model
- **`generateChatTextStreamResponse`** - Tests streaming text responses using gemma3:4b model
- **`getAvailableModels`** - Tests model listing functionality
- **`describeImage`** - Tests image description capabilities (using llama3.2:latest for vision)

### ✅ Test Scenarios
- **Success Cases**: Valid API responses, successful model generation
- **Error Cases**: Network errors, API errors, invalid responses
- **Edge Cases**: Empty model lists, malformed responses
- **Configuration**: Environment variable handling, model selection
- **Streaming**: Stream handling and response parsing
- **Integration**: Full workflow tests with gemma3:4b model

### ✅ Model-Specific Testing
- **Gemma3:4b**: Primary model for text and structured responses
- **Llama3.2:latest**: Default model for image description tasks
- **Custom Models**: Testing with user-specified models

## Running Tests

### Unit Tests (Mocked - Fast)
```bash
# Run unit tests only (recommended for CI/development)
npx vitest run src/services/__tests__/ollama.test.ts

# Run tests in watch mode
npx vitest src/services/__tests__/ollama.test.ts

# Run with coverage
npx vitest run --coverage src/services/__tests__/ollama.test.ts
```

### Integration Tests (Real API - Requires Ollama)
```bash
# Run integration tests only (requires Ollama running)
npx vitest run src/services/__tests__/ollama.integration.test.ts

# Run both unit and integration tests
npx vitest run src/services/__tests__/ollama.test.ts src/services/__tests__/ollama.integration.test.ts

# Run all tests in watch mode
npx vitest src/services/__tests__/ollama.test.ts src/services/__tests__/ollama.integration.test.ts
```

### Prerequisites for Integration Tests

1. **Install Ollama**: https://ollama.ai/
2. **Start Ollama**:
   ```bash
   ollama serve
   ```
3. **Pull Gemma3:4b Model**:
   ```bash
   ollama pull gemma3:4b
   ```
4. **Verify Installation**:
   ```bash
   ollama list
   # Should show gemma3:4b in the output
   ```

### Environment Variables (Optional)
```bash
# Custom Ollama URL (defaults to http://localhost:11434)
export OLLAMA_BASE_URL=http://localhost:11434
```

## Test Features

- **Comprehensive Mocking**: Mocks AI SDK functions, fetch API, and configuration
- **Error Handling**: Tests both graceful error handling and error propagation
- **Model Validation**: Ensures correct model selection and usage
- **Streaming Support**: Tests real-time streaming capabilities
- **Image Processing**: Tests image description workflow (skipped in some scenarios as requested)

## Test Features

### Unit Tests (`ollama.test.ts`)
- **Comprehensive Mocking**: Mocks AI SDK functions, fetch API, and configuration
- **Fast Execution**: No external dependencies, runs in milliseconds
- **Error Handling**: Tests both graceful error handling and error propagation
- **Model Validation**: Ensures correct model selection and usage
- **Streaming Support**: Tests real-time streaming capabilities

### Integration Tests (`ollama.integration.test.ts`)
- **Real API Calls**: Makes actual HTTP requests to Ollama
- **Live Model Testing**: Tests with real Gemma3:4b model responses
- **Performance Testing**: Measures response times and concurrent handling
- **Error Handling**: Tests real network errors and model availability
- **Smart Skipping**: Automatically skips tests if Ollama is not running

## Test Architecture

The tests follow the existing project patterns:
- Uses **Vitest** as the test runner
- **Unit Tests**: Mocks external dependencies for speed and reliability
- **Integration Tests**: Connects to real Ollama instance for validation
- Tests both happy paths and error scenarios
- Validates request payloads and response parsing
- Ensures proper error handling and logging

## Integration Test Features

- **Auto-Detection**: Checks if Ollama is running before executing tests
- **Model Discovery**: Lists available models and validates Gemma3:4b presence
- **Performance Metrics**: Measures response times and concurrent request handling
- **Graceful Degradation**: Provides helpful setup instructions if Ollama is unavailable
- **Comprehensive Coverage**: Tests text generation, structured responses, and streaming

## Notes

- **Unit Tests**: Use gemma3:4b as the default model for text generation (mocked)
- **Integration Tests**: Require actual Ollama installation and Gemma3:4b model
- **Image Description**: Skipped in integration tests as requested (tested in unit tests only)
- **Console Output**: Integration tests show real model responses and performance metrics
- **Network Dependency**: Integration tests require internet for initial model download