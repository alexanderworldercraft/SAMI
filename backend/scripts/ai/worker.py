import argparse
import json
import os
import subprocess
from pathlib import Path


NLLB_LANGUAGES = {
    "fr": "fra_Latn", "en": "eng_Latn", "es": "spa_Latn",
    "de": "deu_Latn", "it": "ita_Latn", "pt": "por_Latn",
    "nl": "nld_Latn", "ja": "jpn_Jpan", "ko": "kor_Hang",
    "zh": "zho_Hans", "ru": "rus_Cyrl", "uk": "ukr_Cyrl",
    "pl": "pol_Latn", "tr": "tur_Latn", "ar": "arb_Arab",
    "hi": "hin_Deva", "sv": "swe_Latn", "da": "dan_Latn",
    "no": "nob_Latn", "fi": "fin_Latn", "cs": "ces_Latn",
    "el": "ell_Grek", "he": "heb_Hebr", "id": "ind_Latn",
    "th": "tha_Thai", "vi": "vie_Latn",
}


def load_json(filename):
    with open(filename, "r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(filename, value):
    temporary = f"{filename}.tmp"
    with open(temporary, "w", encoding="utf-8") as handle:
        json.dump(value, handle, ensure_ascii=False)
    os.replace(temporary, filename)


def normalize_language(value):
    value = str(value or "").strip().lower().replace("_", "-")
    aliases = {"fra": "fr", "fre": "fr", "eng": "en", "spa": "es",
               "deu": "de", "ger": "de", "ita": "it", "por": "pt",
               "nld": "nl", "dut": "nl", "jpn": "ja", "kor": "ko",
               "zho": "zh", "chi": "zh", "rus": "ru", "ukr": "uk",
               "pol": "pl", "tur": "tr", "ara": "ar", "hin": "hi"}
    return aliases.get(value, value.split("-")[0])


def probe(manifest):
    engine = manifest.get("engine")
    python_ready = True
    error = None
    torch_module = None
    try:
        import torch
        import transformers  # noqa: F401
        torch_module = torch
        if engine == "faster-whisper":
            import faster_whisper  # noqa: F401
            import ctranslate2
            if manifest.get("device") == "cuda":
                if ctranslate2.get_cuda_device_count() < 1:
                    raise RuntimeError("Aucun GPU CUDA utilisable par CTranslate2.")
                if not torch.cuda.is_available():
                    raise RuntimeError("CUDA est indisponible pour le modèle de traduction.")
    except Exception as exc:  # pragma: no cover - dépend de l'installation locale
        python_ready = False
        error = str(exc)

    if (
        python_ready
        and manifest.get("translationDevice") == "mps"
        and (
            not getattr(torch_module.backends, "mps", None)
            or not torch_module.backends.mps.is_available()
        )
    ):
        python_ready = False
        error = "Metal Performance Shaders est indisponible pour la traduction."

    required = [manifest.get("translationModelPath")]
    if engine == "faster-whisper":
        required.append(manifest.get("modelPath"))
    else:
        required.extend([manifest.get("whisperCppPath"), manifest.get("modelPath")])
    missing = [item for item in required if not item or not Path(item).exists()]
    if missing:
        error = f"Fichiers IA absents: {', '.join(str(item) for item in missing)}"
    executable = manifest.get("whisperCppPath")
    if executable and os.name != "nt" and Path(executable).exists() and not os.access(executable, os.X_OK):
        python_ready = False
        error = f"Le moteur whisper.cpp n'est pas exécutable: {executable}"
    return {
        "ready": python_ready and not missing,
        "engine": engine,
        "device": manifest.get("device"),
        "model": manifest.get("model"),
        "translationModel": manifest.get("translationModel"),
        "error": error,
        "capabilities": {"translationDevice": manifest.get("translationDevice", "auto")},
    }


def transcribe_faster_whisper(manifest, audio_path):
    from faster_whisper import WhisperModel

    device = manifest.get("device", "cuda")
    compute_type = manifest.get("computeType", "float16" if device == "cuda" else "int8")
    model = WhisperModel(
        manifest["modelPath"],
        device=device,
        compute_type=compute_type,
        local_files_only=True,
    )
    segments, info = model.transcribe(
        audio_path,
        beam_size=5,
        vad_filter=True,
        condition_on_previous_text=True,
    )
    return normalize_language(info.language), [
        {"start": float(segment.start), "end": float(segment.end), "text": segment.text.strip()}
        for segment in segments if segment.text.strip()
    ]


def seconds_from_timestamp(value):
    parts = str(value or "0").replace(",", ".").split(":")
    try:
        parts = [float(item) for item in parts]
    except ValueError:
        return 0.0
    while len(parts) < 3:
        parts.insert(0, 0.0)
    return parts[-3] * 3600 + parts[-2] * 60 + parts[-1]


def transcribe_whisper_cpp(manifest, audio_path, output_root):
    prefix = str(output_root / "whisper")
    command = [
        manifest["whisperCppPath"], "-m", manifest["modelPath"],
        "-f", audio_path, "-l", "auto", "-oj", "-of", prefix,
    ]
    subprocess.run(command, check=True, capture_output=True, text=True)
    payload = load_json(f"{prefix}.json")
    language = normalize_language(
        payload.get("result", {}).get("language") or payload.get("language")
    )
    raw_segments = payload.get("transcription") or payload.get("segments") or []
    segments = []
    for item in raw_segments:
        offsets = item.get("offsets") or {}
        timestamps = item.get("timestamps") or {}
        start = offsets.get("from")
        end = offsets.get("to")
        if start is not None and end is not None:
            start, end = float(start) / 1000.0, float(end) / 1000.0
        else:
            start = seconds_from_timestamp(timestamps.get("from") or item.get("start"))
            end = seconds_from_timestamp(timestamps.get("to") or item.get("end"))
        text = str(item.get("text") or "").strip()
        if text and end > start:
            segments.append({"start": start, "end": end, "text": text})
    return language, segments


def translation_device(manifest, torch):
    requested = manifest.get("translationDevice", "auto")
    if requested == "cuda" and torch.cuda.is_available():
        return "cuda"
    if requested in ("mps", "auto") and getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps"
    if requested == "auto" and torch.cuda.is_available():
        return "cuda"
    return "cpu"


def translate_segments(manifest, segments, source_language, target_language):
    if source_language == target_language:
        return [dict(segment) for segment in segments]
    if source_language not in NLLB_LANGUAGES or target_language not in NLLB_LANGUAGES:
        raise ValueError(
            f"Paire de traduction non prise en charge: {source_language} -> {target_language}"
        )

    import torch
    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained(
        manifest["translationModelPath"],
        src_lang=NLLB_LANGUAGES[source_language],
        local_files_only=True,
    )
    model = AutoModelForSeq2SeqLM.from_pretrained(
        manifest["translationModelPath"], local_files_only=True
    )
    device = translation_device(manifest, torch)
    model.to(device)
    model.eval()
    translated = []
    batch_size = 8
    for offset in range(0, len(segments), batch_size):
        batch = segments[offset:offset + batch_size]
        encoded = tokenizer(
            [item["text"] for item in batch],
            return_tensors="pt",
            padding=True,
            truncation=True,
            max_length=512,
        )
        encoded = {key: value.to(device) for key, value in encoded.items()}
        with torch.inference_mode():
            generated = model.generate(
                **encoded,
                forced_bos_token_id=tokenizer.convert_tokens_to_ids(
                    NLLB_LANGUAGES[target_language]
                ),
                max_new_tokens=256,
            )
        texts = tokenizer.batch_decode(generated, skip_special_tokens=True)
        translated.extend([
            {"start": source["start"], "end": source["end"], "text": text.strip()}
            for source, text in zip(batch, texts)
        ])
    return translated


def execute(manifest, payload, output_path):
    target_language = normalize_language(payload.get("targetLanguage"))
    transcript = payload.get("transcript")
    if transcript:
        source_language = normalize_language(transcript.get("sourceLanguage"))
        source_segments = transcript.get("segments") or []
        include_source = False
    else:
        audio_path = payload.get("audioPath")
        if not audio_path or not Path(audio_path).is_file():
            raise ValueError("La source audio IA est absente.")
        if manifest["engine"] == "faster-whisper":
            source_language, source_segments = transcribe_faster_whisper(manifest, audio_path)
        else:
            source_language, source_segments = transcribe_whisper_cpp(
                manifest, audio_path, Path(output_path).parent
            )
        include_source = True
    if not source_segments:
        raise ValueError("Aucune parole exploitable n'a été détectée.")
    target_segments = translate_segments(
        manifest, source_segments, source_language, target_language
    )
    result = {
        "sourceLanguage": source_language,
        "targetLanguage": target_language,
        "targetSegments": target_segments,
        "transcriptionModel": manifest.get("model", "unknown"),
        "translationModel": (
            "none" if source_language == target_language
            else manifest.get("translationModel", "unknown")
        ),
    }
    if include_source:
        result["sourceSegments"] = source_segments
    write_json(output_path, result)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--probe", action="store_true")
    parser.add_argument("--input")
    parser.add_argument("--output")
    args = parser.parse_args()
    manifest = load_json(args.manifest)
    if args.probe:
        print(json.dumps(probe(manifest), ensure_ascii=False))
        return
    if not args.input or not args.output:
        parser.error("--input et --output sont requis hors mode --probe")
    execute(manifest, load_json(args.input), args.output)


if __name__ == "__main__":
    main()
