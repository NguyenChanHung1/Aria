from langgraph.graph import END, StateGraph

from agent.models import AgentState, SongProject
from agent.nodes import compose_music, generate_lyrics, mix_audio, plan_song
from agent.state import GraphState

PIPELINE_NODES = ("plan", "lyrics", "compose")


async def run_planning(state: GraphState) -> GraphState:
    agent = AgentState(project=state["project"])
    result = await plan_song(agent)
    return {"project": result.project}


async def run_lyrics(state: GraphState) -> GraphState:
    agent = AgentState(project=state["project"])
    result = await generate_lyrics(agent)
    return {"project": result.project}


async def run_composition(state: GraphState) -> GraphState:
    agent = AgentState(project=state["project"])
    result = await compose_music(agent)
    return {"project": result.project}


def build_compose_pipeline():
    """
    LangGraph pipeline through composition: plan → lyrics → compose.

    Mixing runs separately so the web UI can stream the instrumental preview
    while the mixing service works in parallel.
    """
    graph = StateGraph(GraphState)

    graph.add_node("plan", run_planning)
    graph.add_node("lyrics", run_lyrics)
    graph.add_node("compose", run_composition)

    graph.set_entry_point("plan")
    graph.add_edge("plan", "lyrics")
    graph.add_edge("lyrics", "compose")
    graph.add_edge("compose", END)

    return graph.compile()


async def run_compose_pipeline(project: SongProject) -> SongProject:
    pipeline = build_compose_pipeline()
    result = await pipeline.ainvoke({"project": project})
    return result["project"]


async def run_mixing_step(project: SongProject) -> SongProject:
    """Final mixing step — invoked in parallel after composition is saved."""
    agent = AgentState(project=project)
    result = await mix_audio(agent)
    return result.project
