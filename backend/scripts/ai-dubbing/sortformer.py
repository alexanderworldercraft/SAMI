import argparse
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path


MODEL_NAME = "nvidia/diar_sortformer_4spk-v1"


def digest(path):
    value = hashlib.sha256()
    with Path(path).open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            value.update(chunk)
    return value.hexdigest()


def write_json(path, value):
    destination = Path(path)
    temporary = destination.with_suffix(f"{destination.suffix}.tmp")
    with temporary.open("w", encoding="utf-8") as handle:
        json.dump(value, handle, ensure_ascii=False)
    os.replace(temporary, destination)


def assert_model(model_path, expected_sha256):
    if not model_path.is_file() or model_path.suffix.lower() != ".nemo":
        raise RuntimeError("Le checkpoint local NVIDIA Sortformer .nemo est absent.")
    if not expected_sha256 or digest(model_path) != str(expected_sha256):
        raise RuntimeError("L'intégrité du checkpoint NVIDIA Sortformer est invalide.")


def offline_environment(model_path):
    cache_root = model_path.parents[2] / "cache" / "sortformer"
    cache_root.mkdir(parents=True, exist_ok=True)
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
    os.environ["NEMO_CACHE_DIR"] = str(cache_root)


def load_model(model_path, expected_sha256):
    assert_model(model_path, expected_sha256)
    offline_environment(model_path)
    import torch
    from nemo.collections.asr.models import SortformerEncLabelModel

    # Same checkpoint and segmentation contract. CPU is the portable fallback;
    # Metal is reserved for synthesis, whose memory use dominates on the Mac.
    device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
    model = SortformerEncLabelModel.restore_from(
        restore_path=str(model_path), map_location=device, strict=False
    )
    model = model.to(device).eval()
    return model


def probe(model_path, expected_sha256):
    import torch

    model = load_model(model_path, expected_sha256)
    return {
        "ready": model is not None,
        "model": MODEL_NAME,
        "modelPath": str(model_path),
        "device": str(model.device),
        "cudaDevice": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        "nemoToolkitVersion": importlib.metadata.version("nemo-toolkit"),
        "offline": True,
        "maxSpeakersPerWindow": 4,
    }


def parse_segment(segment):
    if isinstance(segment, str):
        parts = segment.strip().split()
        if len(parts) < 3:
            return None
        return float(parts[0]), float(parts[1]), str(parts[2])
    if isinstance(segment, dict):
        start = segment.get("start", segment.get("begin"))
        end = segment.get("end", segment.get("stop"))
        speaker = segment.get("speaker", segment.get("label"))
        if start is None or end is None or speaker is None:
            return None
        return float(start), float(end), str(speaker)
    if isinstance(segment, (list, tuple)) and len(segment) >= 3:
        return float(segment[0]), float(segment[1]), str(segment[2])
    return None


def normalize_predictions(predictions, window_count):
    if window_count == 1 and predictions and isinstance(predictions[0], (str, dict)):
        return [predictions]
    if not isinstance(predictions, (list, tuple)) or len(predictions) != window_count:
        raise RuntimeError("Sortformer a renvoyé un nombre de fenêtres inattendu.")
    return predictions


def diarize(model_path, expected_sha256, windows_path, output_path):
    windows = json.loads(Path(windows_path).read_text(encoding="utf-8"))
    if not isinstance(windows, list) or not windows:
        raise RuntimeError("La liste des fenêtres Sortformer est vide.")
    audio_paths = [str(Path(item["audioPath"]).resolve()) for item in windows]
    missing = next((item for item in audio_paths if not Path(item).is_file()), None)
    if missing:
        raise FileNotFoundError(f"Une fenêtre audio Sortformer est absente : {missing}")

    model = load_model(model_path, expected_sha256)
    predictions = model.diarize(audio=audio_paths, batch_size=1)
    predictions = normalize_predictions(predictions, len(windows))
    turns = []
    for window, segments in zip(windows, predictions):
        offset = float(window["audioStart"])
        core_start = float(window["coreStart"])
        core_end = float(window["coreEnd"])
        for raw_segment in segments or []:
            parsed = parse_segment(raw_segment)
            if parsed is None:
                continue
            local_start, local_end, speaker = parsed
            start = max(core_start, offset + local_start)
            end = min(core_end, offset + local_end)
            if speaker and end > start:
                turns.append({
                    "start": round(start, 3),
                    "end": round(end, 3),
                    "speaker": speaker,
                    "window": int(window["index"]),
                })
    write_json(output_path, {
        "model": MODEL_NAME,
        "windowCount": len(windows),
        "turns": turns,
    })


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--sha256", required=True)
    parser.add_argument("--windows-json")
    parser.add_argument("--output")
    parser.add_argument("--probe", action="store_true")
    args = parser.parse_args()
    model_path = Path(args.model).resolve()
    if args.probe:
        print(json.dumps(probe(model_path, args.sha256), ensure_ascii=False))
        return
    if not args.windows_json or not args.output:
        parser.error("--windows-json et --output sont requis hors mode --probe")
    diarize(
        model_path,
        args.sha256,
        Path(args.windows_json).resolve(),
        Path(args.output).resolve(),
    )


if __name__ == "__main__":
    main()
