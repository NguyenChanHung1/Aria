import struct
import wave
from pathlib import Path
from typing import Any

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict
from scipy import signal


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    output_dir: str = "outputs"


settings = Settings()
app = FastAPI(title="Aria Mixing", version="0.1.0")

# Stem gain presets tuned for beginner-friendly balance
STEM_GAINS = {
    "drums": 1.0,
    "bass": 0.85,
    "chords": 0.7,
    "melody": 0.75,
}


class MixRequest(BaseModel):
    project_id: str
    plan: dict[str, Any]
    composition: dict[str, Any]


class MixResponse(BaseModel):
    audio_path: str
    format: str = "wav"
    duration_seconds: float
    loudness_lufs: float


@app.get("/health")
async def health():
    return {"status": "ok", "service": "mixing"}


@app.post("/mix", response_model=MixResponse)
async def mix(request: MixRequest):
    """
    Combine stems, apply EQ/compression, and normalize loudness.

    Production path: integrate pyloudnorm + pedalboard or a DAW automation API.
    """
    composition = request.composition
    stem_paths = composition.get("stem_paths", [])
    if not stem_paths:
        raise HTTPException(status_code=400, detail="No stems to mix")

    out_dir = Path(settings.output_dir) / request.project_id
    out_dir.mkdir(parents=True, exist_ok=True)
    output_path = out_dir / "final_mix.wav"

    mixed, sample_rate, duration = _mix_stems(stem_paths)
    mixed = _apply_master_chain(mixed, sample_rate)
    lufs = _estimate_lufs(mixed, sample_rate)
    mixed = _normalize_to_lufs(mixed, sample_rate, target_lufs=-14.0)

    _write_wav(output_path, mixed, sample_rate)

    return MixResponse(
        audio_path=str(output_path),
        format="wav",
        duration_seconds=duration,
        loudness_lufs=round(lufs, 1),
    )


def _read_wav(path: str) -> tuple[np.ndarray, int]:
    with wave.open(path, "r") as wf:
        sample_rate = wf.getframerate()
        n_channels = wf.getnchannels()
        raw = wf.readframes(wf.getnframes())
        audio = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
        if n_channels > 1:
            audio = audio.reshape(-1, n_channels).mean(axis=1)
    return audio, sample_rate


def _write_wav(path: Path, audio: np.ndarray, sample_rate: int) -> None:
    audio = np.clip(audio, -1.0, 1.0)
    pcm = (audio * 32767).astype(np.int16)
    with wave.open(str(path), "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(struct.pack(f"<{len(pcm)}h", *pcm))


def _mix_stems(stem_paths: list[str]) -> tuple[np.ndarray, int, float]:
    mixed: np.ndarray | None = None
    sample_rate = 44100

    for path in stem_paths:
        audio, sr = _read_wav(path)
        sample_rate = sr
        stem_name = Path(path).stem.replace("stem_", "")
        gain = STEM_GAINS.get(stem_name, 0.8)
        audio = audio * gain

        if mixed is None:
            mixed = audio
        else:
            min_len = min(len(mixed), len(audio))
            mixed = mixed[:min_len] + audio[:min_len]

    assert mixed is not None
    duration = len(mixed) / sample_rate
    return mixed, sample_rate, duration


def _apply_master_chain(audio: np.ndarray, sample_rate: int) -> np.ndarray:
    """High-pass + gentle low-pass for a cleaner beginner mix."""
    sos_hp = signal.butter(2, 80, btype="high", fs=sample_rate, output="sos")
    audio = signal.sosfilt(sos_hp, audio)
    sos_lp = signal.butter(2, 12000, btype="low", fs=sample_rate, output="sos")
    audio = signal.sosfilt(sos_lp, audio)
    return audio


def _estimate_lufs(audio: np.ndarray, sample_rate: int) -> float:
    rms = np.sqrt(np.mean(audio**2) + 1e-12)
    return 20 * np.log10(rms + 1e-12) - 0.691


def _normalize_to_lufs(audio: np.ndarray, sample_rate: int, target_lufs: float) -> np.ndarray:
    current = _estimate_lufs(audio, sample_rate)
    gain_db = target_lufs - current
    gain = 10 ** (gain_db / 20)
    return np.clip(audio * gain, -1.0, 1.0)
