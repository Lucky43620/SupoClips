# SupoClip Quick Start Guide

Run SupoClip locally with Docker.

## Prerequisites

1. Docker Desktop installed and running
2. An AssemblyAI API key for transcription
3. At least one AI provider:
   - OpenAI API key
   - Google AI API key
   - Anthropic API key
   - Ollama running locally

## Quick Start

```bash
./start.sh
```

The script checks prerequisites, builds images, starts the services, and prints the local URLs.

## First Time Setup

Create or edit `.env` at the repository root:

```env
ASSEMBLY_AI_API_KEY=your_assemblyai_key_here

# Choose one model/provider pair.
LLM=google-gla:gemini-3-flash-preview
GOOGLE_API_KEY=your_google_key_here

# Or OpenAI:
# LLM=openai:gpt-5.2
# OPENAI_API_KEY=your_openai_key_here

# Or Anthropic:
# LLM=anthropic:claude-4-sonnet
# ANTHROPIC_API_KEY=your_anthropic_key_here

# Or local Ollama:
# LLM=ollama:gpt-oss:20b
# OLLAMA_BASE_URL=http://localhost:11434/v1

BETTER_AUTH_SECRET=change_this_for_your_machine
```

Then start SupoClip:

```bash
docker-compose up -d --build
```

Open:

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API docs: http://localhost:8000/docs

## Useful Commands

```bash
docker-compose logs -f
docker-compose logs -f backend
docker-compose logs -f worker
docker-compose down
docker-compose down -v
```

`docker-compose down -v` deletes local database and Redis data. Use it when the schema changed and you want a clean local reset.

## Environment Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `ASSEMBLY_AI_API_KEY` | yes | Speech-to-text transcription |
| `LLM` | yes | Model identifier, for example `google-gla:gemini-3-flash-preview` |
| `GOOGLE_API_KEY` | if using Google | Gemini model access |
| `OPENAI_API_KEY` | if using OpenAI | OpenAI model access |
| `ANTHROPIC_API_KEY` | if using Anthropic | Claude model access |
| `OLLAMA_BASE_URL` | if using Ollama | Local Ollama endpoint |
| `BETTER_AUTH_SECRET` | recommended | Auth secret for local accounts |
| `YOUTUBE_DATA_API_KEY` | optional | YouTube metadata lookup |

## Troubleshooting

If services do not start, run:

```bash
docker-compose ps
docker-compose logs -f
```

If tasks stay queued, check the worker and Redis:

```bash
docker-compose logs -f worker
docker-compose logs -f redis
```

If the database schema looks stale after this local cleanup:

```bash
docker-compose down -v
docker-compose up -d --build
```

## Next Steps

- Add custom fonts to `backend/fonts/`
- Add transition videos to `backend/transitions/`
- Create an account at http://localhost:3000
- Paste a YouTube URL or upload a video and generate clips
