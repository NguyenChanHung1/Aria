import json
import logging

import httpx
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from agent.config import settings
from agent.llm import with_llm_fallback
from agent.models import (
    AgentState,
    CompositionResult,
    LyricsResult,
    MixResult,
    SongPlan,
    SongSection,
)

logger = logging.getLogger(__name__)

LENGTH_TO_BARS = {"short": 64, "medium": 96, "long": 128}


async def plan_song(state: AgentState) -> AgentState:
    """Turn a non-expert brief into a structured production plan."""
    project = state.project
    project.stage = "planning"
    brief = project.brief

    plan = await with_llm_fallback(
        lambda: _plan_with_llm(brief),
        lambda: _plan_fallback(brief),
        label="planning",
    )

    project.plan = plan
    project.stage = "lyrics"
    return state


async def _plan_with_llm(brief) -> SongPlan:
    llm = ChatOpenAI(model=settings.openai_model, api_key=settings.openai_api_key)
    system = SystemMessage(
        content=(
            "You are a friendly music producer helping beginners. "
            "Return ONLY valid JSON matching this schema: "
            '{"title": str, "summary": str, "bpm": int, "key": str, '
            '"structure": [{"name": str, "bars": int, "description": str}], '
            '"instrumentation": [str], "production_notes": [str]}'
        )
    )
    user = HumanMessage(
        content=(
            f"Idea: {brief.idea}\n"
            f"Mood: {brief.mood}\nGenre: {brief.genre}\n"
            f"Length: {brief.length}\nVocals: {brief.vocal_style}\n"
            f"Language: {brief.language}"
        )
    )
    response = await llm.ainvoke([system, user])
    data = json.loads(response.content)
    return SongPlan(**data)


def _plan_fallback(brief) -> SongPlan:
    title = brief.title or _title_from_idea(brief.idea)
    total_bars = LENGTH_TO_BARS.get(brief.length, 96)
    return SongPlan(
        title=title,
        summary=f"A {brief.mood} {brief.genre} song inspired by: {brief.idea}",
        bpm=_default_bpm(brief.genre),
        key="C major",
        structure=[
            SongSection(name="Intro", bars=8, description="Sparse instrumentation, set the mood"),
            SongSection(name="Verse 1", bars=16, description="Tell the story, keep arrangement light"),
            SongSection(name="Chorus", bars=16, description="Catchy hook, fuller arrangement"),
            SongSection(name="Verse 2", bars=16, description="Develop the narrative"),
            SongSection(name="Chorus", bars=16, description="Repeat hook with slight variation"),
            SongSection(name="Bridge", bars=8, description="Contrast section, build tension"),
            SongSection(name="Outro", bars=total_bars - 80, description="Gentle fade or resolve"),
        ],
        instrumentation=_default_instruments(brief.genre),
        production_notes=[
            f"Target mood: {brief.mood}",
            f"Vocal style: {brief.vocal_style}",
            "Keep mix clean for first-time listeners",
        ],
    )


def _title_from_idea(idea: str) -> str:
    words = idea.split()[:4]
    return " ".join(words).title() or "Untitled Song"


def _default_bpm(genre: str) -> int:
    return {
        "pop": 120,
        "rock": 130,
        "hip-hop": 90,
        "r-and-b": 85,
        "electronic": 128,
        "folk": 100,
        "jazz": 110,
        "country": 105,
    }.get(genre, 120)


def _default_instruments(genre: str) -> list[str]:
    base = ["drums", "bass", "vocals"]
    extras = {
        "pop": ["synth pads", "electric piano"],
        "rock": ["electric guitar", "acoustic guitar"],
        "hip-hop": ["808 bass", "sample chops"],
        "r-and-b": ["Rhodes piano", "sub bass"],
        "electronic": ["synth lead", "arpeggiator"],
        "folk": ["acoustic guitar", "harmonica"],
        "jazz": ["upright bass", "brass section"],
        "country": ["acoustic guitar", "pedal steel"],
    }
    return base + extras.get(genre, ["piano"])


async def generate_lyrics(state: AgentState) -> AgentState:
    project = state.project
    project.stage = "lyrics"
    assert project.plan is not None

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            f"{settings.lyrics_service_url}/generate",
            json={
                "brief": project.brief.model_dump(),
                "plan": project.plan.model_dump(),
            },
        )
        response.raise_for_status()
        project.lyrics = LyricsResult(**response.json())

    project.stage = "composition"
    return state


async def compose_music(state: AgentState) -> AgentState:
    project = state.project
    project.stage = "composition"
    assert project.plan is not None and project.lyrics is not None

    async with httpx.AsyncClient(timeout=180.0) as client:
        response = await client.post(
            f"{settings.composition_service_url}/compose",
            json={
                "brief": project.brief.model_dump(),
                "plan": project.plan.model_dump(),
                "lyrics": project.lyrics.model_dump(),
                "project_id": project.id,
            },
        )
        response.raise_for_status()
        project.composition = CompositionResult(**response.json())

    project.stage = "mixing"
    return state


async def mix_audio(state: AgentState) -> AgentState:
    project = state.project
    assert project.composition is not None and project.plan is not None

    async with httpx.AsyncClient(timeout=180.0) as client:
        response = await client.post(
            f"{settings.mixing_service_url}/mix",
            json={
                "project_id": project.id,
                "plan": project.plan.model_dump(),
                "composition": project.composition.model_dump(),
            },
        )
        response.raise_for_status()
        project.mix = MixResult(**response.json())

    project.stage = "complete"
    return state


async def handle_failure(state: AgentState, error: str) -> AgentState:
    project = state.project
    project.stage = "failed"
    project.error = error
    logger.exception("Pipeline failed for project %s: %s", project.id, error)
    return state
