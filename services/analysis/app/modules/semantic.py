from __future__ import annotations

from typing import Any


def analyze(classification_report: dict[str, Any], interpretation: dict[str, Any]) -> dict[str, Any]:
    source_types = [item.get("value") for item in classification_report.get("sourceType") or [] if item.get("value")]
    tags = [value for value in source_types[:3] if value]
    if interpretation.get("sourceType") and interpretation["sourceType"] not in tags:
        tags.insert(0, interpretation["sourceType"])
    return {
        "status": "complete",
        "confidence": "medium",
        "summary": {"tags": tags, "musicScope": (classification_report.get("musicScope") or [{}])[0].get("value"), "intendedUses": interpretation.get("intendedUses") or []},
        "warnings": list(classification_report.get("warnings") or []),
    }
