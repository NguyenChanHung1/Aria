from __future__ import annotations

import hashlib
import io
import json
import math
import os
import tempfile
from pathlib import Path
from typing import Any

import httpx
import numpy as np
import soundfile as sf
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .fusion import fuse_modules
from .modules import harmony, melody, optional, semantic, structure, texture, timbre, timing

SCHEMA = "3.0.0"
ANALYSIS_SCHEMA = "2.0.0"

app = FastAPI(title="Aria Analysis Worker", version="3.0.0")
_model = None
_classes: list[str] | None = None
_weights_hash: str | None = None


class SignedUrl(BaseModel):
    url: str
    headers: dict[str, str] = Field(default_factory=dict)


class ArtifactInput(BaseModel):
    url: str
    headers: dict[str, str] = Field(default_factory=dict)
    checksumSha256: str


class AnalysisRequest(BaseModel):
    schemaVersion: str
    projectId: str
    inputId: str
    workingArtifactId: str
    sourceChecksumSha256: str
    source: SignedUrl
    outputs: dict[str, SignedUrl]


class UnderstandRequest(BaseModel):
    schemaVersion: str
    projectId: str
    inputId: str
    interpretation: dict[str, Any]
    source: SignedUrl
    sourceChecksumSha256: str
    inputs: dict[str, ArtifactInput]
    outputs: dict[str, Any]
    policy: dict[str, Any] = Field(default_factory=dict)
    lineage: dict[str, Any] = Field(default_factory=dict)


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


async def fetch(url: SignedUrl) -> bytes:
    async with httpx.AsyncClient(timeout=180) as client:
        response = await client.get(url.url, headers=url.headers)
        response.raise_for_status()
        return response.content


async def put(url: SignedUrl, body: bytes) -> None:
    async with httpx.AsyncClient(timeout=180) as client:
        response = await client.put(url.url, content=body, headers=url.headers)
        response.raise_for_status()


def summary(values: np.ndarray) -> dict[str, float]:
    return {
        "min": round(float(np.min(values)), 6),
        "max": round(float(np.max(values)), 6),
        "mean": round(float(np.mean(values)), 6),
        "std": round(float(np.std(values)), 6),
    }


