import csv
import hashlib
import io
import json
import math
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Literal

import httpx
import numpy as np
import soundfile as sf
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from scipy import fftpack, signal

SCHEMA = "2.0.0"
app = FastAPI(title="Aria analysis worker", version=SCHEMA)
_model = None
_classes: list[str] = []
_weights_hash = ""


class SignedUrl(BaseModel):
    method: Literal["GET", "PUT"]
    url: str
    headers: dict[str, str] = {}
    expiresAt: str


class Outputs(BaseModel):
    acoustic: SignedUrl
    embeddings: SignedUrl
    classification: SignedUrl


class AnalysisRequest(BaseModel):
    schemaVersion: str
    projectId: str
    inputId: str
    workingArtifactId: str
    sourceChecksumSha256: str
    source: SignedUrl
    outputs: Outputs


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def summary(values: np.ndarray) -> dict[str, float]:
    finite = values[np.isfinite(values)]
    if not len(finite):
        return {"mean": 0.0, "std": 0.0, "p05": 0.0, "p50": 0.0, "p95": 0.0}
    return {name: round(float(value), 6) for name, value in {
        "mean": np.mean(finite), "std": np.std(finite), "p05": np.percentile(finite, 5),
        "p50": np.percentile(finite, 50), "p95": np.percentile(finite, 95)}.items()}


def loudness(path: str) -> dict[str, float | None]:
    run = subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-i", path, "-af", "loudnorm=print_format=json", "-f", "null", "-"], capture_output=True, text=True, timeout=120)
    start, end = run.stderr.rfind("{"), run.stderr.rfind("}")
    if start < 0 or end < start:
        return {"integratedLufs": None, "loudnessRangeLu": None, "truePeakDbtp": None}
    parsed = json.loads(run.stderr[start:end + 1])
    def number(key: str):
        try: return round(float(parsed[key]), 4)
        except (KeyError, ValueError): return None
    return {"integratedLufs": number("input_i"), "loudnessRangeLu": number("input_lra"), "truePeakDbtp": number("input_tp")}


