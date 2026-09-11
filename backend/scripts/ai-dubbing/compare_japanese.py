"""Private, offline A/B on one failed cue. No job mutation or media publication."""
import argparse
import math
import os
from pathlib import Path

import runtime as rt


def read_comparison_inputs(failure_root, reference_path, language="ja"):
    failure_root = Path(failure_root)
    generation = rt.load_json(failure_root / "generation-attempt.json")
    manifest = rt.load_json(failure_root / "input-profile.json")
    if (failure_root / "quality-failure.json").is_file():
        failure = rt.load_json(failure_root / "quality-failure.json")
    else:
        failure = rt.load_json(failure_root / "error.json")
        if failure.get("code") != "AI_DUBBING_GENERATION_TIMEOUT":
            raise ValueError("Un diagnostic qualité ou un timeout de génération est requis.")
        matches = [cue for cue in manifest.get("dialogueUnits", []) if
                   cue.get("sourceStart") == generation.get("sourceStart")
                   and cue.get("speaker") == generation.get("speaker")
                   and cue.get("text") == generation.get("text")]
        if len(matches) != 1:
            raise ValueError("La réplique du timeout ne peut pas être identifiée sans ambiguïté.")
        failure = {**failure, "cue": matches[0]}
    cue = failure.get("cue") or {}
    speaker = cue.get("speaker")
    if (generation.get("language") != language or generation.get("operation") != "cue"
            or not isinstance(cue.get("text"), str) or not 0 < len(cue["text"]) <= 500
            or not isinstance(speaker, str) or not rt.re.fullmatch(r"SPEAKER_\d{2}", speaker)):
        raise ValueError(f"Le diagnostic doit décrire une réplique complète dans la langue {language}.")
    for name in ("sourceStart", "start", "end"):
        value = cue.get(name)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
            raise ValueError("Horodatages du diagnostic invalides.")
    if cue["end"] <= cue["start"]:
        raise ValueError("La fenêtre initiale est vide.")
    archive_profile = generation.get("pipelineVersion")
    allowed_profiles = {rt.V5_BOUNDED_SAMPLES_PROFILE, rt.V5_JAPANESE_IDENTITY_PROFILE, rt.V5_JAPANESE_BOUNDED_PROFILE}
    if (archive_profile not in allowed_profiles
            or generation.get("speaker") != speaker or generation.get("text") != cue["text"]
            or generation.get("sourceStart") != cue["sourceStart"]
            or failure.get("pipelineVersion") != archive_profile
            or manifest.get("pipelineVersion") != archive_profile
            or generation.get("generationConfigHash") != rt.PROFILE_GENERATION_CONFIG_HASHES[archive_profile]
            or manifest.get("generationConfigHash") != generation.get("generationConfigHash")):
        raise ValueError("Les diagnostics ne correspondent pas à la même réplique/version R5.")
    entry = (manifest.get("references") or {}).get(speaker) or {}
    details = generation.get("details") or {}
    reference_path = Path(reference_path).resolve()
    if (not reference_path.is_file() or rt.digest(reference_path) != entry.get("sha256")
            or entry.get("sha256") != details.get("referenceSha256")
            or entry.get("referenceText") != details.get("referenceText")
            or not entry.get("referenceText")):
        raise ValueError("Le WAV fourni n'est pas la référence exacte du diagnostic (empreinte/texte).")
    seed = generation.get("seed")
    if isinstance(seed, bool) or not isinstance(seed, int) or not 0 <= seed < 2**32:
        raise ValueError("Graine de génération absente ou invalide.")
    reference = {"path": reference_path, "text": entry["referenceText"]}
    return cue, reference, generation, manifest


