"""Private English prompt A/B. Diagnostic override only; no new production profile."""
import argparse
import os
from pathlib import Path

import runtime as rt
from compare_japanese import read_comparison_inputs


PROFILE = rt.V5_JAPANESE_BOUNDED_PROFILE


def generate_attempt(model, cue, reference, variant, attempt, seed, output):
    policy = "speaker-embedding-only" if variant == "speaker-identity" else "reference-audio-and-text"

    def operation():
        selected = model
        if variant == "speaker-identity":
            # Local diagnostic cache; production prompts and reference text stay intact.
            if "comparisonIdentityPrompt" not in model:
                model["comparisonIdentityPrompt"] = model["model"].create_voice_clone_prompt(
                    ref_audio=str(reference["path"]), ref_text=None, x_vector_only_mode=True)
            selected = {**model, "prompts": {cue["speaker"]: model["comparisonIdentityPrompt"]}}
        # Reset after prompt construction so its work cannot consume the paired
        # random stream intended for synthesis.
        import random
        import numpy as np
        import torch
        random.seed(seed)
        np.random.seed(seed)
        torch.manual_seed(seed)
        return rt.generate_voice_unwatched(selected, cue["text"], "en", cue["speaker"],
                                          reference, attempt=attempt, profile=PROFILE)

    # Same supervisor as production, including prompt preparation. No JP token
    # budget is transplanted to English: this A/B changes exactly one variable.
    return rt.guarded_voice_operation(operation, workspace=output, profile=PROFILE,
        speaker=cue["speaker"], source_start=cue["sourceStart"], text=cue["text"],
        language="en", kind="cue", progress=round(attempt / 3 * 90), seed=seed,
        cue_index=1, cue_count=1, attempt=attempt + 1,
        details={"attempt": attempt + 1, "engine": model["engine"], "diagnosticOnly": True,
                 "comparisonVariant": variant, "promptPolicy": policy,
                 "referenceText": reference["text"], "referenceSha256": rt.digest(reference["path"])})


def compare_variant(root, failure_root, reference_path, output, variant, check_only=False):
    if variant not in {"reference-text", "speaker-identity"}:
        raise ValueError("Variante anglaise inconnue.")
    cue, reference, generation, manifest = read_comparison_inputs(failure_root, reference_path, language="en")
    if manifest["pipelineVersion"] != PROFILE:
        raise ValueError("La comparaison anglaise nécessite une archive R5-R3.")
    policy = "speaker-embedding-only" if variant == "speaker-identity" else "reference-audio-and-text"
    report = {
        "schemaVersion": 1, "synthetic": True, "diagnosticOnly": True, "requiresListening": True,
        "language": "en", "variant": variant, "basePipelineVersion": PROFILE,
        "baseGenerationConfigHash": rt.PROFILE_GENERATION_CONFIG_HASHES[PROFILE],
        "diagnosticOverrides": {"promptPolicy": policy},
        "cue": cue, "referenceSha256": rt.digest(reference["path"]), "referenceText": reference["text"],
        "voiceModel": manifest.get("voiceModel"), "voiceModelRevision": manifest.get("voiceModelRevision"),
        "sourceSeed": generation["seed"], "seedPolicy": "archived-last-seed-plus-index-paired-v1",
        "warning": "Test brut sans accélération ni publication. Graines appariées ; pas une reproduction garantie des anciens WAV. Le score ASR ne remplace pas l'écoute.",
        "attempts": [],
    }
    if check_only:
        return report
    if any(os.environ.get(name, "").lower() not in rt.OFFLINE_VALUES for name in ("HF_HUB_OFFLINE", "TRANSFORMERS_OFFLINE")):
        raise ValueError("La comparaison doit rester hors ligne.")
    if os.environ.get("SAMI_DUBBING_WATCHDOG_PROTOCOL") != "1":
        raise ValueError("Lancer via compareEnglish.mjs (supervision obligatoire).")
    install = rt.install_manifest(root)
    voice = install.get("models", {}).get("voice") or {}
    if (install.get("voiceEngine") != "qwen3-tts" or voice.get("repo") != manifest.get("voiceModel")
            or not voice.get("revision") or voice.get("revision") != manifest.get("voiceModelRevision")):
        raise ValueError("Le moteur/modèle installé n'est pas celui du diagnostic.")
    output = Path(output)
    output.mkdir(mode=0o700, parents=True, exist_ok=False)
    rt.write_json(output / "comparison.json", report)
    model = rt.load_voice_model(install, {cue["speaker"]: reference})
    quality_model = rt.load_quality_model(install)
    import random
    import numpy as np
    import torch
    for attempt in range(3):
        seed = (generation["seed"] + attempt) % 2**32
        random.seed(seed)
        np.random.seed(seed)
        torch.manual_seed(seed)
        raw = output / f"AI-diagnostic-attempt-{attempt + 1}.wav"
        try:
            waveform, sample_rate = generate_attempt(model, cue, reference, variant, attempt, seed, output)
            rt.save_generated_audio(waveform, sample_rate, raw)
            with rt.observe_voice_activity("quality", progress=90, speaker=cue["speaker"],
                    source_start=cue["sourceStart"], cue_index=1, cue_count=1, attempt=attempt + 1):
                recognized = rt.transcribe_quality(quality_model, raw, "en")
            duration = rt.media_duration(raw)
            acoustic = rt.generated_audio_activity(raw)
            cer = rt.character_error_rate(cue["text"], recognized)
            report["attempts"].append({"attempt": attempt + 1, "seed": seed, "audio": raw.name,
                "state": "completed", "generatedDuration": duration, "recognized": recognized,
                "rawCer": cer, "acousticEvidence": acoustic,
                "textCheck": {"threshold": 0.35, "passed": bool(recognized.strip() and
                    acoustic.get("hasSpeech") and cer is not None and cer <= 0.35),
                    "diagnosticOnly": True, "notProductionAcceptance": True}})
            rt.log(f"Comparaison EN {variant} : tentative {attempt + 1}/3, {duration:.2f}s, CER {cer}.")
        except Exception as error:
            report["attempts"].append({"attempt": attempt + 1, "seed": seed, "state": "failed",
                "message": str(error), "audio": raw.name if raw.is_file() else None})
            raise
        finally:
            diagnostic = output / "generation-attempt.json"
            if diagnostic.is_file():
                rt.write_json(output / f"generation-attempt-{attempt + 1}.json", rt.load_json(diagnostic))
            rt.write_json(output / "comparison.json", report)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("root", "failure", "reference", "output"):
        parser.add_argument(f"--{name}", required=True)
    parser.add_argument("--variant", choices=["reference-text", "speaker-identity"], required=True)
    parser.add_argument("--check-only", action="store_true")
    args = parser.parse_args()
    print(rt.json.dumps(compare_variant(args.root, args.failure, args.reference, args.output,
                                       args.variant, args.check_only), ensure_ascii=True))


if __name__ == "__main__":
    main()
