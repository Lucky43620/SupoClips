"""
Task API routes using refactored architecture.
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse
import json
import logging
from typing import Dict, Any, Optional
import inspect
import re
import os
from pathlib import Path

from ...database import get_db
from ...database import AsyncSessionLocal
from ...services.task_service import TaskService
from ...auth_headers import USER_ID_HEADER
from ...workers.job_queue import JobQueue
from ...workers.progress import ProgressTracker
from ...config import get_config
from ...font_registry import is_font_accessible
import redis.asyncio as redis
from ...clip_editor import export_with_preset, EXPORT_PRESETS

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/tasks", tags=["tasks"])


def _normalize_font_size(value: Any, default: int = 24) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    return max(12, min(72, parsed))


def _normalize_font_color(value: Any, default: str = "#FFFFFF") -> str:
    if isinstance(value, str) and re.match(r"^#[0-9A-Fa-f]{6}$", value):
        return value.upper()
    return default


def _normalize_font_family(value: Any, default: str = "TikTokSans-Regular") -> str:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return default


def _get_user_id_from_headers(request: Request) -> str:
    """Get user ID from the local frontend proxy header."""
    user_id = request.headers.get("user_id") or request.headers.get(USER_ID_HEADER)
    if not user_id:
        raise HTTPException(status_code=401, detail="User authentication required")
    return user_id


async def _require_task_owner(
    request: Request, task_service: TaskService, db: AsyncSession, task_id: str
):
    """Ensure authenticated user owns the task."""
    user_id = _get_user_id_from_headers(request)

    task = await task_service.task_repo.get_task_by_id(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if task.get("user_id") != user_id:
        raise HTTPException(status_code=403, detail="Not authorized for this task")

    return task


@router.get("/")
async def list_tasks(
    request: Request, db: AsyncSession = Depends(get_db), limit: int = 50
):
    """
    Get all tasks for the authenticated user.
    """
    user_id = _get_user_id_from_headers(request)

    try:
        task_service = TaskService(db)
        tasks = await task_service.get_user_tasks(user_id, limit)

        return {"tasks": tasks, "total": len(tasks)}

    except Exception as e:
        logger.error(f"Error retrieving user tasks: {e}")
        raise HTTPException(status_code=500, detail=f"Error retrieving tasks: {str(e)}")


@router.post("/")
async def create_task(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Create a new task and enqueue it for processing.
    Returns task_id immediately.
    """
    data = await request.json()

    raw_source = data.get("source")
    config = get_config()
    user_id = request.headers.get("user_id") or request.headers.get(USER_ID_HEADER)
    if not user_id:
        raise HTTPException(status_code=401, detail="User authentication required")

    # Get font options
    font_options = data.get("font_options", {})
    font_family = _normalize_font_family(
        font_options.get("font_family", "TikTokSans-Regular")
    )
    font_size = _normalize_font_size(font_options.get("font_size", 24))
    font_color = _normalize_font_color(font_options.get("font_color", "#FFFFFF"))
    caption_template = data.get("caption_template", "default")
    processing_mode = data.get("processing_mode", config.default_processing_mode)
    if processing_mode not in {"fast", "balanced", "quality"}:
        processing_mode = config.default_processing_mode
    output_format = data.get("output_format", "vertical")
    if output_format not in {"vertical", "original"}:
        output_format = "vertical"
    add_subtitles = data.get("add_subtitles", True)
    if not isinstance(add_subtitles, bool):
        add_subtitles = True
    llm_model = data.get("llm_model") or config.llm
    if not isinstance(llm_model, str) or ":" not in llm_model:
        llm_model = config.llm
    if not raw_source or not raw_source.get("url"):
        raise HTTPException(status_code=400, detail="Source URL is required")

    try:
        task_service = TaskService(db)

        # Create task
        task_id = await task_service.create_task_with_source(
            user_id=user_id,
            url=raw_source["url"],
            title=raw_source.get("title"),
            font_family=font_family,
            font_size=font_size,
            font_color=font_color,
            caption_template=caption_template,
            processing_mode=processing_mode,
        )

        # Get source type for worker
        source_type = task_service.video_service.determine_source_type(
            raw_source["url"]
        )

        # Enqueue job for worker
        queue_adapter = getattr(request.app.state, "queue_adapter", JobQueue)
        job_id = await queue_adapter.enqueue_processing_job(
            "process_video_task",
            processing_mode,
            task_id,
            raw_source["url"],
            source_type,
            user_id,
            font_family,
            font_size,
            font_color,
            caption_template,
            processing_mode,
            output_format,
            add_subtitles,
            llm_model,
        )

        # Save source metadata for resume/retries in environments without sources.url column
        redis_client = redis.Redis(
            host=config.redis_host, port=config.redis_port, password=config.redis_password, decode_responses=True
        )
        try:
            await redis_client.set(
                f"task_source:{task_id}",
                json.dumps({
                    "url": raw_source["url"],
                    "source_type": source_type,
                    "output_format": output_format,
                    "add_subtitles": add_subtitles,
                    "llm_model": llm_model,
                }),
                ex=60 * 60 * 24 * 7,
            )
        finally:
            await redis_client.close()

        logger.info(f"Task {task_id} created and job {job_id} enqueued")

        return {
            "task_id": task_id,
            "job_id": job_id,
            "message": "Task created and queued for processing",
        }

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating task: {e}")
        raise HTTPException(status_code=500, detail=f"Error creating task: {str(e)}")


