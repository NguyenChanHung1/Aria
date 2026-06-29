from langgraph.graph import END, StateGraph

from agent.models import AgentState, SongProject
from agent.nodes import compose_music, generate_lyrics, mix_audio, plan_song
from agent.state import GraphState


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


async def run_mixing(state: GraphState) -> GraphState:
    agent = AgentState(project=state["project"])
    result = await mix_audio(agent)
    return {"project": result.project}


def build_song_pipeline():
    """
    LangGraph pipeline: plan → lyrics → compose → mix.

  Each node is a specialist step the agent walks non-experts through.
    """
    graph = StateGraph(GraphState)

    graph.add_node("plan", run_planning)
    graph.add_node("lyrics", run_lyrics)
    graph.add_node("compose", run_composition)
    graph.add_node("mix", run_mixing)

    graph.set_entry_point("plan")
    graph.add_edge("plan", "lyrics")
    graph.add_edge("lyrics", "compose")
    graph.add_edge("compose", "mix")
    graph.add_edge("mix", END)

    return graph.compile()


async def run_pipeline(project: SongProject) -> SongProject:
    pipeline = build_song_pipeline()
    result = await pipeline.ainvoke({"project": project})
    return result["project"]