def acoustic(path: str, audio: np.ndarray, rate: int) -> dict[str, Any]:
    channels = 1 if audio.ndim == 1 else audio.shape[1]
    matrix = audio[:, None] if audio.ndim == 1 else audio
    mono = np.mean(matrix, axis=1)
    feature_limit = rate * 120
    if len(mono) > feature_limit:
        window = rate * 10
        starts = np.linspace(0, len(mono) - window, 12, dtype=np.int64)
        feature_mono = np.concatenate([mono[start:start + window] for start in starts])
    else:
        feature_mono = mono
    peak = float(np.max(np.abs(matrix))) if matrix.size else 0.0
    frame = max(256, int(rate * .0464)); hop = frame // 2
    freqs, _, stft = signal.stft(feature_mono, rate, nperseg=frame, noverlap=frame-hop, boundary=None)
    mag = np.abs(stft) + 1e-12; power = mag * mag
    rms = np.sqrt(np.mean(power, axis=0))
    crossings = np.not_equal(np.signbit(feature_mono[1:]), np.signbit(feature_mono[:-1])).astype(np.float32)
    crossing_sum = np.concatenate(([0.0], np.cumsum(crossings, dtype=np.float64)))
    zcr = (crossing_sum[frame-1:] - crossing_sum[:-(frame-1)])[::hop] / (frame - 1) if len(feature_mono) >= frame else np.array([0.0])
    centroid = np.sum(freqs[:, None] * mag, axis=0) / np.sum(mag, axis=0)
    bandwidth = np.sqrt(np.sum(((freqs[:, None] - centroid) ** 2) * mag, axis=0) / np.sum(mag, axis=0))
    csum = np.cumsum(power, axis=0); targets = .85 * csum[-1]; rolloff = freqs[np.argmax(csum >= targets, axis=0)]
    flatness = np.exp(np.mean(np.log(mag), axis=0)) / np.mean(mag, axis=0)
    mel_log = np.log(power[:min(64, power.shape[0]), :]); mfcc = fftpack.dct(mel_log, axis=0, norm="ortho")[:13]
    floor = np.percentile(rms, 10); signal_level = np.percentile(rms, 75)
    estimated_snr = None if floor <= 1e-9 or signal_level <= floor else float(20 * np.log10(signal_level / floor))
    snr = round(estimated_snr, 3) if estimated_snr is not None and estimated_snr >= 3 else None
    onset = np.maximum(0, np.diff(np.sum(mag, axis=0), prepend=0)); candidates = []
    if np.max(onset) > 0 and len(onset) > 8:
        corr = signal.correlate(onset, onset, mode="full")[len(onset)-1:]
        lo, hi = max(1, int(60 / 220 / (hop/rate))), max(2, int(60 / 40 / (hop/rate)))
        peaks, _ = signal.find_peaks(corr[lo:min(hi, len(corr))])
        ranked = sorted(peaks + lo, key=lambda i: corr[i], reverse=True)[:3]
        candidates = [{"bpm": round(60 / (lag * hop / rate), 2), "strength": round(float(corr[lag] / max(corr[0], 1e-12)), 4)} for lag in ranked if corr[lag] / max(corr[0], 1e-12) >= .05]
    silence = np.abs(mono) < 10 ** (-60 / 20)
    warnings: list[str] = []
    if np.mean(silence) > .8: warnings.append("mostly_silent")
    if snr is None: warnings.append("snr_not_estimable")
    if not candidates: warnings.append("tempo_not_estimable")
    if len(candidates) > 1 and candidates[1]["strength"] > candidates[0]["strength"] * .85: warnings.append("tempo_ambiguous")
    correlation = None
    if channels == 2:
        correlation = round(float(np.corrcoef(matrix[:, 0], matrix[:, 1])[0, 1]), 6)
        if correlation < -.2: warnings.append("channel_phase_risk")
    return {"schemaVersion": SCHEMA, "profileVersion": "acoustic-v1", "durationSeconds": round(len(matrix)/rate, 6), "sampleRate": rate, "channels": channels,
        "levels": {"dcOffset": [round(float(v), 8) for v in np.mean(matrix, axis=0)], "rms": round(float(np.sqrt(np.mean(matrix**2))), 8), "samplePeakDbfs": round(20*math.log10(max(peak, 1e-12)), 4), "clippingSampleRatio": round(float(np.mean(np.abs(matrix) >= .999)), 8), **loudness(path)},
        "silence": {"thresholdDbfs": -60, "ratio": round(float(np.mean(silence)), 6)}, "snr": {"valueDb": snr, "method": "short_time_percentile_v1", "confidence": "medium" if snr is not None else "none", "reason": None if snr is not None else "noise floor is not separable"},
        "tempoCandidates": candidates, "channelCorrelation": correlation, "features": {"analyzedSeconds": round(len(feature_mono)/rate, 3), "samplingPolicy": "full_or_12_uniform_10s_v1", "windowedRms": summary(rms), "zeroCrossingRate": summary(zcr), "spectralCentroidHz": summary(centroid), "spectralBandwidthHz": summary(bandwidth), "spectralRolloff85Hz": summary(rolloff), "spectralFlatness": summary(flatness), "mfcc": [summary(row) for row in mfcc]}, "warnings": warnings}


def model_assets_hash() -> str:
    root = Path(os.environ.get("TFHUB_CACHE_DIR", "/models/tfhub"))
    digest = hashlib.sha256()
    for item in sorted(root.rglob("*")):
        if item.is_file(): digest.update(item.relative_to(root).as_posix().encode()); digest.update(item.read_bytes())
    return digest.hexdigest()


def yamnet(mono: np.ndarray, rate: int) -> tuple[np.ndarray, np.ndarray, list[str], str]:
    global _model, _classes, _weights_hash
    import tensorflow as tf
    import tensorflow_hub as hub
    if _model is None:
        _model = hub.load("https://tfhub.dev/google/yamnet/1")
        class_path = _model.class_map_path().numpy().decode()
        with open(class_path, newline="") as handle: _classes = [row[2] for row in list(csv.reader(handle))[1:]]
        _weights_hash = model_assets_hash()
    if rate != 16000: mono = signal.resample_poly(mono, 16000, rate)
    scores, embeddings, _ = _model(tf.convert_to_tensor(mono.astype(np.float32)))
    return scores.numpy(), embeddings.numpy(), _classes, _weights_hash


