# Ollama Provider Tests

This directory contains comprehensive tests for the Ollama AI provider implementation.

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

```bash
# Run all Ollama provider tests
npx vitest run src/services/__tests__/ollama.test.ts

# Run tests in watch mode
npx vitest src/services/__tests__/ollama.test.ts

# Run with coverage
npx vitest run --coverage src/services/__tests__/ollama.test.ts
```

## Test Features

- **Comprehensive Mocking**: Mocks AI SDK functions, fetch API, and configuration
- **Error Handling**: Tests both graceful error handling and error propagation
- **Model Validation**: Ensures correct model selection and usage
- **Streaming Support**: Tests real-time streaming capabilities
- **Image Processing**: Tests image description workflow (skipped in some scenarios as requested)

## Test Architecture

The tests follow the existing project patterns:
- Uses **Vitest** as the test runner
- Mocks external dependencies (AI SDK, fetch API)
- Tests both happy paths and error scenarios
- Validates request payloads and response parsing
- Ensures proper error handling and logging

## Notes

- Tests use gemma3:4b as the default model for text generation
- Image description tests use llama3.2:latest as it supports vision
- All network requests are mocked to ensure tests are reliable and fast
- Console output during tests is expected (logs from the actual implementation)