from unittest.mock import AsyncMock

import pytest

from src.config import Config
from src.services.task_service import TaskService


@pytest.mark.asyncio
async def test_create_task_with_source_creates_queued_task(monkeypatch):
    service = TaskService(db=AsyncMock())
    service.task_repo.user_exists = AsyncMock(return_value=True)
    service.source_repo.create_source = AsyncMock(return_value="source-1")
    service.task_repo.create_task = AsyncMock(return_value="task-1")
    monkeypatch.setattr(
        service.video_service,
        "determine_source_type",
        lambda _url: "youtube",
    )
    service.video_service.get_video_title = AsyncMock(return_value="Seeded title")

    task_id = await service.create_task_with_source(
        user_id="user-1",
        url="https://www.youtube.com/watch?v=demo",
    )

    assert task_id == "task-1"
    service.task_repo.create_task.assert_awaited_once()

@pytest.mark.asyncio
async def test_create_task_with_source_requires_existing_user():
    service = TaskService(db=AsyncMock())
    service.task_repo.user_exists = AsyncMock(return_value=False)

    with pytest.raises(ValueError):
        await service.create_task_with_source(
            user_id="missing-user",
            url="https://example.com/video.mp4",
        )


def build_clip_result() -> dict:
    return {
        "filename": "clip-1.mp4",
        "path": "/tmp/clip-1.mp4",
        "start_time": "00:00",
        "end_time": "00:10",
        "duration": 10.0,
        "text": "Hook text",
        "relevance_score": 0.95,
        "reasoning": "Strong hook",
    }


def build_task_service() -> TaskService:
    config = Config()
    config.app_base_url = "http://localhost:3000"
    service = TaskService(db=AsyncMock(), config=config)
    service.cache_repo.get_cache = AsyncMock(return_value=None)
    service.cache_repo.upsert_cache = AsyncMock()
    service.task_repo.update_task_runtime_metadata = AsyncMock()
    service.task_repo.update_task_status = AsyncMock()
    service.task_repo.update_task_clips = AsyncMock()
    service.clip_repo.create_clip = AsyncMock(return_value="clip-1")
    service.video_service.create_single_clip = AsyncMock(return_value=build_clip_result())
    service.video_service.apply_single_transition = AsyncMock(
        side_effect=lambda _prev_clip_path, clip_info, _index, _clips_output_dir: clip_info
    )
    service.video_service.process_video_complete = AsyncMock(
        return_value={
            "clips": [build_clip_result()],
            "segments_to_render": [{"start": 0, "end": 10}],
            "video_path": "/tmp/source.mp4",
            "segments": [],
            "summary": None,
            "key_topics": [],
            "transcript": "Transcript",
            "analysis_json": "{}",
        }
    )
    return service


@pytest.mark.asyncio
async def test_process_task_keeps_generated_clips_standalone():
    service = build_task_service()
    service.video_service.create_single_clip = AsyncMock(
        side_effect=[
            {
                **build_clip_result(),
                "filename": "clip-1.mp4",
                "path": "/tmp/clip-1.mp4",
                "duration": 10.0,
            },
            {
                **build_clip_result(),
                "filename": "clip-2.mp4",
                "path": "/tmp/clip-2.mp4",
                "start_time": "00:10",
                "end_time": "00:20",
                "duration": 10.0,
            },
        ]
    )
    service.video_service.process_video_complete = AsyncMock(
        return_value={
            "clips": [build_clip_result(), build_clip_result()],
            "segments_to_render": [
                {"start_time": "00:00", "end_time": "00:10"},
                {"start_time": "00:10", "end_time": "00:20"},
            ],
            "video_path": "/tmp/source.mp4",
            "segments": [],
            "summary": None,
            "key_topics": [],
            "transcript": "Transcript",
            "analysis_json": "{}",
        }
    )

    result = await service.process_task(
        task_id="task-1",
        url="https://www.youtube.com/watch?v=demo",
        source_type="youtube",
    )

    assert result["clips_count"] == 2
    service.video_service.apply_single_transition.assert_not_awaited()
    saved_paths = [
        call.kwargs["file_path"]
        for call in service.clip_repo.create_clip.await_args_list
    ]
    assert saved_paths == ["/tmp/clip-1.mp4", "/tmp/clip-2.mp4"]
