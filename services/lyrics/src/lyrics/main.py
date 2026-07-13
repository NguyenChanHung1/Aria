import json
from typing import Any

from fastapi import FastAPI
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from pydantic import BaseModel

from lyrics.config import settings
from lyrics.llm import with_llm_fallback
app = FastAPI(title="Aria Lyrics", version="0.1.0")


class GenerateRequest(BaseModel):
    brief: dict[str, Any]
    plan: dict[str, Any]


class LyricsResponse(BaseModel):
    full_text: str
    sections: dict[str, str]


@app.get("/health")
async def health():
    return {"status": "ok", "service": "lyrics"}


@app.post("/generate", response_model=LyricsResponse)
async def generate(request: GenerateRequest):
    brief = request.brief
    plan = request.plan
    return await with_llm_fallback(
        lambda: _generate_with_llm(brief, plan),
        lambda: _generate_template(brief, plan),
        label="lyrics",
    )


async def _generate_with_llm(brief: dict, plan: dict) -> LyricsResponse:
    llm = ChatOpenAI(model=settings.openai_model, api_key=settings.openai_api_key)
    structure = ", ".join(s["name"] for s in plan.get("structure", []))
    system = SystemMessage(
        content=(
            "You write accessible, singable lyrics for beginners. "
            "Return ONLY JSON: {\"full_text\": str, \"sections\": {\"SectionName\": \"lyrics...\"}}"
        )
    )
    user = HumanMessage(
        content=(
            f"Title: {plan.get('title')}\n"
            f"Idea: {brief.get('idea')}\n"
            f"Mood: {brief.get('mood')}, Genre: {brief.get('genre')}\n"
            f"Structure: {structure}\n"
            f"Language: {brief.get('language', 'en')}\n"
            f"Global producer direction: {brief.get('global_prompt', '')}"
        )
    )
    response = await llm.ainvoke([system, user])
    data = json.loads(response.content)
    return LyricsResponse(**data)


def _generate_template(brief: dict, plan: dict) -> LyricsResponse:
    title = plan.get("title", "Untitled")
    mood = brief.get("mood", "happy")
    idea = brief.get("idea", "a new day")

    sections: dict[str, str] = {}
    for section in plan.get("structure", []):
        name = section["name"]
        if "chorus" in name.lower():
            sections[name] = (
                f"{title}, shining through\n"
                f"Every moment feels brand new\n"
                f"{idea} in everything we do\n"
                f"{title}, this one's for you"
            )
        elif "verse" in name.lower():
            sections[name] = (
                f"Woke up with a {mood} kind of feeling\n"
                f"Chasing dreams, the ceiling's the sky\n"
                f"Every step reveals the meaning\n"
                f"Of the story only you and I"
            )
        elif "bridge" in name.lower():
            sections[name] = (
                "Hold on, don't let go\n"
                "The best is yet to show\n"
                "We'll find our way home"
            )
        else:
            sections[name] = f"(Instrumental — {mood} {name.lower()})"

    full_text = "\n\n".join(f"[{k}]\n{v}" for k, v in sections.items())
    return LyricsResponse(full_text=full_text, sections=sections)
