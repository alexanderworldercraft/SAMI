import argparse
import hashlib
import json
import os
import urllib.request
from pathlib import Path

from huggingface_hub import snapshot_download


CHATTERBOX_REPO = "ResembleAI/chatterbox"
# Snapshot exact validé lors de l'installation. Ne pas utiliser `main` ici :
# un redéploiement doit charger les mêmes poids que ceux testés.
CHATTERBOX_MODEL_REVISION = "5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18"
QWEN_MODELS = {
    "Qwen/Qwen3-TTS-12Hz-1.7B-Base": "fd4b254389122332181a7c3db7f27e918eec64e3",
    "Qwen/Qwen3-TTS-12Hz-0.6B-Base": "5d83992436eae1d760afd27aff78a71d676296fc",
}
BANDIT_URL = (
    "https://zenodo.org/api/records/12701995/files/"
    "checkpoint-multi.ckpt/content"
)
BANDIT_MD5 = "fea2868787551b0cff36cfcf7c3622a3"
QUALITY_REPO = "Systran/faster-whisper-small"
QUALITY_REVISION = "536b0662742c02347bc0e980a01041f333bce120"


def digest(path, algorithm):
    value = hashlib.new(algorithm)
    with path.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            value.update(chunk)
    return value.hexdigest()


def download_file(url, destination):
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(f"{destination.suffix}.part")
    if temporary.exists():
        temporary.unlink()
    request = urllib.request.Request(url, headers={"User-Agent": "SAMI-local-ai-setup/1.0"})
    with urllib.request.urlopen(request, timeout=120) as response, temporary.open("wb") as output:
        while chunk := response.read(1024 * 1024):
            output.write(chunk)
    os.replace(temporary, destination)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    parser.add_argument("--skip-bandit", action="store_true")
    parser.add_argument("--voice-engine", choices=["chatterbox", "qwen3-tts"], default="chatterbox")
    parser.add_argument("--voice-model")
    parser.add_argument("--voice-model-revision")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    hf_cache = root / "cache" / "huggingface"
    bandit_root = root / "models" / "bandit"
    hf_cache.mkdir(parents=True, exist_ok=True)
    os.environ["HF_HOME"] = str(hf_cache)
    os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"

    if args.voice_engine == "qwen3-tts":
        voice_repo = args.voice_model or "Qwen/Qwen3-TTS-12Hz-1.7B-Base"
        if voice_repo not in QWEN_MODELS:
            raise ValueError("Modèle Qwen3-TTS non validé par SAMI.")
        voice_revision = args.voice_model_revision or QWEN_MODELS[voice_repo]
        if voice_revision != QWEN_MODELS[voice_repo]:
            raise ValueError("La révision Qwen3-TTS ne correspond pas au checkpoint validé par SAMI.")
        voice_path = snapshot_download(repo_id=voice_repo, revision=voice_revision)
        voice = {
            "repo": voice_repo,
            "revision": voice_revision,
            "path": str(Path(voice_path).resolve()),
            "model": voice_repo.rsplit("/", 1)[-1],
            "license": "Apache-2.0",
        }
    else:
        voice_path = snapshot_download(
            repo_id=CHATTERBOX_REPO,
            revision=CHATTERBOX_MODEL_REVISION,
            allow_patterns=[
                "ve.pt",
                "t3_mtl23ls_v3.safetensors",
                "s3gen.pt",
                "grapheme_mtl_merged_expanded_v1.json",
                "conds.pt",
                "Cangjie5_TC.json",
            ],
        )
        voice_repo = CHATTERBOX_REPO
        voice_revision = CHATTERBOX_MODEL_REVISION
        voice = {
            "repo": voice_repo,
            "revision": voice_revision,
            "path": str(Path(voice_path).resolve()),
            "model": "v3",
            "license": "MIT",
        }

    quality_path = snapshot_download(repo_id=QUALITY_REPO, revision=QUALITY_REVISION)
    quality = {
        "repo": QUALITY_REPO,
        "revision": QUALITY_REVISION,
        "path": str(Path(quality_path).resolve()),
        "license": "MIT",
    }

    bandit_path = bandit_root / "checkpoint-multi.ckpt"
    bandit = None
    if not args.skip_bandit:
        if not bandit_path.exists() or digest(bandit_path, "md5") != BANDIT_MD5:
            download_file(BANDIT_URL, bandit_path)
        actual_md5 = digest(bandit_path, "md5")
        if actual_md5 != BANDIT_MD5:
            raise RuntimeError(
                f"Somme MD5 BandIt invalide: {actual_md5} au lieu de {BANDIT_MD5}"
            )
        bandit = {
            "path": str(bandit_path),
            "md5": actual_md5,
            "sha256": digest(bandit_path, "sha256"),
            "license": "CC-BY-SA-4.0",
            "source": "https://zenodo.org/records/12701995",
        }

    print(json.dumps({
        "voice": voice,
        "chatterbox": voice if args.voice_engine == "chatterbox" else None,
        "bandit": bandit,
        "quality": quality,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
