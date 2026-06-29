import json
from datetime import datetime

import redis.asyncio as redis

from agent.config import settings
from agent.models import SongBrief, SongProject


class ProjectStore:
    """Redis-backed project store for pipeline state and polling."""

    def __init__(self):
        self._redis: redis.Redis | None = None

    async def connect(self) -> None:
        self._redis = redis.from_url(settings.redis_url, decode_responses=True)

    async def disconnect(self) -> None:
        if self._redis:
            await self._redis.aclose()

    def _key(self, project_id: str) -> str:
        return f"aria:project:{project_id}"

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

    async def get(self, project_id: str) -> SongProject | None:
        assert self._redis is not None
        raw = await self._redis.get(self._key(project_id))
        if not raw:
            return None
        return SongProject(**json.loads(raw))


store = ProjectStore()
