# Troubleshooting

## Services Do Not Start

Check status and logs:

```bash
docker-compose ps
docker-compose logs -f
```

Rebuild after dependency or Dockerfile changes:

```bash
docker-compose up -d --build
```

## Tasks Stay Queued

The worker must be running and Redis must be reachable.

```bash
docker-compose logs -f worker
docker-compose logs -f redis
```

If a task sat in queue while the worker was down, create a new task or use the resume action.

## API Key Errors

Make sure `LLM` matches an available key:

```env
LLM=google-gla:gemini-3-flash-preview
GOOGLE_API_KEY=...
```

For Ollama, make sure the local server is running and `OLLAMA_BASE_URL` points to it.

## Database Looks Stale

Local schema cleanup may require a volume reset:

```bash
docker-compose down -v
docker-compose up -d --build
```

This deletes local database and Redis data.

## Prisma Client Is Stale

Run Prisma generation from the frontend folder:

```bash
cd frontend
npm install
npx prisma generate
```

Docker runs generation automatically while building the frontend image.

## Frontend Cannot Reach Backend

Check:

- `NEXT_PUBLIC_API_URL`
- `BACKEND_INTERNAL_URL`
- backend health at http://localhost:8000/health
- CORS origins in `.env`

## Fonts Are Missing

Add `.ttf` files to `backend/fonts/`, then refresh the app. Local connected users can upload fonts from the app.
