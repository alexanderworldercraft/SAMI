import argparse
import importlib.metadata
import hashlib
import itertools
import json
import os
from pathlib import Path


def write_json(path, value):
    destination = Path(path)
    temporary = destination.with_suffix(f"{destination.suffix}.tmp")
    with temporary.open("w", encoding="utf-8") as handle:
        json.dump(value, handle, ensure_ascii=False)
    os.replace(temporary, destination)


def digest(path):
    value = hashlib.sha256()
    with Path(path).open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            value.update(chunk)
    return value.hexdigest()


def assert_model_integrity(model_path, expected_files):
    if not isinstance(expected_files, dict) or not expected_files:
        raise RuntimeError("Les empreintes du modèle Pyannote officiel sont absentes.")
    for relative_path, expected_sha256 in expected_files.items():
        candidate = (model_path / relative_path).resolve()
        try:
            candidate.relative_to(model_path)
        except ValueError as error:
            raise RuntimeError("Le manifeste Pyannote contient un chemin invalide.") from error
        if not candidate.is_file() or digest(candidate) != str(expected_sha256):
            raise RuntimeError(f"L'intégrité du fichier Pyannote {relative_path} est invalide.")


def offline_environment(model_path):
    cache_root = model_path.parents[1] / "cache"
    matplotlib_cache = cache_root / "matplotlib"
    matplotlib_cache.mkdir(parents=True, exist_ok=True)
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
    os.environ["PYANNOTE_METRICS_ENABLED"] = "0"
    os.environ["TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD"] = "1"
    os.environ["MPLCONFIGDIR"] = str(matplotlib_cache)


def load_pipeline(model_path, expected_files):
    assert_model_integrity(model_path, expected_files)
    offline_environment(model_path)
    from pyannote.audio import Pipeline
    from pyannote.audio.telemetry import set_telemetry_metrics

    set_telemetry_metrics(False)
    pipeline = Pipeline.from_pretrained(str(model_path))
    try:
        import torch
        if torch.cuda.is_available():
            pipeline.to(torch.device("cuda"))
    except (ImportError, AttributeError):
        pass
    return pipeline


def probe(model_path, expected_files):
    import torch
    pipeline = load_pipeline(model_path, expected_files)
    return {
        "ready": pipeline is not None,
        "model": "pyannote-speaker-diarization-community-1",
        "modelPath": str(model_path),
        "device": "cuda" if torch.cuda.is_available() else "cpu",
        "pyannoteAudioVersion": importlib.metadata.version("pyannote-audio"),
        "telemetry": False,
        "offline": True,
    }


def overlap_seconds(left, right):
    return max(0.0, min(left["end"], right["end"]) - max(left["start"], right["start"]))


def normalized(vector):
    import numpy as np

    norm = float(np.linalg.norm(vector))
    return vector / norm if norm > 0.0 else vector


def extract_group_embedding(pipeline, audio_file, turns, max_segments=4):
    import numpy as np
    from pyannote.core import Segment

    candidates = sorted(
        (turn for turn in turns if turn["end"] - turn["start"] >= 0.6),
        key=lambda turn: turn["end"] - turn["start"],
        reverse=True,
    )[:max_segments]
    embeddings = []
    weights = []
    for turn in candidates:
        waveform, _ = pipeline._audio.crop(
            audio_file,
            Segment(float(turn["start"]), float(turn["end"])),
            mode="pad",
        )
        if waveform.shape[-1] < pipeline._embedding.min_num_samples:
            continue
        value = pipeline._embedding(waveform[None])[0]
        embeddings.append(normalized(np.asarray(value, dtype=np.float32)))
        weights.append(min(4.0, float(turn["end"] - turn["start"])))
    if not embeddings:
        return None
    return normalized(np.average(np.vstack(embeddings), axis=0, weights=weights))


def best_injective_mapping(score_matrix):
    import numpy as np

    rows, columns = score_matrix.shape
    if rows == 0 or columns == 0 or rows > columns:
        return None
    try:
        from scipy.optimize import linear_sum_assignment

        row_indexes, column_indexes = linear_sum_assignment(-score_matrix)
        return {int(row): int(column) for row, column in zip(row_indexes, column_indexes)}
    except ImportError:
        best = None
        for selected in itertools.permutations(range(columns), rows):
            total = sum(float(score_matrix[row, column]) for row, column in enumerate(selected))
            if best is None or total > best[0]:
                best = (total, selected)
        return {row: column for row, column in enumerate(best[1])} if best else None


