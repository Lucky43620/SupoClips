# Fuck OpusClip.

... because good video clips shouldn't cost a fortune or come with ugly watermarks.

<p align="center">
  <a href="https://www.supoclip.com">
    <img src="assets/banner.png" alt="SupoClip Banner" width="100%" />
  </a>
</p>

OpusClip charges $15-29/month and slaps watermarks on every free video. SupoClip gives you the same AI-powered video clipping capabilities locally: free, open source, and watermark-free.

## Why SupoClip Exists

### The OpusClip Problem

OpusClip is undeniably powerful. It's an AI video clipping tool that can turn long-form content into viral short clips with features like:

- AI-powered clip generation from long videos
- Automated captions with 97%+ accuracy
- Virality scoring to predict viral potential
- Multi-language support (20+ languages)
- Brand templates and customization

**But here's the catch:**

- **Free tier limitations**: Only 60 minutes of processing per month
- **Watermarks everywhere**: Every free video gets branded with OpusClip's watermark
- **Expensive pricing**: $15/month for Starter, $29/month for Pro
- **Processing limits**: Even higher tiers have strict minute limits
- **Vendor lock-in**: Your content and workflows are tied to their platform

### The SupoClip Solution

SupoClip provides the same core functionality without the financial burden:

→ ✅ **Completely Free** - No monthly fees, no processing limits

→ ✅ **No Watermarks** - Your content stays yours

→ ✅ **Open Source** - Full transparency, community-driven development

→ ✅ **Self-Hosted** - Complete control over your data and processing

→ ✅ **Unlimited Usage** - Process as many videos as your hardware can handle

→ ✅ **Customizable** - Modify and extend the codebase to fit your needs

## Quick Start

### Prerequisites

- Docker and Docker Compose
- An AssemblyAI API key (for transcription) - [Get one here](https://www.assemblyai.com/)
- An LLM provider for AI analysis - OpenAI, Google, Anthropic, or Ollama

### 1. Clone and Configure

```bash
git clone https://github.com/your-username/supoclip.git
cd supoclip
```

Create a `.env` file in the root directory:

```env
# Required: Video transcription
ASSEMBLY_AI_API_KEY=your_assemblyai_api_key

# Required: Choose ONE LLM provider and set its API key
# Option A: Google Gemini (recommended - fast & cost-effective)
LLM=google-gla:gemini-3-flash-preview
GOOGLE_API_KEY=your_google_api_key

# Option B: OpenAI GPT-5.2 (best reasoning)
# LLM=openai:gpt-5.2
# OPENAI_API_KEY=your_openai_api_key

# Option C: Anthropic Claude
# LLM=anthropic:claude-4-sonnet
# ANTHROPIC_API_KEY=your_anthropic_api_key

# Option D: Ollama (local/self-hosted)
# LLM=ollama:gpt-oss:20b
# OLLAMA_BASE_URL=http://localhost:11434/v1
# OLLAMA_API_KEY=your_ollama_api_key  # Optional (Ollama Cloud)

# Optional: Auth secret for your local/server install
BETTER_AUTH_SECRET=change_this_local_secret

# Optional: YouTube metadata provider
# `yt_dlp` preserves the existing metadata behavior
# `youtube_data_api` uses the official API first, then falls back to yt-dlp
# YOUTUBE_METADATA_PROVIDER=yt_dlp
# YOUTUBE_DATA_API_KEY=your_youtube_data_api_key
```

### 2. Start the Services

```bash
docker-compose up -d --build
```

This starts:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000 (docs at /docs)
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379

### 3. Wait for Initialization

First-time startup takes a few minutes. Check progress with:

```bash
docker-compose logs -f
```

Wait until you see health checks passing for all services.

### 4. Access the App

Open http://localhost:3000 in your browser, create an account, and start clipping!

### Troubleshooting

**Backend fails to start with API key error:**
- Make sure you've set the correct LLM provider AND its corresponding API key in `.env`
- Default is `google-gla:gemini-3-flash-preview` which requires `GOOGLE_API_KEY`
- If using `openai:gpt-5.2`, you MUST set `OPENAI_API_KEY`
- If using `ollama:*`, run Ollama and (optionally) set `OLLAMA_BASE_URL`
- Rebuild after changing `.env`: `docker-compose up -d --build`

**Videos stay queued / never process:**
- Check worker logs: `docker-compose logs -f worker`
- Ensure Redis is healthy: `docker-compose logs redis`
- Verify API keys are correct

**YouTube titles or duration lookup is failing:**
- `YOUTUBE_METADATA_PROVIDER=yt_dlp` keeps the old metadata path
- `YOUTUBE_METADATA_PROVIDER=youtube_data_api` requires YouTube Data API v3 enabled in Google Cloud
- Prefer `YOUTUBE_DATA_API_KEY`; if it is unset, the backend will try `GOOGLE_API_KEY`
- The backend will automatically fall back to the other metadata provider if the primary one fails
- `videos.list` costs 1 quota unit per request

**Performance tuning (default is fast mode):**
- `DEFAULT_PROCESSING_MODE=fast|balanced|quality`
- `FAST_MODE_MAX_CLIPS=4` to cap clip count in fast mode
- `FAST_MODE_TRANSCRIPT_MODEL=nano` for fastest transcript model
- View aggregate metrics: `GET /tasks/metrics/performance`

**Prisma errors on Windows:**
- Run `docker-compose down -v` to clear volumes
- Run `docker-compose up -d --build` to rebuild

**Frontend shows database errors:**
- Wait for PostgreSQL to fully initialize (check logs)
- The database is automatically created on first run

**Font picker is empty / cannot select or upload fonts:**
- Add fonts to `backend/fonts/` – see [backend/fonts/README.md](backend/fonts/README.md) for TikTok Sans and custom fonts
- Connected local users can upload custom fonts freely

## Testing

SupoClip now has a layered automated test setup:

- `pytest` for backend unit and integration tests
- `Vitest` and Testing Library for frontend route and component coverage
- `Playwright` for a small seeded browser smoke suite

Repo-level entrypoints:

```bash
make test
make test-backend
make test-frontend
make test-e2e
make test-ci
```

App-level entrypoints:

```bash
cd backend && uv sync --all-groups && .venv/bin/pytest
cd frontend && npm install && npm run test:coverage
cd frontend && npm run test:e2e
```

Local test runs expect PostgreSQL and Redis to be available. The easiest path is to start the stack with `docker-compose up -d`, then run the commands above. CI runs the same layers in GitHub Actions with Postgres and Redis service containers.

## Documentation

Detailed documentation now lives in [`docs/`](docs/README.md).

Start with:

- [`docs/setup.md`](docs/setup.md)
- [`docs/configuration.md`](docs/configuration.md)
- [`docs/app-guide.md`](docs/app-guide.md)
- [`docs/architecture.md`](docs/architecture.md)
- [`docs/api-reference.md`](docs/api-reference.md)
- [`docs/development.md`](docs/development.md)
- [`docs/troubleshooting.md`](docs/troubleshooting.md)

### Local Development (Without Docker)

See [CLAUDE.md](CLAUDE.md) for detailed development instructions.

## License

SupoClip is released under the AGPL-3.0 License. See [LICENSE](LICENSE) for details.