def compare_variant(root, failure_root, reference_path, output, variant, check_only=False):
    cue, reference, generation, manifest = read_comparison_inputs(failure_root, reference_path)
    profile = {"reference-text": rt.V5_BOUNDED_SAMPLES_PROFILE,
               "speaker-identity": rt.V5_JAPANESE_IDENTITY_PROFILE,
               "bounded-identity": rt.V5_JAPANESE_BOUNDED_PROFILE}[variant]
    report = {
        "schemaVersion": 1, "synthetic": True, "diagnosticOnly": True,
        "variant": variant, "pipelineVersion": profile,
        "generationConfigHash": rt.PROFILE_GENERATION_CONFIG_HASHES[profile],
        "cue": cue, "referenceSha256": rt.digest(reference["path"]),
        "referenceText": reference["text"], "sourceSeed": generation["seed"],
        "seedPolicy": "archived-last-seed-plus-index-paired-v1",
        "warning": "Comparaison ciblée, pas une reproduction garantie des anciens WAV ; écoute requise.",
        "attempts": [],
    }
    if check_only:
        return report
    if any(os.environ.get(name, "").lower() not in rt.OFFLINE_VALUES for name in ("HF_HUB_OFFLINE", "TRANSFORMERS_OFFLINE")):
        raise ValueError("La comparaison doit rester hors ligne.")
    if os.environ.get("SAMI_DUBBING_WATCHDOG_PROTOCOL") != "1":
        raise ValueError("Lancer la comparaison via compareJapanese.mjs (supervision obligatoire).")
    install = rt.install_manifest(root)
    voice = install.get("models", {}).get("voice") or install.get("models", {}).get("chatterbox") or {}
    if install.get("voiceEngine") != "qwen3-tts":
        raise ValueError("Cette comparaison nécessite le clone Qwen3-TTS/CUDA.")
    if (voice.get("repo") != manifest.get("voiceModel")
            or not voice.get("revision") or voice.get("revision") != manifest.get("voiceModelRevision")):
        raise ValueError("Le modèle installé n'est pas celui du diagnostic ; comparaison contrôlée refusée.")
    output = Path(output)
    output.mkdir(mode=0o700, parents=True, exist_ok=False)
    rt.write_json(output / "comparison.json", report)
    model = rt.load_voice_model(install, {cue["speaker"]: reference})
    quality_model = rt.load_quality_model(install)
    import random
    import numpy as np
    import torch
    for attempt in range(3):
        # Same seed and sampling controls in both branches; only the prompt differs.
        seed = (generation["seed"] + attempt) % 2**32
        random.seed(seed)
        np.random.seed(seed)
        torch.manual_seed(seed)
        raw = output / f"AI-diagnostic-attempt-{attempt + 1}.wav"
        try:
            waveform, sample_rate = rt.generate_voice(model, cue["text"], "ja", cue["speaker"], reference,
                attempt=attempt, profile=profile, watch_context={
                    "workspace": output, "kind": "cue", "progress": round(attempt / 3 * 90),
                    "source_start": cue["sourceStart"], "seed": seed,
                    "cue_index": 1, "cue_count": 1, "attempt": attempt + 1,
                })
        except rt.DubbingGenerationLimitError as error:
            rt.write_json(output / f"generation-attempt-{attempt + 1}.json", rt.load_json(output / "generation-attempt.json"))
            report["attempts"].append({"attempt": attempt + 1, "seed": seed,
                "state": "rejected-before-decoding", "code": error.code, "message": str(error), "audio": None})
            rt.write_json(output / "comparison.json", report)
            rt.log(f"Comparaison {variant} : tentative {attempt + 1}/3 REFUSÉE avant décodage (fin absente).")
            continue
        rt.save_generated_audio(waveform, sample_rate, raw)
        # Retain each pre-call diagnostic rather than only the last attempt.
        rt.write_json(output / f"generation-attempt-{attempt + 1}.json", rt.load_json(output / "generation-attempt.json"))
        with rt.observe_voice_activity("quality", progress=90, speaker=cue["speaker"],
                source_start=cue["sourceStart"], cue_index=1, cue_count=1, attempt=attempt + 1):
            recognized = rt.transcribe_quality(quality_model, raw, "ja")
        duration = rt.media_duration(raw)
        decision = rt.japanese_quality_decision(cue["text"], recognized, duration, rt.generated_audio_activity(raw))
        report["attempts"].append({
            "attempt": attempt + 1, "seed": seed, "audio": raw.name,
            "generatedDuration": duration, "recognized": recognized,
            "qualityR5R2": decision, "rawCer": rt.character_error_rate(cue["text"], recognized),
        })
        rt.write_json(output / "comparison.json", report)
        rt.log(f"Comparaison {variant} : tentative {attempt + 1}/3, {duration:.2f}s, CER {decision['cer']:.3f}.")
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("root", "failure", "reference", "output"):
        parser.add_argument(f"--{name}", required=True)
    parser.add_argument("--variant", choices=["reference-text", "speaker-identity", "bounded-identity"], required=True)
    parser.add_argument("--check-only", action="store_true")
    args = parser.parse_args()
    result = compare_variant(args.root, args.failure, args.reference, args.output, args.variant, args.check_only)
    # Stdout is a machine-readable report, including during the model-free
    # preflight. JSON escapes remain lossless even in a legacy Windows console.
    # Diagnostic files continue to use explicit UTF-8 via write_json.
    print(rt.json.dumps(result, ensure_ascii=True))


if __name__ == "__main__":
    main()