def loudness(path: str) -> dict[str, float | None]:
    try:
        import subprocess
        result = subprocess.run(
            ["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", "loudnorm=print_format=json", "-f", "null", "-"],
            capture_output=True,
            text=True,
            check=False,
        )
        text = result.stderr
        start = text.rfind("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            payload = json.loads(text[start:end])
            return {
                "integratedLufs": round(float(payload.get("input_i", 0)), 3),
                "samplePeakDbfs": round(float(payload.get("input_tp", 0)), 3),
            }
    except Exception:
        pass
    return {"integratedLufs": None, "samplePeakDbfs": None}


def acoustic(path: str, matrix: np.ndarray, rate: int) -> dict[str, Any]:
    mono = np.mean(matrix, axis=1)
    channels = matrix.shape[1]
    if len(mono) > rate * 10:
        window = rate * 10
        starts = np.linspace(0, len(mono) - window, 12, dtype=np.int64)
        feature_mono = np.concatenate([mono[start:start + window] for start in starts])
    else:
        feature_mono = mono
    peak = float(np.max(np.abs(matrix))) if matrix.size else 0.0
    from scipy import fftpack, signal

    frame = max(256, int(rate * 0.0464))
    hop = frame // 2
    freqs, _, stft = signal.stft(feature_mono, rate, nperseg=frame, noverlap=frame - hop, boundary=None)
    mag = np.abs(stft) + 1e-12
    power = mag * mag
    rms = np.sqrt(np.mean(power, axis=0))
    crossings = np.not_equal(np.signbit(feature_mono[1:]), np.signbit(feature_mono[:-1])).astype(np.float32)
    crossing_sum = np.concatenate(([0.0], np.cumsum(crossings, dtype=np.float64)))
    zcr = (crossing_sum[frame - 1:] - crossing_sum[: -(frame - 1)])[::hop] / (frame - 1) if len(feature_mono) >= frame else np.array([0.0])
    centroid = np.sum(freqs[:, None] * mag, axis=0) / np.sum(mag, axis=0)
    bandwidth = np.sqrt(np.sum(((freqs[:, None] - centroid) ** 2) * mag, axis=0) / np.sum(mag, axis=0))
    csum = np.cumsum(power, axis=0)
    targets = 0.85 * csum[-1]
    rolloff = freqs[np.argmax(csum >= targets, axis=0)]
    flatness = np.exp(np.mean(np.log(mag), axis=0)) / np.mean(mag, axis=0)
    mel_log = np.log(power[: min(64, power.shape[0]), :])
    mfcc = fftpack.dct(mel_log, axis=0, norm="ortho")[:13]
    floor = np.percentile(rms, 10)
    signal_level = np.percentile(rms, 75)
    estimated_snr = None if floor <= 1e-9 or signal_level <= floor else float(20 * math.log10(signal_level / floor))
    snr = round(estimated_snr, 3) if estimated_snr is not None and estimated_snr >= 3 else None
    onset = np.maximum(0, np.diff(np.sum(mag, axis=0), prepend=0))
    candidates = []
    if np.max(onset) > 0 and len(onset) > 8:
        corr = signal.correlate(onset, onset, mode="full")[len(onset) - 1 :]
        lo, hi = max(1, int(60 / 220 / (hop / rate))), max(2, int(60 / 40 / (hop / rate)))
        peaks, _ = signal.find_peaks(corr[lo : min(hi, len(corr))])
        ranked = sorted(peaks + lo, key=lambda i: corr[i], reverse=True)[:3]
        candidates = [
            {"bpm": round(60 / (lag * hop / rate), 2), "strength": round(float(corr[lag] / max(corr[0], 1e-12)), 4)}
            for lag in ranked
            if corr[lag] / max(corr[0], 1e-12) >= 0.05
        ]
    silence = np.abs(mono) < 10 ** (-60 / 20)
    warnings: list[str] = []
    if np.mean(silence) > 0.8:
        warnings.append("mostly_silent")
    if snr is None:
        warnings.append("snr_not_estimable")
    if not candidates:
        warnings.append("tempo_not_estimable")
    if len(candidates) > 1 and candidates[1]["strength"] > candidates[0]["strength"] * 0.85:
        warnings.append("tempo_ambiguous")
    correlation = None
    if channels == 2:
        correlation = round(float(np.corrcoef(matrix[:, 0], matrix[:, 1])[0, 1]), 6)
        if correlation < -0.2:
            warnings.append("channel_phase_risk")
    return {
        "schemaVersion": ANALYSIS_SCHEMA,
        "profileVersion": "acoustic-v1",
        "durationSeconds": round(len(matrix) / rate, 6),
        "sampleRate": rate,
        "channels": channels,
        "levels": {
            "dcOffset": [round(float(v), 8) for v in np.mean(matrix, axis=0)],
            "rms": round(float(np.sqrt(np.mean(matrix**2))), 8),
            "samplePeakDbfs": round(20 * math.log10(max(peak, 1e-12)), 4),
            "clippingSampleRatio": round(float(np.mean(np.abs(matrix) >= 0.999)), 8),
            **loudness(path),
        },
        "silence": {"thresholdDbfs": -60, "ratio": round(float(np.mean(silence)), 6)},
        "snr": {
            "valueDb": snr,
            "method": "short_time_percentile_v1",
            "confidence": "medium" if snr is not None else "none",
            "reason": None if snr is not None else "noise floor is not separable",
        },
        "tempoCandidates": candidates,
        "channelCorrelation": correlation,
        "features": {
            "analyzedSeconds": round(len(feature_mono) / rate, 3),
            "samplingPolicy": "full_or_12_uniform_10s_v1",
            "windowedRms": summary(rms),
            "zeroCrossingRate": summary(zcr),
            "spectralCentroidHz": summary(centroid),
            "spectralBandwidthHz": summary(bandwidth),
            "spectralRolloff85Hz": summary(rolloff),
            "spectralFlatness": summary(flatness),
            "mfcc": [summary(row) for row in mfcc],
        },
        "warnings": warnings,
    }


def model_assets_hash() -> str:
    root = Path(os.environ.get("TFHUB_CACHE_DIR", "/models/tfhub"))
    digest = hashlib.sha256()
    for item in sorted(root.rglob("*")):
        if item.is_file():
            digest.update(item.relative_to(root).as_posix().encode())
            digest.update(item.read_bytes())
    return digest.hexdigest()


def yamnet(mono: np.ndarray, rate: int) -> tuple[np.ndarray, np.ndarray, list[str], str]:
    global _model, _classes, _weights_hash
    import tensorflow as tf
    import tensorflow_hub as hub

    if _model is None:
        _model = hub.load("https://tfhub.dev/google/yamnet/1")
        class_path = _model.class_map_path().numpy().decode()
        import csv

        with open(class_path, newline="") as handle:
            _classes = [row[2] for row in list(csv.reader(handle))[1:]]
        _weights_hash = model_assets_hash()
    if rate != 16000:
        from scipy import signal

        mono = signal.resample_poly(mono, 16000, rate)
    scores, embeddings, _ = _model(tf.convert_to_tensor(mono.astype(np.float32)))
    return scores.numpy(), embeddings.numpy(), _classes or [], _weights_hash or ""


def classify(scores: np.ndarray, names: list[str], duration: float, warnings: list[str], weights_hash: str) -> dict[str, Any]:
    means = np.mean(scores, axis=0) if len(scores) else np.zeros(len(names))
    groups = {
        "speech": ["Speech", "Conversation", "Narration"],
        "singing": ["Singing", "Choir", "Vocal music"],
        "humming": ["Humming"],
        "beatboxing": ["Beatboxing"],
        "solo_instrument": ["Musical instrument", "Guitar", "Piano", "Violin", "Drum"],
        "mixed_music": ["Music", "Song"],
        "environmental_sound": ["Environmental noise", "Animal", "Vehicle", "Water", "Wind"],
    }
    raw = {
        key: max([float(means[i]) for i, name in enumerate(names) if any(term.lower() in name.lower() for term in terms)] or [0.0])
        for key, terms in groups.items()
    }
    total = sum(raw.values()) or 1.0
    ranked = sorted(
        ({"value": key, "probability": round(value / total, 6)} for key, value in raw.items()),
        key=lambda item: item["probability"],
        reverse=True,
    )
    top = ranked[0] if ranked else {"value": "unknown", "probability": 0.0}
    if top["probability"] < 0.45:
        ranked.insert(0, {"value": "unknown", "probability": round(1 - top["probability"], 6)})
    scope = "full_song" if duration >= 90 else "loop" if duration <= 12 and top["value"] == "mixed_music" else "fragment"
    return {
        "schemaVersion": ANALYSIS_SCHEMA,
        "usability": [{"value": "silence" if "mostly_silent" in warnings else "usable", "probability": 1.0}],
        "sourceType": ranked[:5],
        "musicScope": [{"value": scope, "probability": 0.65}],
        "reviewRecommendation": "needs_review",
        "conflicts": [],
        "warnings": [*warnings, "baseline_not_calibrated"],
        "model": {
            "id": "yamnet-audioset-rule-baseline",
            "version": "1",
            "weightsSha256": weights_hash,
            "preprocessingVersion": "mono-16khz-v1",
            "thresholdPolicyVersion": "baseline-v1",
        },
    }


def load_audio(source: bytes) -> tuple[np.ndarray, int, dict[str, Any]]:
    with tempfile.NamedTemporaryFile(suffix=".wav") as handle:
        handle.write(source)
        handle.flush()
        audio, rate = sf.read(handle.name, dtype="float32", always_2d=True)
        report = acoustic(handle.name, audio, rate)
    return audio, rate, report


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "model": "yamnet/1", "understanding": "v3"}


