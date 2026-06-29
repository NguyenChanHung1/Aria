import asyncio
import json
import logging
from datetime import datetime

import redis.asyncio as redis

from agent.config import settings
from agent.models import SongBrief, SongProject

logger = logging.getLogger(__name__)


class ProjectStore:
    """Redis-backed project store with in-process SSE fan-out."""

    def __init__(self):
        self._redis: redis.Redis | None = None
        self._subscribers: dict[str, list[asyncio.Queue[SongProject]]] = {}

    async def connect(self) -> None:
        self._redis = redis.from_url(settings.redis_url, decode_responses=True)

    async def disconnect(self) -> None:
        if self._redis:
            await self._redis.aclose()

    def _key(self, project_id: str) -> str:
        return f"aria:project:{project_id}"

    async def subscribe(self, project_id: str) -> asyncio.Queue[SongProject]:
        queue: asyncio.Queue[SongProject] = asyncio.Queue()
        self._subscribers.setdefault(project_id, []).append(queue)
        return queue

    def unsubscribe(self, project_id: str, queue: asyncio.Queue[SongProject]) -> None:
        subs = self._subscribers.get(project_id, [])
        if queue in subs:
            subs.remove(queue)

    async def _notify(self, project: SongProject) -> None:
        for queue in self._subscribers.get(project.id, []):
            await queue.put(project)

    async def create(self, brief: SongBrief) -> SongProject:
        project = SongProject(brief=brief)
        await self.save(project)
        return project

    async def save(self, project: SongProject) -> None:
        assert self._redis is not None
        project.updated_at = datetime.utcnow()
        await self._redis.set(
            self._key(project.id),
            project.model_dump_json(),
            ex=60 * 60 * 24 * 7,
        )
        await self._notify(project)

    async def get(self, project_id: str) -> SongProject | None:
        assert self._redis is not None
        raw = await self._redis.get(self._key(project_id))
        if not raw:
            return None
        return SongProject(**json.loads(raw))


store = ProjectStore()
