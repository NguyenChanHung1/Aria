from __future__ import annotations

from typing import Any

import numpy as np
from scipy import signal


KEYS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17)


def analyze(mono: np.ndarray, rate: int, duration: float) -> dict[str, Any]:
    if duration < 2.0 or np.max(np.abs(mono)) < 1e-5:
        return {
            "status": "partial",
            "confidence": "none",
            "summary": {"key": {"root": "unknown", "mode": "unknown", "confidence": "none"}},
            "warnings": ["harmony_not_estimable"],
        }
    frame = max(2048, int(rate * 0.093))
    hop = frame // 2
    _, _, stft = signal.stft(mono, rate, nperseg=frame, noverlap=frame - hop, boundary=None)
    chroma = np.zeros(12)
    freqs = np.fft.rfftfreq(frame, 1 / rate)
    for pitch_class in range(12):
        target = 440 * (2 ** ((pitch_class - 9) / 12))
        band = (freqs >= target * 0.96) & (freqs <= target * 1.04)
        if np.any(band):
            chroma[pitch_class] = float(np.mean(np.abs(stft[band, :])))
    if float(np.sum(chroma)) <= 1e-9:
        return {
            "status": "partial",
            "confidence": "none",
            "summary": {"key": {"root": "unknown", "mode": "unknown", "confidence": "none"}},
            "warnings": ["harmony_not_estimable"],
        }
    chroma = chroma / np.max(chroma)
    major_scores = [float(np.corrcoef(np.roll(MAJOR_PROFILE, shift), chroma)[0, 1]) for shift in range(12)]
    minor_scores = [float(np.corrcoef(np.roll(MINOR_PROFILE, shift), chroma)[0, 1]) for shift in range(12)]
    major_index = int(np.argmax(major_scores))
    minor_index = int(np.argmax(minor_scores))
    if major_scores[major_index] >= minor_scores[minor_index]:
        root, mode, score = KEYS[major_index], "major", major_scores[major_index]
    else:
        root, mode, score = KEYS[minor_index], "minor", minor_scores[minor_index]
    confidence = "high" if score >= 0.75 else "medium" if score >= 0.55 else "low" if score >= 0.35 else "none"
    return {
        "status": "complete" if confidence != "none" else "partial",
        "confidence": confidence,
        "summary": {"key": {"root": root, "mode": mode, "confidence": confidence, "score": round(score, 4)}},
        "warnings": [] if confidence != "none" else ["harmony_low_confidence"],
    }
