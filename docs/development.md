# Development

## Recommended Loop

```bash
docker-compose up -d --build
docker-compose logs -f backend
docker-compose logs -f worker
```

The frontend is available at http://localhost:3000 and the backend at http://localhost:8000.

## Backend

```bash
cd backend
uv sync --all-groups
uvicorn src.main_refactored:app --reload --host 0.0.0.0 --port 8000
```

Worker:

```bash
cd backend
.venv/bin/arq src.workers.tasks.WorkerSettings
```

Run backend checks:

```bash
cd backend
uv run python -m compileall src
uv run pytest
```

## Frontend

```bash
cd frontend
npm install
npm run dev
npm run build
npm run test:coverage
```

The frontend imports Prisma from `frontend/src/generated/prisma`, which is generated from `frontend/prisma/schema.prisma`.

## Tests

Repository helpers:

```bash
make test-backend
make test-frontend
make test-e2e
make test-ci
```

Backend integration and browser tests expect PostgreSQL and Redis to be running.

## Common Changes

- Task routes: `backend/src/api/routes/tasks.py`
- Media routes: `backend/src/api/routes/media.py`
- Task orchestration: `backend/src/services/task_service.py`
- Video processing: `backend/src/services/video_service.py`, `backend/src/video_utils.py`
- Worker jobs: `backend/src/workers/tasks.py`
- Frontend creation page: `frontend/src/app/page.tsx`
- Settings page: `frontend/src/app/settings/page.tsx`
- Prisma schema: `frontend/prisma/schema.prisma`

After schema changes, reset local data or add a migration, then regenerate Prisma.