def exclusive_turns(turns):
    boundaries = sorted({
        float(value)
        for turn in turns
        for value in (turn["start"], turn["end"])
    })
    output = []
    for start, end in zip(boundaries, boundaries[1:]):
        if end <= start:
            continue
        midpoint = (start + end) / 2.0
        active = [turn for turn in turns if turn["start"] <= midpoint < turn["end"]]
        if not active:
            continue
        # En cas de parole réellement superposée, la voix qui a commencé le plus
        # récemment porte généralement la nouvelle réplique à doubler.
        selected = max(active, key=lambda turn: (turn["start"], turn["end"] - turn["start"]))
        if output and output[-1]["speaker"] == selected["speaker"] and abs(output[-1]["end"] - start) < 0.002:
            output[-1]["end"] = end
        else:
            output.append({**selected, "start": start, "end": end})
    return output


def subtract_covered_turns(base_turns, refinement_turns):
    output = []
    for base in base_turns:
        pieces = [(float(base["start"]), float(base["end"]))]
        for refined in refinement_turns:
            next_pieces = []
            for start, end in pieces:
                if refined["end"] <= start or refined["start"] >= end:
                    next_pieces.append((start, end))
                    continue
                if refined["start"] > start:
                    next_pieces.append((start, min(end, refined["start"])))
                if refined["end"] < end:
                    next_pieces.append((max(start, refined["end"]), end))
            pieces = next_pieces
        output.extend(
            {**base, "start": start, "end": end}
            for start, end in pieces
            if end - start >= 0.04
        )
    output.extend(refinement_turns)
    ordered = sorted(output, key=lambda turn: (turn["start"], turn["end"], turn["speaker"]))
    merged = []
    for turn in ordered:
        if (
            merged
            and merged[-1]["speaker"] == turn["speaker"]
            and turn["start"] - merged[-1]["end"] <= 0.04
        ):
            merged[-1]["end"] = max(merged[-1]["end"], turn["end"])
        else:
            merged.append({
                "start": round(float(turn["start"]), 3),
                "end": round(float(turn["end"]), 3),
                "speaker": str(turn["speaker"]),
            })
    return merged


def refine_with_sortformer(pipeline, audio_file, base_turns, labels, centroids, refinement):
    import numpy as np

    raw_turns = refinement.get("turns") if isinstance(refinement, dict) else None
    if not raw_turns or centroids is None or not labels:
        return base_turns, {"applied": False, "reason": "no-refinement"}
    grouped_windows = {}
    for item in raw_turns:
        try:
            turn = {
                "start": float(item["start"]),
                "end": float(item["end"]),
                "speaker": str(item["speaker"]),
                "window": int(item["window"]),
            }
        except (KeyError, TypeError, ValueError):
            continue
        if turn["end"] > turn["start"]:
            grouped_windows.setdefault(turn["window"], []).append(turn)

    accepted = []
    window_reports = []
    global_embeddings = np.vstack([normalized(row) for row in centroids])
    for window_index, window_turns in sorted(grouped_windows.items()):
        local_labels = sorted({turn["speaker"] for turn in window_turns})
        report = {"window": window_index, "localSpeakerCount": len(local_labels)}
        window_start = min(turn["start"] for turn in window_turns)
        window_end = max(turn["end"] for turn in window_turns)
        global_labels_in_window = {
            turn["speaker"]
            for turn in base_turns
            if turn["end"] > window_start and turn["start"] < window_end
        }
        report["globalSpeakerCount"] = len(global_labels_in_window)
        if len(global_labels_in_window) > 4:
            report.update({"accepted": False, "reason": "sortformer-capacity"})
            window_reports.append(report)
            continue
        if len(local_labels) < 2 or len(local_labels) > min(4, len(labels)):
            report.update({"accepted": False, "reason": "speaker-count"})
            window_reports.append(report)
            continue

        local_embeddings = []
        valid = True
        for local_label in local_labels:
            embedding = extract_group_embedding(
                pipeline,
                audio_file,
                [turn for turn in window_turns if turn["speaker"] == local_label],
            )
            if embedding is None:
                valid = False
                break
            local_embeddings.append(embedding)
        if not valid:
            report.update({"accepted": False, "reason": "embedding"})
            window_reports.append(report)
            continue

        similarity = np.matmul(np.vstack(local_embeddings), global_embeddings.T)
        overlap_prior = np.zeros_like(similarity)
        for local_index, local_label in enumerate(local_labels):
            local_turns = [turn for turn in window_turns if turn["speaker"] == local_label]
            total = sum(turn["end"] - turn["start"] for turn in local_turns) or 1.0
            for global_index, global_label in enumerate(labels):
                overlap_prior[local_index, global_index] = min(
                    1.0,
                    sum(
                        overlap_seconds(local, base)
                        for local in local_turns
                        for base in base_turns
                        if base["speaker"] == global_label
                    ) / total,
                )
        scores = (0.85 * similarity) + (0.15 * overlap_prior)
        mapping_indexes = best_injective_mapping(scores)
        if mapping_indexes is None:
            report.update({"accepted": False, "reason": "mapping"})
            window_reports.append(report)
            continue

        mapped = {}
        confidence_ok = True
        for local_index, global_index in mapping_indexes.items():
            row = scores[local_index]
            alternatives = [float(value) for index, value in enumerate(row) if index != global_index]
            margin = float(row[global_index]) - (max(alternatives) if alternatives else -1.0)
            voice_score = float(similarity[local_index, global_index])
            if voice_score < 0.18 or margin < -0.02:
                confidence_ok = False
            mapped[local_labels[local_index]] = labels[global_index]
        if not confidence_ok:
            report.update({"accepted": False, "reason": "low-confidence"})
            window_reports.append(report)
            continue

        exclusive = exclusive_turns(window_turns)
        accepted.extend({**turn, "speaker": mapped[turn["speaker"]]} for turn in exclusive)
        report.update({"accepted": True, "mapping": mapped})
        window_reports.append(report)

    if not accepted:
        return base_turns, {
            "applied": False,
            "reason": "all-windows-rejected",
            "windows": window_reports,
        }
    return subtract_covered_turns(base_turns, accepted), {
        "applied": True,
        "model": "nvidia/diar_sortformer_4spk-v1",
        "acceptedWindows": sum(1 for item in window_reports if item.get("accepted")),
        "rejectedWindows": sum(1 for item in window_reports if not item.get("accepted")),
        "windows": window_reports,
    }


