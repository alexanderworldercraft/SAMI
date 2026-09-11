"""Standalone replicas using SAMI's installed dubbing engine and watermark."""
from pathlib import Path


def validate_request(payload, install, runtime):
    text = str(payload.get("text") or "").strip()
    language = payload.get("language")
    if not text or len(text) > 500 or language not in runtime.SUPPORTED_LANGUAGES:
        raise ValueError("Texte ou langue de la réplique invalide.")
    models = payload.get("models") or {}
    profile = runtime.resolve_dubbing_profile(models.get("pipeline"))
    if models.get("generationConfigHash") != runtime.PROFILE_GENERATION_CONFIG_HASHES[profile]:
        raise ValueError("Le profil vocal ne correspond pas au contrat de génération.")
    voice = install.get("models", {}).get("voice") or install.get("models", {}).get("chatterbox") or {}
    identity = {
        "voiceEngine": install.get("voiceEngine") or "chatterbox",
        "voiceModel": install.get("voiceModel") or voice.get("repo"),
        "voiceModelRevision": install.get("voiceModelRevision") or voice.get("revision"),
    }
    if any(models.get(key) != value for key, value in identity.items()):
        raise ValueError("Le moteur local ne correspond pas à la réplique demandée.")
    return text, language, profile


def process_voice(input_path, output_path, root, runtime):
    import soundfile as sf

    payload = runtime.load_json(input_path)
    install = runtime.install_manifest(root)
    text, language, profile = validate_request(payload, install, runtime)
    workspace = Path(input_path).resolve().parent
    reference_path = Path(payload["referencePath"]).resolve()
    if reference_path.parent != workspace or reference_path.is_symlink():
        raise ValueError("Référence vocale hors du dossier de travail.")
    if runtime.digest(reference_path) != payload.get("referenceSha256"):
        raise ValueError("La référence originale a changé.")
    reference = {"path": reference_path, "text": payload.get("referenceText") or ""}
    engine = runtime.load_voice_model(install, {"SPEAKER_00": reference})
    quality_model = runtime.load_quality_model(install)
    raw = workspace / "raw.wav"
    cue = {"speaker": "SPEAKER_00", "text": text, "start": 0, "end": 180}
    for attempt in range(3):
        runtime.seed_synthesis(cue, payload["referenceSha256"], attempt, profile)
        waveform, rate = runtime.generate_voice(
            engine, text, language, "SPEAKER_00", reference, attempt=attempt, profile=profile,
            watch_context={"workspace": workspace, "source_start": 0, "kind": "library", "progress": 20 + attempt * 20},
        )
        runtime.save_generated_audio(waveform, rate, raw)
        duration = sf.info(raw).duration
        if duration <= 0 or duration > 180:
            raise ValueError("La réplique dépasse la durée autorisée.")
        recognized = runtime.transcribe_quality(quality_model, raw, language)
        activity = runtime.generated_audio_activity(raw)
        if language == "ja":
            decision = runtime.japanese_quality_decision(text, recognized, duration, activity)
            accepted = decision["confirmed"] or (attempt == 2 and decision["reviewCandidate"])
        else:
            decision = runtime.transcript_quality_decision(
                text, recognized, runtime.character_error_rate(text, recognized), attempt,
                generated_duration=duration, acoustic_evidence=activity,
                lexical_unit_parser=lambda value: runtime.profile_speech_lexical_units(value, profile),
            )
            accepted = decision["accepted"]
        if accepted and activity.get("hasSpeech"):
            break
    else:
        raise ValueError("Le contrôle vocal local ne confirme pas le texte demandé après trois essais.")
    destination = workspace / "voice.wav"
    confidence = runtime.watermark_audio(raw, destination)
    runtime.write_json(output_path, {
        "audioPath": str(destination), "watermarked": True,
        "watermarkConfidence": confidence, "duration": duration,
    })