@app.post("/analyze")
async def analyze(request: AnalysisRequest) -> dict[str, Any]:
    if request.schemaVersion != ANALYSIS_SCHEMA:
        raise HTTPException(400, "unsupported schema version")
    source = await fetch(request.source)
    if sha(source) != request.sourceChecksumSha256:
        raise HTTPException(422, "source checksum mismatch")
    audio, rate, report = load_audio(source)
    mono = np.mean(audio, axis=1)
    scores, embeddings, names, weights_hash = yamnet(mono, rate)
    timestamps = np.arange(len(embeddings), dtype=np.float32) * 0.48
    buffer = io.BytesIO()
    np.savez_compressed(
        buffer,
        embeddings=embeddings.astype(np.float32),
        timestamps=timestamps,
        mean=np.mean(embeddings, axis=0),
        std=np.std(embeddings, axis=0),
    )
    embedding_bytes = buffer.getvalue()
    classification = classify(scores, names, len(audio) / rate, report["warnings"], weights_hash)
    acoustic_bytes = json.dumps(report, separators=(",", ":")).encode()
    classification_bytes = json.dumps(classification, separators=(",", ":")).encode()
    await put(request.outputs["acoustic"], acoustic_bytes)
    await put(request.outputs["embeddings"], embedding_bytes)
    await put(request.outputs["classification"], classification_bytes)
    return {
        "acoustic": {"checksumSha256": sha(acoustic_bytes), "fileSize": len(acoustic_bytes), "payload": report},
        "embeddings": {
            "checksumSha256": sha(embedding_bytes),
            "fileSize": len(embedding_bytes),
            "manifest": {
                "shape": list(embeddings.shape),
                "dtype": "float32",
                "segmentHopSeconds": 0.48,
                "model": "yamnet/1",
                "weightsSha256": weights_hash,
            },
        },
        "classification": {
            "checksumSha256": sha(classification_bytes),
            "fileSize": len(classification_bytes),
            "payload": classification,
        },
    }