@router.get("/{task_id}")
async def get_task(
    task_id: str, request: Request, db: AsyncSession = Depends(get_db)
):
    """Get task details."""
    try:
        task_service = TaskService(db)
        await _require_task_owner(request, task_service, db, task_id)
        task = await task_service.get_task_with_clips(task_id)

        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        return task

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving task: {e}")
        raise HTTPException(status_code=500, detail=f"Error retrieving task: {str(e)}")


@router.get("/{task_id}/clips")
async def get_task_clips(
    task_id: str, request: Request, db: AsyncSession = Depends(get_db)
):
    """Get all clips for a task."""
    try:
        task_service = TaskService(db)
        await _require_task_owner(request, task_service, db, task_id)
        task = await task_service.get_task_with_clips(task_id)

        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        return {
            "task_id": task_id,
            "clips": task.get("clips", []),
            "total_clips": len(task.get("clips", [])),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving clips: {e}")
        raise HTTPException(status_code=500, detail=f"Error retrieving clips: {str(e)}")


@router.get("/{task_id}/progress")
async def get_task_progress_sse(task_id: str, request: Request):
    """
    SSE endpoint for real-time progress updates.
    Streams progress updates as Server-Sent Events.
    """

    user_id = _get_user_id_from_headers(request)

    async with AsyncSessionLocal() as local_db:
        task_service = TaskService(local_db)
        task = await task_service.task_repo.get_task_by_id(local_db, task_id)

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if task.get("user_id") != user_id:
        raise HTTPException(status_code=403, detail="Not authorized for this task")

    async def event_generator():
        """Generate SSE events for task progress."""
        # Send initial task status
        yield {
            "event": "status",
            "data": json.dumps(
                {
                    "task_id": task_id,
                    "status": task.get("status"),
                    "progress": task.get("progress", 0),
                    "message": task.get("progress_message", ""),
                }
            ),
        }

        # If task is already completed or error, close connection
        if task.get("status") in ["completed", "error"]:
            yield {"event": "close", "data": json.dumps({"status": task.get("status")})}
            return

        # Connect to Redis for real-time updates
        runtime_config = get_config()
        redis_client = redis.Redis(
            host=runtime_config.redis_host,
            port=runtime_config.redis_port,
            password=runtime_config.redis_password,
            decode_responses=True,
        )

        try:
            # Subscribe to progress updates
            async for progress_data in ProgressTracker.subscribe_to_progress(
                redis_client, task_id
            ):
                event_type = progress_data.get("event_type", "progress")
                yield {"event": event_type, "data": json.dumps(progress_data)}

                # Close connection if task is done
                if progress_data.get("status") in ["completed", "error"]:
                    yield {
                        "event": "close",
                        "data": json.dumps({"status": progress_data.get("status")}),
                    }
                    break

        finally:
            await redis_client.close()

    return EventSourceResponse(event_generator())


@router.patch("/{task_id}")
async def update_task(
    task_id: str, request: Request, db: AsyncSession = Depends(get_db)
):
    """Update task details (title)."""
    try:
        data = await request.json()
        title = data.get("title")

        if not title:
            raise HTTPException(status_code=400, detail="Title is required")

        task_service = TaskService(db)

        task = await _require_task_owner(request, task_service, db, task_id)

        # Update source title
        await task_service.source_repo.update_source_title(db, task["source_id"], title)

        return {"message": "Task updated successfully", "task_id": task_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating task: {e}")
        raise HTTPException(status_code=500, detail=f"Error updating task: {str(e)}")


@router.delete("/{task_id}")
async def delete_task(
    task_id: str, request: Request, db: AsyncSession = Depends(get_db)
):
    """Delete a task and all its associated clips."""
    try:
        user_id = _get_user_id_from_headers(request)
        task_service = TaskService(db)

        # Get task to verify ownership
        task = await task_service.task_repo.get_task_by_id(db, task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        if task["user_id"] != user_id:
            raise HTTPException(
                status_code=403, detail="Not authorized to delete this task"
            )

        # Get clip file paths before deleting from DB
        clips = await task_service.clip_repo.get_clips_by_task(db, task_id)
        file_paths = [c.get("file_path") for c in clips if c.get("file_path")]

        # Delete clips and task from DB
        await task_service.delete_task(task_id)

        # Delete physical files
        deleted_files = 0
        for fp in file_paths:
            try:
                p = Path(fp)
                if p.exists():
                    p.unlink()
                    deleted_files += 1
            except Exception as exc:
                logger.warning(f"Could not delete file {fp}: {exc}")

        return {"message": "Task deleted successfully", "files_deleted": deleted_files}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting task: {e}")
        raise HTTPException(status_code=500, detail=f"Error deleting task: {str(e)}")


@router.delete("/{task_id}/clips/{clip_id}")
async def delete_clip(
    task_id: str, clip_id: str, request: Request, db: AsyncSession = Depends(get_db)
):
    """Delete a specific clip."""
    try:
        user_id = _get_user_id_from_headers(request)
        task_service = TaskService(db)

        # Verify task ownership
        task = await task_service.task_repo.get_task_by_id(db, task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        if task["user_id"] != user_id:
            raise HTTPException(
                status_code=403, detail="Not authorized to delete this clip"
            )

        # Delete the clip
        await task_service.clip_repo.delete_clip(db, clip_id)

        return {"message": "Clip deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting clip: {e}")
        raise HTTPException(status_code=500, detail=f"Error deleting clip: {str(e)}")


@router.patch("/{task_id}/clips/{clip_id}")
async def trim_clip(
    task_id: str, clip_id: str, request: Request, db: AsyncSession = Depends(get_db)
):
    """Trim clip boundaries and regenerate clip file."""
    try:
        payload = await request.json()
        start_offset = float(payload.get("start_offset", 0))
        end_offset = float(payload.get("end_offset", 0))

        if start_offset < 0 or end_offset < 0:
            raise HTTPException(status_code=400, detail="Offsets must be non-negative")

        task_service = TaskService(db)
        await _require_task_owner(request, task_service, db, task_id)
        updated_clip = await task_service.trim_clip(
            task_id, clip_id, start_offset, end_offset
        )
        return {"clip": updated_clip}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error trimming clip: {e}")
        raise HTTPException(status_code=500, detail=f"Error trimming clip: {str(e)}")


@router.post("/{task_id}/clips/{clip_id}/split")
async def split_clip(
    task_id: str, clip_id: str, request: Request, db: AsyncSession = Depends(get_db)
):
    """Split a clip into two clips."""
    try:
        payload = await request.json()
        split_time = float(payload.get("split_time", 0))
        if split_time <= 0:
            raise HTTPException(
                status_code=400, detail="split_time must be greater than zero"
            )

        task_service = TaskService(db)
        await _require_task_owner(request, task_service, db, task_id)
        result = await task_service.split_clip(task_id, clip_id, split_time)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error splitting clip: {e}")
        raise HTTPException(status_code=500, detail=f"Error splitting clip: {str(e)}")


@router.post("/{task_id}/clips/merge")
async def merge_clips(
    task_id: str, request: Request, db: AsyncSession = Depends(get_db)
):
    """Merge multiple clips into one clip."""
    try:
        payload = await request.json()
        clip_ids = payload.get("clip_ids") or []
        if not isinstance(clip_ids, list):
            raise HTTPException(status_code=400, detail="clip_ids must be an array")

        task_service = TaskService(db)
        await _require_task_owner(request, task_service, db, task_id)
        result = await task_service.merge_clips(task_id, clip_ids)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error merging clips: {e}")
        raise HTTPException(status_code=500, detail=f"Error merging clips: {str(e)}")


@router.patch("/{task_id}/clips/{clip_id}/captions")
async def update_clip_captions(
    task_id: str, clip_id: str, request: Request, db: AsyncSession = Depends(get_db)
):
    """Update clip caption text, timing style and highlighted words."""
    try:
        payload = await request.json()
        caption_text = str(payload.get("caption_text", "")).strip()
        position = str(payload.get("position", "bottom"))
        highlight_words = payload.get("highlight_words") or []
        if not isinstance(highlight_words, list):
            raise HTTPException(
                status_code=400, detail="highlight_words must be an array"
            )

        task_service = TaskService(db)
        await _require_task_owner(request, task_service, db, task_id)
        updated_clip = await task_service.update_clip_captions(
            task_id,
            clip_id,
            caption_text,
            position,
            [str(word) for word in highlight_words],
        )
        return {"clip": updated_clip}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating captions: {e}")
        raise HTTPException(
            status_code=500, detail=f"Error updating captions: {str(e)}"
        )


@router.post("/{task_id}/clips/{clip_id}/regenerate")
async def regenerate_clip(
    task_id: str, clip_id: str, request: Request, db: AsyncSession = Depends(get_db)
):
    """Regenerate a single clip after editing timing values."""
    try:
        payload = await request.json()
        start_offset = float(payload.get("start_offset", 0))
        end_offset = float(payload.get("end_offset", 0))

        task_service = TaskService(db)
        await _require_task_owner(request, task_service, db, task_id)
        updated_clip = await task_service.trim_clip(
            task_id, clip_id, start_offset, end_offset
        )
        return {"clip": updated_clip, "message": "Clip regenerated successfully"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error regenerating clip: {e}")
        raise HTTPException(
            status_code=500, detail=f"Error regenerating clip: {str(e)}"
        )


@router.post("/{task_id}/settings")
async def apply_task_settings(
    task_id: str, request: Request, db: AsyncSession = Depends(get_db)
):
    """Update task-level styling settings and optionally apply to all existing clips."""
    try:
        payload = await request.json()
        font_family = _normalize_font_family(
            payload.get("font_family", "TikTokSans-Regular")
        )
        font_size = _normalize_font_size(payload.get("font_size", 24))
        font_color = _normalize_font_color(payload.get("font_color", "#FFFFFF"))
        caption_template = payload.get("caption_template", "default")
        apply_to_existing = bool(payload.get("apply_to_existing", False))

        task_service = TaskService(db)
        await _require_task_owner(request, task_service, db, task_id)
        task_record = await task_service.task_repo.get_task_by_id(db, task_id)
        if not task_record:
            raise HTTPException(status_code=404, detail="Task not found")
        if not is_font_accessible(font_family, task_record["user_id"]):
            raise HTTPException(
                status_code=400, detail="Selected font is not available"
            )
        task = await task_service.update_task_settings(
            task_id,
            font_family,
            font_size,
            font_color,
            caption_template,
            apply_to_existing,
        )
        return {"task": task, "message": "Task settings updated"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating task settings: {e}")
        raise HTTPException(
            status_code=500, detail=f"Error updating task settings: {str(e)}"
        )


@router.get("/{task_id}/clips/{clip_id}/export")
async def export_clip(
    task_id: str,
    clip_id: str,
    request: Request,
    preset: str = "tiktok",
    db: AsyncSession = Depends(get_db),
):
    """Export clip with a social platform preset."""
    try:
        preset_name = preset.lower().strip()
        if preset_name not in EXPORT_PRESETS:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid preset. Use one of: {', '.join(EXPORT_PRESETS.keys())}",
            )

        task_service = TaskService(db)
        await _require_task_owner(request, task_service, db, task_id)
        clip = await task_service.clip_repo.get_clip_by_id(db, clip_id)
        if not clip or clip.get("task_id") != task_id:
            raise HTTPException(status_code=404, detail="Clip not found")

        from pathlib import Path

        output_path = export_with_preset(
            Path(clip["file_path"]),
            Path(config.temp_dir) / "exports",
            preset_name,
        )

        download_name = f"{Path(clip['filename']).stem}_{preset_name}.mp4"
        return FileResponse(
            path=str(output_path), media_type="video/mp4", filename=download_name
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error exporting clip: {e}")
        raise HTTPException(status_code=500, detail=f"Error exporting clip: {str(e)}")


@router.post("/{task_id}/cancel")
async def cancel_task(
    task_id: str, request: Request, db: AsyncSession = Depends(get_db)
):
    """Cancel an active queued or processing task."""
    try:
        task_service = TaskService(db)
        task = await _require_task_owner(request, task_service, db, task_id)

        if task.get("status") in ["completed", "error", "cancelled"]:
            return {"message": f"Task already in terminal state: {task.get('status')}"}

        redis_client = redis.Redis(
            host=config.redis_host, port=config.redis_port, password=config.redis_password, decode_responses=True
        )
        try:
            await redis_client.setex(f"task_cancel:{task_id}", 3600, "1")
        finally:
            await redis_client.close()

        await task_service.task_repo.update_task_status(
            db,
            task_id,
            "cancelled",
            progress=0,
            progress_message="Cancelled by user",
        )

        return {"message": "Task cancellation requested"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error cancelling task: {e}")
        raise HTTPException(status_code=500, detail=f"Error cancelling task: {str(e)}")


@router.get("/metrics/performance")
async def get_performance_metrics(db: AsyncSession = Depends(get_db)):
    """Get aggregate processing performance metrics by mode."""
    try:
        task_service = TaskService(db)
        return await task_service.get_performance_metrics()
    except Exception as e:
        logger.error(f"Error loading performance metrics: {e}")
        raise HTTPException(status_code=500, detail=f"Error loading metrics: {str(e)}")


@router.post("/{task_id}/resume")
async def resume_task(
    task_id: str, request: Request, db: AsyncSession = Depends(get_db)
):
    """Resume a cancelled or errored task by enqueueing a new worker job."""
    try:
        task_service = TaskService(db)
        task = await _require_task_owner(request, task_service, db, task_id)

        if task.get("status") not in ["cancelled", "error", "queued"]:
            raise HTTPException(
                status_code=400,
                detail="Only cancelled/error/queued tasks can be resumed",
            )

        source_url = task.get("source_url")
        source_type = task.get("source_type")
        output_format = "vertical"
        add_subtitles = True

        redis_client = redis.Redis(
            host=config.redis_host, port=config.redis_port, password=config.redis_password, decode_responses=True
        )
        try:
            source_payload = await redis_client.get(f"task_source:{task_id}")
            if source_payload:
                parsed = json.loads(source_payload)
                if not source_url:
                    source_url = parsed.get("url")
                if not source_type:
                    source_type = parsed.get("source_type")
                of = parsed.get("output_format", output_format)
                if of in ("vertical", "original"):
                    output_format = of
                asub = parsed.get("add_subtitles", add_subtitles)
                if isinstance(asub, bool):
                    add_subtitles = asub
        finally:
            await redis_client.close()

        if not source_url or not source_type:
            raise HTTPException(status_code=400, detail="Task source URL is missing")

        redis_client = redis.Redis(
            host=config.redis_host, port=config.redis_port, password=config.redis_password, decode_responses=True
        )
        try:
            await redis_client.delete(f"task_cancel:{task_id}")
        finally:
            await redis_client.close()

        await task_service.task_repo.update_task_status(
            db,
            task_id,
            "queued",
            progress=0,
            progress_message="Re-queued by user",
        )

        processing_mode = task.get("processing_mode") or config.default_processing_mode

        job_id = await JobQueue.enqueue_processing_job(
            "process_video_task",
            processing_mode,
            task_id,
            source_url,
            source_type,
            task["user_id"],
            task.get("font_family") or "TikTokSans-Regular",
            task.get("font_size") or 24,
            task.get("font_color") or "#FFFFFF",
            task.get("caption_template") or "default",
            processing_mode,
            output_format,
            add_subtitles,
        )

        return {"message": "Task resumed", "job_id": job_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error resuming task: {e}")
        raise HTTPException(status_code=500, detail=f"Error resuming task: {str(e)}")


@router.get("/dead-letter/list")
async def list_dead_letter_tasks():
    """List tasks that exhausted retries and landed in dead-letter store."""
    redis_client = redis.Redis(
        host=config.redis_host, port=config.redis_port, password=config.redis_password, decode_responses=True
    )
    try:
        ids_result = redis_client.smembers("tasks:dead_letter")
        ids = await ids_result if inspect.isawaitable(ids_result) else ids_result
        items = []
        safe_ids = list(ids or [])
        for task_id in sorted(safe_ids):
            payload = await redis_client.get(f"dead_letter:{task_id}")
            if payload:
                try:
                    items.append(json.loads(payload))
                except json.JSONDecodeError:
                    items.append({"task_id": task_id, "raw": payload})

        return {"total": len(items), "tasks": items}
    finally:
        await redis_client.close()


def _find_source_video(source_url: str, source_type: str, temp_dir: Path) -> Optional[Path]:
    """Try to locate the downloaded source video on disk."""
    if source_type == "video_url" or (source_url and not source_url.startswith("http")):
        # Uploaded file
        if source_url:
            if source_url.startswith("upload://"):
                filename = Path(source_url.removeprefix("upload://")).name
            else:
                filename = Path(source_url).name
            candidate = temp_dir / "uploads" / filename
            if candidate.exists():
                return candidate
        return None

    # YouTube: look for {video_id}.* in temp_dir
    if source_url:
        try:
            from ...youtube_utils import get_youtube_video_id
            video_id = get_youtube_video_id(source_url)
            if video_id:
                for ext in (".mp4", ".mkv", ".webm", ".mov", ".m4v"):
                    candidate = temp_dir / f"{video_id}{ext}"
                    if candidate.exists():
                        return candidate
        except Exception:
            pass
    return None


def _dir_size(path: Path) -> int:
    """Return total size in bytes of a directory (non-recursive safe)."""
    total = 0
    if not path.exists():
        return 0
    for entry in path.rglob("*"):
        if entry.is_file():
            try:
                total += entry.stat().st_size
            except OSError:
                pass
    return total


@router.get("/{task_id}/source-video")
async def serve_source_video(task_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Stream the original downloaded/uploaded video for a task."""
    user_id = _get_user_id_from_headers(request)
    cfg = get_config()
    temp_root = Path(cfg.temp_dir)

    task_service = TaskService(db)
    task = await task_service.task_repo.get_task_by_id(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.get("user_id") != user_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    source_url = task.get("source_url") or ""
    source_type = task.get("source_type") or "youtube"

    # Try Redis fallback for source_url
    if not source_url:
        try:
            redis_client = redis.Redis(
                host=cfg.redis_host, port=cfg.redis_port, password=cfg.redis_password, decode_responses=True
            )
            payload = await redis_client.get(f"task_source:{task_id}")
            await redis_client.close()
            if payload:
                parsed = json.loads(payload)
                source_url = parsed.get("url", "")
                source_type = parsed.get("source_type", "youtube")
        except Exception:
            pass

    video_path = _find_source_video(source_url, source_type, temp_root)
    if not video_path:
        raise HTTPException(status_code=404, detail="Source video not found on disk")

    media_type = "video/mp4"
    if video_path.suffix.lower() == ".mkv":
        media_type = "video/x-matroska"
    elif video_path.suffix.lower() == ".webm":
        media_type = "video/webm"

    return FileResponse(
        path=str(video_path),
        media_type=media_type,
        filename=video_path.name,
        headers={"Accept-Ranges": "bytes"},
    )


@router.get("/storage/info")
async def get_storage_info(request: Request, db: AsyncSession = Depends(get_db)):
    """Return disk usage stats and per-task file sizes for the authenticated user."""
    user_id = _get_user_id_from_headers(request)
    cfg = get_config()
    temp_root = Path(cfg.temp_dir)

    clips_dir = temp_root / "clips"
    uploads_dir = temp_root / "uploads"

    clips_size = _dir_size(clips_dir)
    uploads_size = _dir_size(uploads_dir)

    # Disk usage for the whole temp dir
    try:
        usage = os.statvfs(str(temp_root)) if hasattr(os, "statvfs") else None
        if usage:
            disk_total = usage.f_frsize * usage.f_blocks
            disk_free = usage.f_frsize * usage.f_bavail
            disk_used = disk_total - disk_free
        else:
            import shutil
            du = shutil.disk_usage(str(temp_root) if temp_root.exists() else ".")
            disk_total = du.total
            disk_free = du.free
            disk_used = du.used
    except Exception:
        disk_total = disk_used = disk_free = 0

    # Per-task file info for the current user
    task_service = TaskService(db)
    tasks = await task_service.get_user_tasks(user_id, limit=200)

    tasks_with_files = []
    for t in tasks:
        task_id = t["id"]
        clips = await task_service.clip_repo.get_clips_by_task(db, task_id)
        task_clips_size = 0
        clip_files = []
        for clip in clips:
            fp = clip.get("file_path")
            if fp:
                try:
                    size = Path(fp).stat().st_size if Path(fp).exists() else 0
                except OSError:
                    size = 0
                task_clips_size += size
                clip_files.append({
                    "filename": clip.get("filename"),
                    "size": size,
                    "id": clip.get("id"),
                    "available": Path(fp).exists() if fp else False,
                })

        # Check source video
        task_detail = await task_service.task_repo.get_task_by_id(db, task_id)
        source_url = (task_detail or {}).get("source_url", "") or ""
        source_type = (task_detail or {}).get("source_type", "youtube") or "youtube"
        source_video_path = _find_source_video(source_url, source_type, temp_root)
        source_video_size = 0
        if source_video_path:
            try:
                source_video_size = source_video_path.stat().st_size
            except OSError:
                pass

        tasks_with_files.append({
            **t,
            "files_size": task_clips_size + source_video_size,
            "clips_size": task_clips_size,
            "source_video_size": source_video_size,
            "source_video_available": source_video_path is not None,
            "clips": clip_files,
        })

    return {
        "disk": {
            "total": disk_total,
            "used": disk_used,
            "free": disk_free,
        },
        "breakdown": {
            "clips": clips_size,
            "uploads": uploads_size,
        },
        "tasks": tasks_with_files,
    }


@router.delete("/storage/cleanup")
async def cleanup_orphaned_files(request: Request, db: AsyncSession = Depends(get_db)):
    """Delete clip files on disk that are no longer referenced by any task."""
    _get_user_id_from_headers(request)
    cfg = get_config()
    clips_dir = Path(cfg.temp_dir) / "clips"

    if not clips_dir.exists():
        return {"deleted_files": 0, "freed_bytes": 0}

    # Collect all known file paths from DB
    from sqlalchemy import text
    result = await db.execute(text("SELECT file_path FROM generated_clips WHERE file_path IS NOT NULL"))
    known_paths = {row[0] for row in result.fetchall()}

    deleted = 0
    freed = 0
    for f in clips_dir.iterdir():
        if f.is_file() and str(f) not in known_paths:
            try:
                freed += f.stat().st_size
                f.unlink()
                deleted += 1
            except OSError as exc:
                logger.warning(f"Could not delete orphan {f}: {exc}")

    return {"deleted_files": deleted, "freed_bytes": freed}
