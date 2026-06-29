import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from agent.graph import run_pipeline
from agent.models import SongBrief, SongProject
from agent.store import store

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await store.connect()
    yield
    await store.disconnect()


app = FastAPI(
    title="Aria Agent",
    description="AI orchestrator for end-to-end song creation",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def _run_pipeline_task(project_id: str) -> None:
    project = await store.get(project_id)
    if not project:
        return
    try:
        updated = await run_pipeline(project)
        await store.save(updated)
    except Exception as exc:
        logger.exception("Pipeline error")
        project.stage = "failed"
        project.error = str(exc)
        await store.save(project)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "agent"}


@app.post("/songs", response_model=dict)
async def create_song(brief: SongBrief, background_tasks: BackgroundTasks):
    """Start a new song project. The agent runs the full pipeline in the background."""
    project = await store.create(brief)
    background_tasks.add_task(_run_pipeline_task, project.id)
    return {"project_id": project.id, "stage": project.stage}


@app.get("/songs/{project_id}")
async def get_song(project_id: str):
    project = await store.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"project": project}


@app.get("/songs/{project_id}/stream")
async def stream_status(project_id: str):
    """Long-poll friendly status endpoint for the web UI."""
    for _ in range(60):
        project = await store.get(project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        if project.stage in ("complete", "failed"):
            return {"project": project}
        await asyncio.sleep(2)
    project = await store.get(project_id)
    return {"project": project}
