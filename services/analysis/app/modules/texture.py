from __future__ import annotations

from typing import Any


def analyze(acoustic_report: dict[str, Any]) -> dict[str, Any]:
    features = acoustic_report.get("features") or {}
    rms = features.get("windowedRms") or {}
    zcr = features.get("zeroCrossingRate") or {}
    flatness = features.get("spectralFlatness") or {}
    density = "dense" if (rms.get("std") or 0) > 0.05 else "sparse"
    noisiness = "noisy" if (flatness.get("mean") or 0) > 0.35 else "tonal"
    return {
        "status": "complete",
        "confidence": "medium",
        "summary": {"density": density, "noisiness": noisiness, "windowedRms": rms, "zeroCrossingRate": zcr},
        "warnings": [],
    }
