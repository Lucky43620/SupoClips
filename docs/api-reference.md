# API Reference

The active backend entry point is `backend/src/main_refactored.py`.

## Health

- `GET /`
- `GET /health`
- `GET /health/db`
- `GET /health/redis`

## Tasks

- `POST /start-with-progress`
  - Creates a task and enqueues video processing.
- `GET /tasks/`
  - Lists tasks for the current local user.
- `GET /tasks/{task_id}`
  - Returns task details and generated clips.
- `GET /tasks/{task_id}/progress`
  - Streams progress updates with SSE.
- `POST /tasks/{task_id}/cancel`
  - Cancels a running or queued task.
- `POST /tasks/{task_id}/resume`
  - Requeues a task after cancellation or failure.
- `DELETE /tasks/{task_id}`
  - Deletes a task and its clips.
- `GET /tasks/metrics/performance`
  - Returns aggregate processing timings.

## Clip Editing

- `PATCH /tasks/{task_id}/clips/{clip_id}`
  - Trims a clip.
- `POST /tasks/{task_id}/clips/{clip_id}/split`
  - Splits a clip at a timestamp.
- `POST /tasks/{task_id}/clips/merge`
  - Merges selected clips.
- `PATCH /tasks/{task_id}/clips/{clip_id}/captions`
  - Updates clip caption text and style metadata.
- `GET /tasks/{task_id}/clips/{clip_id}/export`
  - Exports a clip with an optional platform preset.

## Media

- `POST /upload`
  - Uploads a local video file.
- `GET /clips/{filename}`
  - Serves generated clips.
- `GET /fonts`
  - Lists available fonts.
- `POST /fonts`
  - Uploads a font for local users.
- `GET /fonts/{font_name}`
  - Serves a font file.
- `GET /transitions`
  - Lists transition videos.
- `GET /caption-templates`
  - Lists caption templates.

## Authentication Headers

Frontend API helpers pass the local user id to the backend with:

```http
x-supoclip-user-id: <user-id>
```

The legacy `user_id` header is still accepted by older backend paths.
