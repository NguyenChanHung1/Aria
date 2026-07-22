from __future__ import annotations

from typing import Any

import numpy as np
from scipy import signal


def analyze(mono: np.ndarray, rate: int, duration: float) -> dict[str, Any]:
    frame = max(1024, int(rate * 0.05))
    hop = frame // 2
    rms = []
    for start in range(0, max(1, len(mono) - frame), hop):
        window = mono[start : start + frame]
        rms.append(float(np.sqrt(np.mean(window**2))))
    if not rms:
        return {"status": "partial", "confidence": "none", "summary": {"sections": []}, "warnings": ["structure_not_estimable"]}

    rms_arr = np.array(rms)
    threshold = float(np.percentile(rms_arr, 60))
    boundaries = [0.0]
    in_section = rms_arr[0] >= threshold
    for index, value in enumerate(rms_arr[1:], start=1):
        active = value >= threshold
        if active != in_section:
            boundaries.append(index * hop / rate)
            in_section = active
    boundaries.append(duration)
    sections: list[dict[str, Any]] = []
    for index in range(len(boundaries) - 1):
        start = round(boundaries[index], 3)
        end = round(boundaries[index + 1], 3)
        if end - start < 1.0:
            continue
        segment = mono[int(start * rate) : int(end * rate)]
        energy = float(np.sqrt(np.mean(segment**2))) if len(segment) else 0.0
        sections.append(
            {
                "id": f"section-{len(sections) + 1}",
                "startSeconds": start,
                "endSeconds": end,
                "label": "high_energy" if energy >= threshold else "low_energy",
                "energy": round(energy, 6),
                "semanticTags": [],
            }
        )
    if not sections:
        sections = [{"id": "section-1", "startSeconds": 0.0, "endSeconds": round(duration, 3), "label": "full", "energy": round(float(np.mean(rms_arr)), 6), "semanticTags": []}]
    return {
        "status": "complete",
        "confidence": "medium" if len(sections) > 1 else "low",
        "summary": {"sections": sections, "segmentCount": len(sections)},
        "warnings": [],
    }