@app.post("/understand")
async def understand(request: UnderstandRequest) -> dict[str, Any]:
    if request.schemaVersion != SCHEMA:
        raise HTTPException(400, "unsupported schema version")
    source = await fetch(request.source)
    if sha(source) != request.sourceChecksumSha256:
        raise HTTPException(422, "source checksum mismatch")

    acoustic_bytes = await fetch(SignedUrl(url=request.inputs["acoustic"].url, headers=request.inputs["acoustic"].headers))
    if sha(acoustic_bytes) != request.inputs["acoustic"].checksumSha256:
        raise HTTPException(422, "acoustic checksum mismatch")
    classification_bytes = await fetch(SignedUrl(url=request.inputs["classification"].url, headers=request.inputs["classification"].headers))
    if sha(classification_bytes) != request.inputs["classification"].checksumSha256:
        raise HTTPException(422, "classification checksum mismatch")

    acoustic_report = json.loads(acoustic_bytes.decode())
    classification_report = json.loads(classification_bytes.decode())
    audio, rate, _ = load_audio(source)
    mono = np.mean(audio, axis=1)
    duration = len(audio) / rate
    optional_modules = set(request.policy.get("optionalModules") or ["separation", "transcription"])

    module_outputs: dict[str, dict[str, Any]] = {}
    module_outputs["timing"] = timing.analyze(acoustic_report, duration)
    module_outputs["structure"] = structure.analyze(mono, rate, duration)
    module_outputs["harmony"] = harmony.analyze(mono, rate, duration)
    module_outputs["melody"] = melody.analyze(mono, rate, duration)
    module_outputs["timbre"] = timbre.analyze(acoustic_report)
    module_outputs["texture"] = texture.analyze(acoustic_report)
    module_outputs["semantic"] = semantic.analyze(classification_report, request.interpretation)
    module_outputs["separation"] = optional.abstain("separation", optional_modules)
    module_outputs["transcription"] = optional.abstain("transcription", optional_modules)

    understanding_payload, workflow_status = fuse_modules(
        input_id=request.inputId,
        duration=duration,
        acoustic_report=acoustic_report,
        modules=module_outputs,
        lineage=request.lineage,
    )

    uploaded_modules: dict[str, dict[str, Any]] = {}
    module_urls = request.outputs.get("modules") or {}
    for name, payload in module_outputs.items():
        body = json.dumps(payload, separators=(",", ":")).encode()
        target = module_urls.get(name)
        if target:
            await put(SignedUrl(url=target["url"], headers=target.get("headers") or {}), body)
        uploaded_modules[name] = {"checksumSha256": sha(body), "fileSize": len(body), "payload": payload}

    understanding_body = json.dumps(understanding_payload, separators=(",", ":")).encode()
    understanding_target = request.outputs.get("understanding")
    if not understanding_target:
        raise HTTPException(400, "understanding output is required")
    await put(SignedUrl(url=understanding_target["url"], headers=understanding_target.get("headers") or {}), understanding_body)

    return {
        "workflowStatus": workflow_status,
        "modules": uploaded_modules,
        "understanding": {
            "checksumSha256": sha(understanding_body),
            "fileSize": len(understanding_body),
            "payload": understanding_payload,
        },
    }
