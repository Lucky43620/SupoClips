# Architecture

SupoClip is a local-first monorepo with a Next.js frontend, a FastAPI backend, an ARQ worker, PostgreSQL, and Redis.

```text
Browser -> Next.js frontend -> FastAPI backend -> Redis queue -> ARQ worker
                              |                              |
                              +---------- PostgreSQL --------+
```

## Frontend

Location: `frontend/`

- Next.js App Router
- Better Auth for local accounts
- Prisma for user/session/task storage
- React client pages for task creation, history, settings, and clip review

Key folders:

- `src/app`
- `src/components`
- `src/lib`
- `src/server`
- `prisma`

## Backend

Location: `backend/`

The active entry point is `src/main_refactored.py`.

Layers:

- `src/api/routes`: HTTP routes
- `src/services`: task and video orchestration
- `src/repositories`: database operations
- `src/workers`: queue and background processing
- `src/ai.py`: transcript analysis
- `src/video_utils.py`: video processing helpers

## Worker

The worker runs:

```bash
arq src.workers.tasks.WorkerSettings
```

It receives queued task jobs, downloads or resolves source videos, creates transcripts, asks the selected LLM for candidate segments, renders clips, and updates PostgreSQL.

## Database

`init.sql` is the Docker bootstrap schema. Prisma schema lives in `frontend/prisma/schema.prisma`.

Important tables:

- `users`
- `session`
- `account`
- `verification`
- `sources`
- `tasks`
- `generated_clips`
- `transcript_analysis_cache`

## Runtime Storage

Generated files are stored under the configured `TEMP_DIR`:

- Uploaded videos
- Downloaded source videos
- Rendered clips
- Transcript cache files

Docker maps uploads and clips to named volumes.
