from __future__ import annotations

from typing import Any

import numpy as np


def analyze(mono: np.ndarray, rate: int, duration: float) -> dict[str, Any]:
    if duration < 1.0 or np.max(np.abs(mono)) < 1e-5:
        return {
            "status": "abstained",
            "confidence": "none",
            "summary": {"reason": "melody_extraction_not_enabled_v1"},
            "warnings": ["melody_abstained"],
        }
    return {
        "status": "abstained",
        "confidence": "none",
        "summary": {"reason": "melody_extraction_not_enabled_v1", "pitchRangeHz": None},
        "warnings": ["melody_abstained"],
    }
