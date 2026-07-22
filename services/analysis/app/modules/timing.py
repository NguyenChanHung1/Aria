from __future__ import annotations

from typing import Any


def analyze(acoustic_report: dict[str, Any], duration: float) -> dict[str, Any]:
    candidates = acoustic_report.get("tempoCandidates") or []
    warnings = list(acoustic_report.get("warnings") or [])
    tempo = None
    confidence = "none"
    if candidates:
        top = candidates[0]
        tempo = {"bpm": top["bpm"], "confidence": "medium", "candidates": candidates[:3]}
        confidence = "medium"
        if "tempo_ambiguous" in warnings:
            tempo["confidence"] = "low"
            confidence = "low"
        elif top.get("strength", 0) >= 0.35:
            tempo["confidence"] = "high"
            confidence = "high"
    return {
        "status": "complete" if tempo else "partial",
        "confidence": confidence,
        "summary": {
            "tempo": tempo,
            "timeSignature": {"numerator": 4, "denominator": 4, "confidence": "low"},
            "durationSeconds": round(duration, 6),
        },
        "warnings": warnings,
    }
