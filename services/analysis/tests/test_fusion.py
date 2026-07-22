from app.fusion import fuse_modules


def test_fusion_preserves_complete_modules_when_optional_abstains():
    modules = {
        "timing": {"status": "complete", "confidence": "high", "summary": {"tempo": {"bpm": 120, "confidence": "high"}}, "warnings": []},
        "structure": {"status": "complete", "confidence": "medium", "summary": {"sections": [{"id": "section-1", "startSeconds": 0, "endSeconds": 10, "label": "full"}]}, "warnings": []},
        "harmony": {"status": "complete", "confidence": "medium", "summary": {"key": {"root": "C", "mode": "major", "confidence": "medium"}}, "warnings": []},
        "melody": {"status": "abstained", "confidence": "none", "summary": {"reason": "melody_extraction_not_enabled_v1"}, "warnings": ["melody_abstained"]},
        "timbre": {"status": "complete", "confidence": "medium", "summary": {"brightness": "bright"}, "warnings": []},
        "texture": {"status": "complete", "confidence": "medium", "summary": {"density": "dense"}, "warnings": []},
        "semantic": {"status": "complete", "confidence": "medium", "summary": {"tags": ["mixed_music"]}, "warnings": []},
        "separation": {"status": "abstained", "confidence": "none", "summary": {"reason": "separation_not_enabled_v1"}, "warnings": ["separation_abstained"]},
        "transcription": {"status": "abstained", "confidence": "none", "summary": {"reason": "transcription_not_enabled_v1"}, "warnings": ["transcription_abstained"]},
    }
    payload, status = fuse_modules(
        input_id="input-1",
        duration=10.0,
        acoustic_report={"levels": {"integratedLufs": -14.0, "samplePeakDbfs": -1.0}, "warnings": []},
        modules=modules,
        lineage={"workingArtifactId": "working-1", "interpretationArtifactId": "interp-1", "interpretationVersion": 1},
    )
    assert status == "partial"
    assert payload["modules"]["timing"]["status"] == "complete"
    assert payload["modules"]["separation"]["status"] == "abstained"
    assert payload["global"]["semanticTags"] == ["mixed_music"]
