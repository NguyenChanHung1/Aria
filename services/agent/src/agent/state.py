from datetime import datetime
from typing import TypedDict

from agent.models import AgentState, SongProject


class GraphState(TypedDict):
    project: SongProject


def to_graph_state(state: AgentState) -> GraphState:
    return {"project": state.project}


def from_graph_state(graph_state: GraphState) -> AgentState:
    return AgentState(project=graph_state["project"])


def touch(project: SongProject) -> SongProject:
    project.updated_at = datetime.utcnow()
    return project
