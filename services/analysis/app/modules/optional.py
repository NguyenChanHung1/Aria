from __future__ import annotations

from typing import Any


def abstain(name: str, optional_modules: set[str]) -> dict[str, Any]:
    if name not in optional_modules:
        return {
            "status": "failed",
            "confidence": "none",
            "summary": {"reason": f"{name}_module_disabled"},
            "warnings": [f"{name}_disabled"],
        }
    return {
        "status": "abstained",
        "confidence": "none",
        "summary": {"reason": f"{name}_not_enabled_v1"},
        "warnings": [f"{name}_abstained"],
    }
