import argparse
import json
from pathlib import Path

from huggingface_hub import snapshot_download


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    parser.add_argument("--engine", required=True)
    parser.add_argument("--whisper-model", default="large-v3")
    parser.add_argument(
        "--translation-model",
        default="facebook/nllb-200-distilled-600M",
    )
    args = parser.parse_args()

    root = Path(args.root).resolve()
    models = root / "models"
    models.mkdir(parents=True, exist_ok=True)
    result = {
        "translationModel": args.translation_model,
        "translationModelPath": str(models / "nllb-200-distilled-600M"),
    }

    snapshot_download(
        repo_id=args.translation_model,
        local_dir=result["translationModelPath"],
    )

    if args.engine == "faster-whisper":
        repo_id = f"Systran/faster-whisper-{args.whisper_model}"
        result["modelPath"] = str(models / f"faster-whisper-{args.whisper_model}")
        snapshot_download(repo_id=repo_id, local_dir=result["modelPath"])

    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
