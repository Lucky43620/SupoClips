# Configuration

SupoClip is configured with `.env` at the repository root. Docker passes the relevant values to the frontend, backend, worker, PostgreSQL, and Redis.

## Required

```env
ASSEMBLY_AI_API_KEY=your_assemblyai_key
LLM=google-gla:gemini-3-flash-preview
GOOGLE_API_KEY=your_google_key
```

You can use another provider by changing `LLM` and setting the matching key:

```env
LLM=openai:gpt-5.2
OPENAI_API_KEY=your_openai_key

LLM=anthropic:claude-4-sonnet
ANTHROPIC_API_KEY=your_anthropic_key

LLM=ollama:gpt-oss:20b
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_API_KEY=
```

## Processing

```env
WHISPER_MODEL_SIZE=medium
QUEUED_TASK_TIMEOUT_SECONDS=180
DEFAULT_PROCESSING_MODE=fast
FAST_MODE_MAX_CLIPS=4
FAST_MODE_TRANSCRIPT_MODEL=nano
APIFY_YOUTUBE_DEFAULT_QUALITY=1080
```

## Optional Media Services

```env
APIFY_API_TOKEN=
YOUTUBE_METADATA_PROVIDER=yt_dlp
YOUTUBE_DATA_API_KEY=
```

`APIFY_API_TOKEN` helps with YouTube downloads. `YOUTUBE_METADATA_PROVIDER=youtube_data_api` uses YouTube Data API v3 for metadata before falling back.

## Auth And URLs

```env
BETTER_AUTH_SECRET=supoclip_local_secret_change_me
DISABLE_SIGN_UP=false
NEXT_PUBLIC_APP_URL=http://localhost:3000
CORS_ORIGINS=http://localhost:3000,http://sp.localhost:3000
```

Accounts are still useful locally because each user keeps their own tasks, history, and default caption style.

## Storage

```env
POSTGRES_DB=supoclip
POSTGRES_USER=supoclip
POSTGRES_PASSWORD=supoclip_password
REDIS_PASSWORD=
```

If the database schema changes or you want a clean install, reset local volumes:

```bash
docker-compose down -v
docker-compose up -d --build
```