def classify(scores: np.ndarray, names: list[str], duration: float, warnings: list[str], weights_hash: str) -> dict[str, Any]:
    means = np.mean(scores, axis=0) if len(scores) else np.zeros(len(names))
    groups = {
        "speech": ["Speech", "Conversation", "Narration"], "singing": ["Singing", "Choir", "Vocal music"],
        "humming": ["Humming"], "beatboxing": ["Beatboxing"], "solo_instrument": ["Musical instrument", "Guitar", "Piano", "Violin", "Drum"],
        "mixed_music": ["Music", "Song"], "environmental_sound": ["Environmental noise", "Animal", "Vehicle", "Water", "Wind"]}
    raw = {key: max([float(means[i]) for i, name in enumerate(names) if any(term.lower() in name.lower() for term in terms)] or [0.0]) for key, terms in groups.items()}
    total = sum(raw.values()) or 1.0
    ranked = sorted(({"value": key, "probability": round(value/total, 6)} for key, value in raw.items()), key=lambda x: x["probability"], reverse=True)
    top = ranked[0] if ranked else {"value": "unknown", "probability": 0.0}
    if top["probability"] < .45: ranked.insert(0, {"value": "unknown", "probability": round(1-top["probability"], 6)})
    scope = "full_song" if duration >= 90 else "loop" if duration <= 12 and top["value"] == "mixed_music" else "fragment"
    classification_warnings = [*warnings, "baseline_not_calibrated"]
    return {"schemaVersion": SCHEMA, "usability": [{"value": "silence" if "mostly_silent" in warnings else "usable", "probability": 1.0}], "sourceType": ranked[:5], "musicScope": [{"value": scope, "probability": .65}], "reviewRecommendation": "needs_review", "conflicts": [], "warnings": classification_warnings, "model": {"id": "yamnet-audioset-rule-baseline", "version": "1", "weightsSha256": weights_hash, "preprocessingVersion": "mono-16khz-v1", "thresholdPolicyVersion": "baseline-v1"}}


async def put(url: SignedUrl, body: bytes):
    async with httpx.AsyncClient(timeout=180) as client:
        response = await client.put(url.url, content=body, headers=url.headers)
        response.raise_for_status()


@app.get("/health")
def health(): return {"status": "ok", "model": "yamnet/1"}


@app.post("/analyze")
async def analyze(request: AnalysisRequest):
    if request.schemaVersion != SCHEMA: raise HTTPException(400, "unsupported schema version")
    async with httpx.AsyncClient(timeout=180) as client:
        response = await client.get(request.source.url, headers=request.source.headers); response.raise_for_status(); source = response.content
    if sha(source) != request.sourceChecksumSha256: raise HTTPException(422, "source checksum mismatch")
    with tempfile.NamedTemporaryFile(suffix=".wav") as handle:
        handle.write(source); handle.flush(); audio, rate = sf.read(handle.name, dtype="float32", always_2d=True); report = acoustic(handle.name, audio, rate)
    mono = np.mean(audio, axis=1); scores, embeddings, names, weights_hash = yamnet(mono, rate)
    timestamps = np.arange(len(embeddings), dtype=np.float32) * .48
    buffer = io.BytesIO(); np.savez_compressed(buffer, embeddings=embeddings.astype(np.float32), timestamps=timestamps, mean=np.mean(embeddings, axis=0), std=np.std(embeddings, axis=0)); embedding_bytes = buffer.getvalue()
    classification = classify(scores, names, len(audio)/rate, report["warnings"], weights_hash)
    acoustic_bytes = json.dumps(report, separators=(",", ":")).encode(); classification_bytes = json.dumps(classification, separators=(",", ":")).encode()
    await put(request.outputs.acoustic, acoustic_bytes); await put(request.outputs.embeddings, embedding_bytes); await put(request.outputs.classification, classification_bytes)
    return {"acoustic": {"checksumSha256": sha(acoustic_bytes), "fileSize": len(acoustic_bytes), "payload": report}, "embeddings": {"checksumSha256": sha(embedding_bytes), "fileSize": len(embedding_bytes), "manifest": {"shape": list(embeddings.shape), "dtype": "float32", "segmentHopSeconds": .48, "model": "yamnet/1", "weightsSha256": weights_hash}}, "classification": {"checksumSha256": sha(classification_bytes), "fileSize": len(classification_bytes), "payload": classification}}
