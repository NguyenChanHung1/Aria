from __future__ import annotations

from typing import Any


def analyze(acoustic_report: dict[str, Any]) -> dict[str, Any]:
    features = acoustic_report.get("features") or {}
    centroid = features.get("spectralCentroidHz") or {}
    bandwidth = features.get("spectralBandwidthHz") or {}
    flatness = features.get("spectralFlatness") or {}
    return {
        "status": "complete",
        "confidence": "medium",
        "summary": {
            "spectralCentroidHz": centroid,
            "spectralBandwidthHz": bandwidth,
            "spectralFlatness": flatness,
            "brightness": "bright" if (centroid.get("mean") or 0) > 2500 else "dark",
        },
        "warnings": list(acoustic_report.get("warnings") or []),
    }
