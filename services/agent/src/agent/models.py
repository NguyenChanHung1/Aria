from pydantic import BaseModel, Field
from typing import Literal
from datetime import datetime
import uuid


Mood = Literal["happy", "sad", "energetic", "chill", "romantic", "epic", "mysterious"]
Genre = Literal["pop", "rock", "hip-hop", "r-and-b", "electronic", "folk", "jazz", "country"]
SongLength = Literal["short", "medium", "long"]
VocalStyle = Literal["male", "female", "duet", "instrumental"]
PipelineStage = Literal["planning", "lyrics", "composition", "mixing", "complete", "failed"]


class SongBrief(BaseModel):
    project_id: str | None = None
    title: str | None = None
    idea: str = Field(..., min_length=3, description="User's song idea in plain language")
    mood: Mood
    genre: Genre
    length: SongLength = "medium"
    vocal_style: VocalStyle = "female"
    language: str = "en"
    source_lyrics: str | None = Field(default=None, max_length=50_000)
    global_prompt: str = ""
    input_asset: dict[str, object] | None = None


class SongSection(BaseModel):
    name: str
    bars: int
    description: str


class SongPlan(BaseModel):
    title: str
    summary: str
    bpm: int = Field(ge=60, le=200)
    key: str
    structure: list[SongSection]
    instrumentation: list[str]
    production_notes: list[str]


class LyricsResult(BaseModel):
    full_text: str
    sections: dict[str, str]


class CompositionResult(BaseModel):
    midi_path: str
    stem_paths: list[str]
    instrumental_preview_path: str
    duration_seconds: float


class MixResult(BaseModel):
    audio_path: str
    format: Literal["wav", "mp3"] = "wav"
    duration_seconds: float
    loudness_lufs: float


class SongProject(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    brief: SongBrief
    stage: PipelineStage = "planning"
    plan: SongPlan | None = None
    lyrics: LyricsResult | None = None
    composition: CompositionResult | None = None
    mix: MixResult | None = None
    error: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class AgentState(BaseModel):
    """LangGraph state passed between pipeline nodes."""

    project: SongProject

    class Config:
        arbitrary_types_allowed = True