def diarize(
    model_path,
    expected_files,
    audio_path,
    output_path,
    num_speakers=None,
    refinement_path=None,
):
    import numpy as np
    import soundfile as sf
    import torch

    pipeline = load_pipeline(model_path, expected_files)
    audio, sample_rate = sf.read(audio_path, dtype="float32", always_2d=True)
    waveform = torch.from_numpy(np.ascontiguousarray(audio.T))
    options = {"num_speakers": num_speakers} if num_speakers is not None else {}
    result = pipeline(
        {"waveform": waveform, "sample_rate": int(sample_rate)},
        **options,
    )
    annotation = getattr(result, "exclusive_speaker_diarization", None)
    if annotation is None:
        annotation = result.speaker_diarization
    turns = [
        {
            "start": round(float(turn.start), 3),
            "end": round(float(turn.end), 3),
            "speaker": str(speaker),
        }
        for turn, _, speaker in annotation.itertracks(yield_label=True)
        if float(turn.end) > float(turn.start)
    ]
    base_turns = [dict(turn) for turn in turns]
    speakers = sorted({turn["speaker"] for turn in turns})
    refinement_report = {"applied": False, "reason": "not-requested"}
    if refinement_path is not None:
        refinement = json.loads(Path(refinement_path).read_text(encoding="utf-8"))
        labels = list(result.speaker_diarization.labels())
        turns, refinement_report = refine_with_sortformer(
            pipeline,
            {"waveform": waveform, "sample_rate": int(sample_rate), "uri": "sami"},
            turns,
            labels,
            getattr(result, "speaker_embeddings", None),
            refinement,
        )
        speakers = sorted({turn["speaker"] for turn in turns})
    write_json(output_path, {
        "model": (
            "pyannote-speaker-diarization-community-1+nvidia-diar-sortformer-4spk-v1"
            if refinement_path is not None else "pyannote-speaker-diarization-community-1"
        ),
        "exclusive": getattr(result, "exclusive_speaker_diarization", None) is not None,
        "expectedSpeakerCount": num_speakers,
        "speakerCount": len(speakers),
        "speakers": speakers,
        "baseTurns": base_turns,
        "turns": turns,
        "refinement": refinement_report,
    })


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--integrity-json", required=True)
    parser.add_argument("--audio")
    parser.add_argument("--output")
    parser.add_argument("--num-speakers", type=int, choices=range(1, 31))
    parser.add_argument("--refinement-json")
    parser.add_argument("--probe", action="store_true")
    args = parser.parse_args()
    model_path = Path(args.model).resolve()
    expected_files = json.loads(args.integrity_json)
    if not (model_path / "config.yaml").is_file():
        raise FileNotFoundError("Le modèle Pyannote Community-1 local est incomplet.")
    if args.probe:
        print(json.dumps(probe(model_path, expected_files), ensure_ascii=False))
        return
    if not args.audio or not args.output:
        parser.error("--audio et --output sont requis hors mode --probe")
    diarize(
        model_path,
        expected_files,
        Path(args.audio).resolve(),
        Path(args.output).resolve(),
        args.num_speakers,
        Path(args.refinement_json).resolve() if args.refinement_json else None,
    )


if __name__ == "__main__":
    main()
