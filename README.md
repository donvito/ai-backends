# AI Backends

AIBackends is an API server that you can use to integrate AI into your applications. You can run it locally or self-host it.

The project supports running open source models locally with Ollama and LM Studio. It also supports OpenRouter, OpenAI and Anthropic.

## Why AI Backends?

The purpose of this project is to make common AI use cases easily accessible to non-coders who want to add AI features to their applications. AIBackends have been tested with popular AI app builder tools like [Bolt.new](https://bolt.new), [v0](https://v0.dev) and [Lovable](https://lovable.dev). You can also use it with [Warp](https://warp.dev), [Cursor](https://cursor.com/), [Claude Code](https://www.anthropic.com/claude-code), [Windsurf](https://windsurf.com/) or [AmpCode](https://ampcode.com/).

Since APIs are ready to use, you don't need to understand prompt engineering. Just prompt the API documentation and you are good to go. For those who want use with online app builders, you need to host AIBackends on your own server. I have tested in Railway and it is a good option.

![AI Backends](images/run-aibackends.png)

## Available APIs

### Text Processing
| Endpoint | Description |
|----------|-------------|
| **/api/summarize** | Summarize long text content into concise, key points |
| **/api/translate** | Translate text between different languages |
| **/api/sentiment** | Analyze the emotional tone and sentiment of text |
| **/api/keywords** | Extract important keywords and phrases from text |
| **/api/email-reply** | Generate professional email responses based on context |
| **/api/ask-text** | Ask questions about provided text and get intelligent answers |
| **/api/highlighter** | Identify and highlight the most important information in text |
| **/api/meeting-notes** | Transform meeting notes into structured summaries |
| **/api/project-planner** | Create detailed project plans with steps, timelines, and considerations |
| **/api/rewrite** | Rewrite text with instructions (improve, shorten, fix grammar, tone) |
| **/api/compose** | Compose short-form text given a topic |
| **/api/pdf-summarizer** | Extract and summarize content from PDF documents with AI |
| **/api/web-search** | Perform web searches and get AI-powered summaries of results |

### Image Processing

| Endpoint | Description |
|----------|-------------|
| **/api/describe-image** | Describe an image (work in progress) |

More to come...check swagger docs for updated endpoints.

## Supported LLM Providers

| Provider | Description | Status |
|----------|-------------|--------|
| [Ollama](https://ollama.ai/) | Local models (self-hosted) |  Available |
| [LM Studio](https://lmstudio.ai/) | Local models via OpenAI-compatible API (self-hosted) | Available |
| [OpenAI](https://openai.com/) | GPT models | Available |
| [Anthropic](https://www.anthropic.com/) | Claude models | Available |
| [OpenRouter](https://openrouter.ai/) | Open source and private models |  Available |
| [Vercel AI Gateway](https://vercel.com/ai-gateway) | Open source and private models | Available |
| [LlamaCpp](https://github.com/ggml-org/llama.cpp) | Local models via llama.cpp server (self-hosted) | Available |
| [Google Gemini](https://ai.google.dev/) | Gemini models via OpenAI-compatible interface | Available |
| [Baseten](https://baseten.co/) | Cloud-hosted ML models with OpenAI-compatible API | Available |


## Run the project

You can configure API keys for different AI providers in the `.env` file.

```bash
# Install dependencies
bun install

# Run in development mode and bypasses access token check in the API, do run using this command in production. Always use production when deploying so access token is required. NODE_ENV=development is set in package.json when you run in development mode.
bun run dev

# Build for production
bun run build
```

## Run with Docker

### Using a single container (recommended)
Right now this only works with OpenAI, Anthropic and OpenRouter since the docker container
- Build the image:
```bash
docker build -t ai-backends .
```
- Run the container in the background (loads variables from your .env):
```bash
docker run --env-file .env -p 3000:3000 ai-backends &
```

Set this in your .env file if you're using for development with Ollama in your local machine.
```env
NODE_ENV=development
OLLAMA_BASE_URL=http://host.docker.internal:11434
```

If deploying to production, set this in your .env file:
```env
NODE_ENV=production
DEFAULT_ACCESS_TOKEN=your-secret-api-key
OPENAI_API_KEY=your-openai-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key
OPENROUTER_API_KEY=your-openrouter-api-key
GOOGLE_AI_API_KEY=your-google-ai-api-key
```
You need to configure at least one provider api key. Otherwise, the app will not start.

### Using Docker Compose
This will run AI Backends API server and Ollama containers using Docker
- Ensure you have a .env configured as described in "Set up environment variables" below. You must set DEFAULT_ACCESS_TOKEN and at least one provider credential (or enable a local provider such as Ollama).
- Start all services:
```bash
docker compose --env-file .env up -d --build
```

### Adding more models to Ollama container
To add more models, you can edit the ollama service command in docker-compose.yml.


For example, to add gemma3:4b, llama3.2:latest and llama3.2-vision:11b models, you can add the following to the ollama service command:
```yml
command: -c "ollama serve & sleep 5 && ollama pull gemma3:270m && ollama pull gemma3:4b && ollama pull llama3.2:latest && ollama pull llama3.2-vision:11b && wait"
```
You might need to adjust the timeout to give enough time for the models to be pulled.

```yml
 healthcheck:      
      timeout: 120s //increase this if you're adding more models
```

  Useful commands:
  - View logs: docker compose logs -f app
  - Stop/remove: docker compose down

Notes
- With Docker Compose, the app container can reach the Ollama service over the compose network (service name: ollama, port: 11434).
- You can customize which models are pulled by editing the ollama service command in docker-compose.yml.

## Set up environment variables

Create a `.env` file in the root directory of this project and configure your preferred AI services:

```env
# General Configuration
DEFAULT_ACCESS_TOKEN=your-secret-api-key

# CORS Configuration
CORS_ALLOWED_ORIGINS=http://localhost:3000,https://example.com,https://*.example.com

# OpenAI Configuration
OPENAI_API_KEY=your-openai-api-key

# Anthropic Configuration
ANTHROPIC_API_KEY=your-anthropic-api-key

# Google Gemini Configuration
GOOGLE_AI_API_KEY=your-google-ai-api-key
GEMINI_MODEL=gemini-2.5-flash-lite

# Ollama Configuration
OLLAMA_ENABLED=true
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_TIMEOUT=30000

# You can change OLLAMA_BASE_URL to use a remote Ollama instance
 
# LlamaCpp Configuration
LLAMACPP_BASE_URL=http://localhost:8080

# You can change LLAMACPP_BASE_URL to use a remote LlamaCpp instance
 
# LM Studio Configuration 
LMSTUDIO_ENABLED=true
LMSTUDIO_BASE_URL=http://localhost:1234

# You can change LMSTUDIO_BASE_URL to use a remote LM Studio instance

# OpenRouter Configuration 
OPENROUTER_API_KEY=your-openrouter-api-key

# Baseten Configuration
BASETEN_API_KEY=your-baseten-api-key
BASETEN_BASE_URL=https://inference.baseten.co/v1
```

### Google Gemini Setup

To use Google Gemini models:

1. Get your API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Set `GOOGLE_AI_API_KEY` in your `.env` file
3. Optionally configure `GEMINI_MODEL` (defaults to `gemini-2.5-flash-lite`)

Available Gemini models:
- `gemini-2.5-flash-lite` (default)
- `gemini-2.5-flash`
- `gemini-2.5-pro`
- `gemini-pro-vision`

**Note**: The Gemini provider uses Google's OpenAI-compatible interface to maintain compatibility with AI SDK v4.

**Important:** Make sure to add `.env` to your `.gitignore` file to avoid committing sensitive information to version control.


## Tech Stack

- Hono for the API server
- Typescript
- Zod for request and response validation
- Vercel AI SDK for AI integration
- Docker for containerization


## Swagger Docs

After running the project, you can access the swagger docs at:

`http://localhost:3000/api/ui`

![Swagger Documentation](images/swagger.png)


## Demos

See examples how to use the APIs

You can access demos at http://localhost:3000/api/demos

![Demos](images/aibackends-demo-page.png)


## Provider and Model Selection
You need to send the service and model name in the request body. See examples in the swagger docs.

For example, to summarize text using Gemini model with Google as provider, you can use the following curl command:

```curl
curl --location 'http://localhost:3000/api/v1/summarize' \
--header 'Content-Type: application/json' \
--header 'Accept: application/json' \
--data '{
    "payload": {
        "text": "Text to summarize",
        "maxLength": 100
    },
    "config": {
        "provider": "google",
        "model": "gemini-2.5-flash-lite",
        "temperature": 0
    }
}'
```

Or with Ollama:

```curl
curl --location 'http://localhost:3000/api/v1/summarize' \
--header 'Content-Type: application/json' \
--header 'Accept: application/json' \
--data '{
    "payload": {
        "text": "Text to summarize",
        "maxLength": 100
    },
    "config": {
        "provider": "ollama",
        "model": "gemma3:270m",
        "temperature": 0
    }
}'
```

## Available Tools
- Home Page: `http://localhost:3000/`
- Swagger Docs: `http://localhost:3000/api/ui`. You can test the API endpoints here.
- JSON Editor: `http://localhost:3000/api/jsoneditor`

## Testing Examples

Check swagger docs for examples.

The project is in active development. More endpoints and providers will be added in the future. If you want to support me with API credits from your provider, please contact me.

I am also open to sponsorship to support the development of the project.

## Vision

![High level architecture](images/ai-backend-diagram.png)


## Technical Architecture

![Technical Architecture](images/aibackends-architecture.png)

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=donvito/ai-backends&type=Date)](https://www.star-history.com/#donvito/ai-backends&Date)

## Supporting the project
You can support my AI Backends project by becoming a Github Sponsor.