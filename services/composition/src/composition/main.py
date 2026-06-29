from pathlib import Path
from typing import Any

import numpy as np
from fastapi import FastAPI
from midiutil import MIDIFile
from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    output_dir: str = "outputs"


settings = Settings()
app = FastAPI(title="Aria Composition", version="0.1.0")

# Simple chord progressions by mood (scale degrees in major key)
MOOD_CHORDS = {
    "happy": [0, 5, 7, 0],
    "sad": [9, 7, 0, 5],
    "energetic": [0, 7, 5, 0],
    "chill": [0, 9, 5, 7],
    "romantic": [0, 5, 9, 7],
    "epic": [0, 7, 9, 5],
    "mysterious": [9, 5, 0, 7],
}

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


class ComposeRequest(BaseModel):
    brief: dict[str, Any]
    plan: dict[str, Any]
    lyrics: dict[str, Any]
    project_id: str


class ComposeResponse(BaseModel):
    midi_path: str
    stem_paths: list[str]
    instrumental_preview_path: str
    duration_seconds: float


@app.get("/health")
async def health():
    return {"status": "ok", "service": "composition"}


@app.post("/compose", response_model=ComposeResponse)
async def compose(request: ComposeRequest):
    """
    Generate a MIDI arrangement and placeholder audio stems.

    In production, swap the MIDI generator for MusicGen, Stable Audio,
    or a hosted API (Suno, Udio) while keeping this interface stable.
    """
    plan = request.plan
    brief = request.brief
    bpm = plan.get("bpm", 120)
    mood = brief.get("mood", "happy")
    project_id = request.project_id

    out_dir = Path(settings.output_dir) / project_id
    out_dir.mkdir(parents=True, exist_ok=True)

    midi_path = out_dir / "arrangement.mid"
    duration = _write_midi(midi_path, plan, bpm, mood)

    stem_paths = []
    for instrument in ["drums", "bass", "chords", "melody"]:
        stem_path = out_dir / f"stem_{instrument}.wav"
        _write_placeholder_wav(stem_path, duration, seed=hash(instrument) % 1000)
        stem_paths.append(str(stem_path))

    preview_path = out_dir / "instrumental_preview.wav"
    _write_instrumental_preview(preview_path, stem_paths)

    return ComposeResponse(
        midi_path=str(midi_path),
        stem_paths=stem_paths,
        instrumental_preview_path=str(preview_path),
        duration_seconds=duration,
    )


def _write_midi(path: Path, plan: dict, bpm: int, mood: str) -> float:
    midi = MIDIFile(4)
    track = 0
    channel = 0
    midi.addTrackName(track, 0, plan.get("title", "Song"))
    midi.addTempo(track, 0, bpm)

    chords = MOOD_CHORDS.get(mood, MOOD_CHORDS["happy"])
    root_midi = 60  # C4
    time = 0.0
    bar_duration = 4.0  # 4 beats per bar in 4/4

    for section in plan.get("structure", []):
        bars = section.get("bars", 8)
        for bar in range(bars):
            chord_root = root_midi + chords[bar % len(chords)]
            # Bass note
            midi.addNote(1, 1, chord_root - 12, time, bar_duration, 90)
            # Chord tones
            for i, offset in enumerate([0, 4, 7]):
                midi.addNote(2, 2, chord_root + offset, time, bar_duration, 70 - i * 10)
            # Simple melody
            melody_note = chord_root + 7 + (bar % 3) * 2
            midi.addNote(3, 3, melody_note, time, bar_duration * 0.5, 80)
            time += bar_duration

    with open(path, "wb") as f:
        midi.writeFile(f)

    return time * (60.0 / bpm)


def _write_placeholder_wav(path: Path, duration: float, seed: int = 42) -> None:
    """Write a minimal valid WAV file (sine tone) as a stem placeholder."""
    import struct
    import wave

    sample_rate = 44100
    n_samples = int(sample_rate * min(duration, 30.0))
    rng = np.random.default_rng(seed)
    freq = 220.0 + (seed % 200)
    t = np.arange(n_samples) / sample_rate
    audio = (0.2 * np.sin(2 * np.pi * freq * t) * rng.uniform(0.8, 1.0, n_samples)).astype(
        np.float32
    )

    with wave.open(str(path), "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        pcm = (audio * 32767).astype(np.int16)
        wf.writeframes(struct.pack(f"<{len(pcm)}h", *pcm))


def _write_instrumental_preview(path: Path, stem_paths: list[str]) -> None:
    """Combine instrumental stems into a listenable preview for the web UI."""
    import struct
    import wave

    gains = {"drums": 1.0, "bass": 0.85, "chords": 0.7, "melody": 0.75}
    mixed: np.ndarray | None = None
    sample_rate = 44100

    for stem_path in stem_paths:
        stem_name = Path(stem_path).stem.replace("stem_", "")
        with wave.open(stem_path, "r") as wf:
            sr = wf.getframerate()
            sample_rate = sr
            raw = wf.readframes(wf.getnframes())
            audio = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0

        gain = gains.get(stem_name, 0.8)
        audio = audio * gain
        if mixed is None:
            mixed = audio
        else:
            n = min(len(mixed), len(audio))
            mixed = mixed[:n] + audio[:n]

    if mixed is None:
        return

    peak = np.max(np.abs(mixed)) or 1.0
    mixed = (mixed / peak * 0.9).astype(np.float32)
    pcm = (mixed * 32767).astype(np.int16)

    with wave.open(str(path), "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(struct.pack(f"<{len(pcm)}h", *pcm))
