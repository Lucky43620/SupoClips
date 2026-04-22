# Setup

## Docker

1. Copy `.env.example` to `.env`.
2. Fill in `ASSEMBLY_AI_API_KEY`.
3. Choose one LLM provider and set `LLM` plus its API key.
4. Start the stack:

```bash
docker-compose up -d --build
```

Open http://localhost:3000 and create a local account.

## Services

- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- Backend docs: http://localhost:8000/docs
- PostgreSQL: localhost:5432
- Redis: localhost:6379

## Local Backend

Requires Python 3.11+, `uv`, ffmpeg, PostgreSQL, and Redis.

```bash
cd backend
uv sync --all-groups
uvicorn src.main_refactored:app --reload --host 0.0.0.0 --port 8000
```

Run the worker in another terminal:

```bash
cd backend
.venv/bin/arq src.workers.tasks.WorkerSettings
```

## Local Frontend

Requires Node tooling.

```bash
cd frontend
npm install
npm run dev
```

`npm install` runs Prisma generation through `postinstall`. Docker also runs Prisma generation while building the frontend image.

## Reset Local Data

Use this after schema changes or when you want a clean database:

```bash
docker-compose down -v
docker-compose up -d --build
```
