import asyncio
import json
import logging
from contextlib import asynccontextmanager

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from agent.assets import resolve_asset
from agent.config import settings
from agent.graph import PIPELINE_NODES, build_compose_pipeline, run_mixing_step
from agent.models import SongBrief, SongProject
from agent.store import store

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Track in-flight mixing tasks to avoid duplicates
_mixing_tasks: dict[str, asyncio.Task] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    await store.connect()
    yield
    await store.disconnect()


app = FastAPI(
    title="Aria Agent",
    description="AI orchestrator for end-to-end song creation",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.web_origin, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ProjectEvent(BaseModel):
    project: SongProject
    node: str | None = None


def _project_event(project: SongProject, node: str | None = None) -> str:
    payload = ProjectEvent(project=project, node=node)
    return f"data: {payload.model_dump_json()}\n\n"


async def _run_compose_pipeline(project_id: str) -> None:
    project = await store.get(project_id)
    if not project:
        return

    try:
        pipeline = build_compose_pipeline()
        state = {"project": project}

        async for update in pipeline.astream(state, stream_mode="updates"):
            for node_name, output in update.items():
                project = output["project"]
                await store.save(project)
                logger.info("Project %s completed node: %s (stage=%s)", project_id, node_name, project.stage)

        _start_mixing_task(project_id)
    except Exception as exc:
        logger.exception("Compose pipeline error for %s", project_id)
        project = await store.get(project_id)
        if project:
            project.stage = "failed"
            project.error = str(exc)
            await store.save(project)


def _start_mixing_task(project_id: str) -> None:
    if project_id in _mixing_tasks and not _mixing_tasks[project_id].done():
        return
    _mixing_tasks[project_id] = asyncio.create_task(_run_mixing_task(project_id))


async def _run_mixing_task(project_id: str) -> None:
    project = await store.get(project_id)
    if not project or not project.composition:
        return

    project.stage = "mixing"
    await store.save(project)

    try:
        updated = await run_mixing_step(project)
        await store.save(updated)
        logger.info("Project %s mixing complete", project_id)
    except Exception as exc:
        logger.exception("Mixing error for %s", project_id)
        project = await store.get(project_id)
        if project:
            project.stage = "failed"
            project.error = str(exc)
            await store.save(project)
    finally:
        _mixing_tasks.pop(project_id, None)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "agent", "pipeline_nodes": list(PIPELINE_NODES)}


@app.post("/songs", response_model=dict)
async def create_song(brief: SongBrief, background_tasks: BackgroundTasks):
    """
    Start a new song project.

    The LangGraph pipeline (plan → lyrics → compose) runs in the background.
    Each node persists state to Redis so the web app can show lyrics and
    instrumental previews as soon as they are ready. Mixing starts automatically
    after composition, in parallel with the user listening to the preview.
    """
    project = await store.create(brief)
    background_tasks.add_task(_run_compose_pipeline, project.id)
    return {"project_id": project.id, "stage": project.stage}


@app.get("/songs/{project_id}")
async def get_song(project_id: str):
    project = await store.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"project": project}


@app.get("/songs/{project_id}/events")
async def stream_events(project_id: str):
    """
    Server-Sent Events stream for live pipeline updates.

    The web app subscribes here instead of polling — each LangGraph node
  save pushes a new event when plan, lyrics, or composition complete.
    """
    project = await store.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    queue = await store.subscribe(project_id)

    async def event_generator():
        try:
            yield _project_event(project, node=None)
            while True:
                try:
                    updated = await asyncio.wait_for(queue.get(), timeout=30.0)
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
                    current = await store.get(project_id)
                    if not current:
                        break
                    if current.stage in ("complete", "failed"):
                        yield _project_event(current, node=None)
                        break
                    continue

                yield _project_event(updated, node=None)
                if updated.stage in ("complete", "failed"):
                    break
        finally:
            store.unsubscribe(project_id, queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/songs/{project_id}/assets/{asset}")
async def get_asset(project_id: str, asset: str):
    """Serve MIDI, instrumental preview, or final mix audio to the web app."""
    project = await store.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    path = resolve_asset(project, asset)
    media_types = {
        "instrumental": "audio/wav",
        "mix": "audio/wav",
        "midi": "audio/midi",
    }
    return FileResponse(path, media_type=media_types.get(asset, "application/octet-stream"))
