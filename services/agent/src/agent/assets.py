from pathlib import Path

from fastapi import HTTPException

from agent.config import settings
from agent.models import SongProject


def resolve_asset(project: SongProject, asset: str) -> Path:
    """Map a logical asset name to a file on the shared outputs volume."""
    if asset == "instrumental":
        if not project.composition:
            raise HTTPException(status_code=404, detail="Instrumental not ready yet")
        path = Path(project.composition.instrumental_preview_path)
    elif asset == "mix":
        if not project.mix:
            raise HTTPException(status_code=404, detail="Final mix not ready yet")
        path = Path(project.mix.audio_path)
    elif asset == "midi":
        if not project.composition:
            raise HTTPException(status_code=404, detail="MIDI not ready yet")
        path = Path(project.composition.midi_path)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown asset: {asset}")

    if not path.is_file():
        # Paths from microservices may be absolute inside their containers;
        # fall back to the shared outputs layout: outputs/{project_id}/...
        fallback = Path(settings.output_dir) / project.id / path.name
        if fallback.is_file():
            return fallback
        raise HTTPException(status_code=404, detail=f"Asset file not found: {path.name}")

    return path
