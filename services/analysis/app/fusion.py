from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def fuse_modules(
    *,
    input_id: str,
    duration: float,
    acoustic_report: dict[str, Any],
    modules: dict[str, dict[str, Any]],
    lineage: dict[str, Any],
) -> tuple[dict[str, Any], str]:
    sections = modules.get("structure", {}).get("summary", {}).get("sections") or []
    tempo = modules.get("timing", {}).get("summary", {}).get("tempo")
    key = modules.get("harmony", {}).get("summary", {}).get("key")
    semantic_tags = modules.get("semantic", {}).get("summary", {}).get("tags") or []

    uncertainties: list[dict[str, Any]] = []
    conflicts: list[dict[str, Any]] = []

    if modules.get("timing", {}).get("warnings"):
        uncertainties.append({"field": "global.tempo", "reason": "tempo_ambiguous", "moduleIds": ["timing"]})
    if modules.get("harmony", {}).get("confidence") == "none":
        uncertainties.append({"field": "global.key", "reason": "insufficient_harmonic_evidence", "moduleIds": ["harmony"]})
    if modules.get("melody", {}).get("status") == "abstained":
        uncertainties.append({"field": "global.melody", "reason": modules["melody"].get("summary", {}).get("reason", "abstained"), "moduleIds": ["melody"]})

    module_statuses = [modules[name].get("status", "failed") for name in modules]
    if any(status == "failed" for status in module_statuses):
        workflow_status = "partial" if any(status == "complete" for status in module_statuses) else "failed"
    elif any(status in {"abstained", "partial"} for status in module_statuses):
        workflow_status = "partial"
    else:
        workflow_status = "succeeded"

    loudness = acoustic_report.get("levels") or {}
    payload = {
        "schemaVersion": "3.0.0",
        "inputId": input_id,
        "version": 1,
        "global": {
            "durationSeconds": round(duration, 6),
            "tempo": tempo,
            "key": key,
            "timeSignature": modules.get("timing", {}).get("summary", {}).get("timeSignature"),
            "loudness": {
                "integratedLufs": loudness.get("integratedLufs"),
                "samplePeakDbfs": loudness.get("samplePeakDbfs"),
            },
            "semanticTags": semantic_tags,
        },
        "sections": sections,
        "modules": {
            name: {
                "status": modules[name].get("status", "failed"),
                "confidence": modules[name].get("confidence", "none"),
                "summary": modules[name].get("summary", {}),
                "warnings": modules[name].get("warnings", []),
            }
            for name in [
                "separation",
                "transcription",
                "timing",
                "melody",
                "harmony",
                "structure",
                "timbre",
                "texture",
                "semantic",
            ]
        },
        "fusion": {"uncertainties": uncertainties, "conflicts": conflicts},
        "lineage": {
            "inputId": input_id,
            "workingArtifactId": lineage.get("workingArtifactId"),
            "interpretationArtifactId": lineage.get("interpretationArtifactId"),
            "interpretationVersion": lineage.get("interpretationVersion"),
            "sourceArtifactIds": [],
        },
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    return payload, workflow_status
