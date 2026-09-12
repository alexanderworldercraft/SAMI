import argparse
import ctypes
import difflib
import json
import math
import os
import re
import subprocess
import unicodedata
from collections import Counter
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

_DLL_DIRECTORY_HANDLES = []
_CONFIGURED_CUDA_PATHS = None
REPETITIVE_TRANSCRIPTION_CODE = "AI_SUBTITLE_REPETITIVE_TRANSCRIPTION"
CONTEXTUAL_TRANSLATION_CODE = "AI_SUBTITLE_CONTEXTUAL_TRANSLATION_QUALITY"
TRANSLATION_QUALITY_LOG = "translation-quality-error.json"
SENTENCE_END_PATTERN = re.compile(r"[.!?…。！？][\"'»）)]*$")


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


def normalize_quality_text(value):
    normalized = unicodedata.normalize("NFKC", str(value or "")).casefold()
    normalized = "".join(
        " " if character.isspace() or unicodedata.category(character)[0] in ("P", "S")
        else character
        for character in normalized
    )
    return " ".join(normalized.split())


def assert_transcript_quality(segments, label="transcription"):
    texts = [normalize_quality_text(item.get("text")) for item in segments]
    texts = [text for text in texts if text]
    if len(texts) < 40:
        return

    occurrences = Counter(texts)
    dominant_count = max(occurrences.values(), default=0)
    maximum_consecutive = 0
    consecutive = 0
    previous = None
    for text in texts:
        consecutive = consecutive + 1 if text == previous else 1
        previous = text
        maximum_consecutive = max(maximum_consecutive, consecutive)

    dominant_ratio = dominant_count / len(texts)
    unique_ratio = len(occurrences) / len(texts)
    repetitive = (
        maximum_consecutive >= 8
        or (dominant_count >= 20 and dominant_ratio >= 0.35)
        or (len(texts) >= 100 and unique_ratio <= 0.08)
    )
    if repetitive:
        raise RuntimeError(
            f"[{REPETITIVE_TRANSCRIPTION_CODE}] La {label} IA contient une répétition "
            f"anormale ({dominant_count} occurrences sur {len(texts)} segments)."
        )


def configure_cuda_library_paths(manifest):
    global _CONFIGURED_CUDA_PATHS
    if _CONFIGURED_CUDA_PATHS is not None:
        return _CONFIGURED_CUDA_PATHS
    paths = []
    seen = set()
    for configured_path in manifest.get("cudaLibraryPaths") or []:
        directory = Path(str(configured_path)).resolve()
        if not directory.is_dir() or str(directory) in seen:
            continue
        seen.add(str(directory))
        paths.append(directory)

    if (
        os.name == "nt"
        and manifest.get("engine") == "faster-whisper"
        and manifest.get("device") == "cuda"
        and not paths
    ):
        raise RuntimeError(
            "Les chemins des DLL CUDA sont absents du manifeste. "
            "Relancez npm run setup:ai."
        )

    if os.name == "nt":
        for directory in paths:
            _DLL_DIRECTORY_HANDLES.append(os.add_dll_directory(str(directory)))
    _CONFIGURED_CUDA_PATHS = paths
    return paths


def load_cuda_library(manifest, filename):
    for directory in configure_cuda_library_paths(manifest):
        candidate = directory / filename
        if candidate.is_file():
            return ctypes.CDLL(str(candidate))
    return ctypes.CDLL(filename)


def probe(manifest):
    engine = manifest.get("engine")
    python_ready = True
    error = None
    torch_module = None
    torch_version = None
    torch_cuda_version = None
    torch_cuda_available = False
    try:
        import torch
        import transformers  # noqa: F401
        torch_module = torch
        torch_version = str(torch.__version__)
        torch_cuda_version = torch.version.cuda
        torch_cuda_available = bool(torch.cuda.is_available())
        if engine == "faster-whisper":
            import faster_whisper  # noqa: F401
            import ctranslate2
            if manifest.get("device") == "cuda":
                cuda_libraries = (
                    ("cublas64_12.dll", "cudnn64_9.dll", "cudnn_ops64_9.dll")
                    if os.name == "nt"
                    else ("libcublas.so.12", "libcudnn.so.9", "libcudnn_ops.so.9")
                )
                for library in cuda_libraries:
                    load_cuda_library(manifest, library)
                if ctranslate2.get_cuda_device_count() < 1:
                    raise RuntimeError("Aucun GPU CUDA utilisable par CTranslate2.")
                if not torch_cuda_available:
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
        "capabilities": {
            "translationDevice": manifest.get("translationDevice", "auto"),
            "torchVersion": torch_version,
            "torchCudaVersion": torch_cuda_version,
            "torchCudaAvailable": torch_cuda_available,
        },
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
        word_timestamps=True,
        vad_filter=True,
        vad_parameters={
            "min_silence_duration_ms": 500,
            "speech_pad_ms": 200,
        },
        condition_on_previous_text=False,
        temperature=0.0,
        compression_ratio_threshold=2.4,
        log_prob_threshold=-0.8,
        no_speech_threshold=0.6,
    )
    normalized = []
    for segment in segments:
        text = segment.text.strip()
        if not text:
            continue
        words = []
        for word in segment.words or []:
            word_text = str(word.word or "").strip()
            if not word_text or word.start is None or word.end is None:
                continue
            words.append({
                "start": float(word.start),
                "end": float(word.end),
                "text": word_text,
                "confidence": round(max(0.0, min(1.0, float(word.probability or 0.0))), 4),
            })
        average_log_probability = float(getattr(segment, "avg_logprob", -10.0))
        normalized.append({
            "start": float(segment.start),
            "end": float(segment.end),
            "text": text,
            "confidence": round(max(0.0, min(1.0, math.exp(average_log_probability))), 4),
            "words": words,
        })
    return normalize_language(info.language), normalized


def seconds_from_timestamp(value):
    parts = str(value or "0").replace(",", ".").split(":")
    try:
        parts = [float(item) for item in parts]
    except ValueError:
        return 0.0
    while len(parts) < 3:
        parts.insert(0, 0.0)
    return parts[-3] * 3600 + parts[-2] * 60 + parts[-1]


def parse_whisper_cpp_transcription(payload):
    """Normalize whisper.cpp full JSON, including token-level timestamps."""
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
            words = []
            for token in item.get("tokens") or item.get("words") or []:
                if not isinstance(token, dict):
                    continue
                token_offsets = token.get("offsets") or {}
                token_timestamps = token.get("timestamps") or {}
                token_start = token_offsets.get("from")
                token_end = token_offsets.get("to")
                if token_start is not None and token_end is not None:
                    token_start = float(token_start) / 1000.0
                    token_end = float(token_end) / 1000.0
                else:
                    token_start = seconds_from_timestamp(
                        token_timestamps.get("from") or token.get("start")
                    )
                    token_end = seconds_from_timestamp(
                        token_timestamps.get("to") or token.get("end")
                    )
                token_text = str(token.get("text") or token.get("word") or "").strip()
                probability = token.get("p", token.get("probability", token.get("confidence")))
                if (
                    token_text
                    and not (token_text.startswith("[_") and token_text.endswith("_]"))
                    and token_end > token_start
                ):
                    word = {
                        "start": token_start,
                        "end": token_end,
                        "text": token_text,
                    }
                    try:
                        word["confidence"] = round(
                            max(0.0, min(1.0, float(probability))), 4
                        )
                    except (TypeError, ValueError):
                        pass
                    words.append(word)
            segments.append({
                "start": start,
                "end": end,
                "text": text,
                **({"words": words} if words else {}),
            })
    return language, segments


def transcribe_whisper_cpp(manifest, audio_path, output_root):
    prefix = str(output_root / "whisper")
    command = [
        manifest["whisperCppPath"], "-m", manifest["modelPath"],
        "-f", audio_path, "-l", "auto", "-ojf", "-of", prefix,
        "-mc", "0", "-nf", "-sns", "-lpt", "-0.8",
    ]
    vad_model_path = manifest.get("vadModelPath")
    vad_candidates = [Path(vad_model_path)] if vad_model_path else []
    model_directory = Path(manifest["modelPath"]).resolve().parent
    vad_candidates.extend([
        model_directory / "ggml-silero-v6.2.0.bin",
        model_directory / "for-tests-silero-v6.2.0-ggml.bin",
    ])
    vad_model = next((candidate for candidate in vad_candidates if candidate.is_file()), None)
    if vad_model:
        command.extend([
            "--vad", "--vad-model", str(vad_model),
            "--vad-min-silence-duration-ms", "500",
            "--vad-max-speech-duration-s", "30",
            "--vad-speech-pad-ms", "200",
        ])
    subprocess.run(command, check=True, capture_output=True, text=True)
    return parse_whisper_cpp_transcription(load_json(f"{prefix}.json"))


def translation_device(manifest, torch):
    requested = manifest.get("translationDevice", "auto")
    if requested == "cuda" and torch.cuda.is_available():
        return "cuda"
    if requested in ("mps", "auto") and getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps"
    if requested == "auto" and torch.cuda.is_available():
        return "cuda"
    return "cpu"


def tighten_transcript_segments(segments):
    """Anchor ASR segments to the first and last actually spoken word."""
    tightened = []
    for segment in segments or []:
        value = dict(segment)
        words = []
        for word in segment.get("words") or []:
            try:
                word_start = float(word.get("start"))
                word_end = float(word.get("end"))
            except (TypeError, ValueError):
                continue
            word_text = str(word.get("text") or "").strip()
            if word_text and word_end > word_start:
                words.append({**word, "start": word_start, "end": word_end, "text": word_text})
        words.sort(key=lambda item: (item["start"], item["end"]))
        if words:
            value["start"] = words[0]["start"]
            value["end"] = words[-1]["end"]
            value["words"] = words
        tightened.append(value)
    return tightened


def contextualize_segments(segments, max_duration=9.0, max_characters=240, max_gap=0.9):
    """Regroupe les fragments ASR en phrases traduisibles sans perdre leur timeline."""
    units = []
    current = None
    for index, segment in enumerate(segments):
        text = re.sub(r"\s+", " ", str(segment.get("text") or "")).strip()
        if not text:
            continue
        start = float(segment.get("start", 0.0))
        end = float(segment.get("end", start))
        if end <= start:
            continue
        gap = start - float(current["end"]) if current else 0.0
        projected_text = f"{current['text']} {text}".strip() if current else text
        projected_duration = end - float(current["start"]) if current else end - start
        must_flush = bool(current) and (
            gap > max_gap
            or projected_duration > max_duration
            or len(projected_text) > max_characters
            or SENTENCE_END_PATTERN.search(str(current["text"]).strip())
        )
        if must_flush:
            units.append(current)
            current = None
        if current is None:
            current = {
                "start": start,
                "end": end,
                "text": text,
                "sourceIndexes": [index],
                "words": list(segment.get("words") or []),
            }
        else:
            japanese = bool(re.search(r"[\u3040-\u30ff\u3400-\u9fff]", current["text"] + text))
            current["text"] = f"{current['text']}{'' if japanese else ' '}{text}".strip()
            current["end"] = end
            current["sourceIndexes"].append(index)
            current["words"].extend(segment.get("words") or [])
        if SENTENCE_END_PATTERN.search(text) or end - float(current["start"]) >= max_duration:
            units.append(current)
            current = None
    if current:
        units.append(current)
    return units


def translate_text_batch(model, tokenizer, texts, target_language, device):
    encoded = tokenizer(
        texts,
        return_tensors="pt",
        padding=True,
        truncation=True,
        max_length=512,
    )
    encoded = {key: value.to(device) for key, value in encoded.items()}
    import torch
    with torch.inference_mode():
        generated = model.generate(
            **encoded,
            forced_bos_token_id=tokenizer.convert_tokens_to_ids(
                NLLB_LANGUAGES[target_language]
            ),
            num_beams=5,
            repetition_penalty=1.12,
            no_repeat_ngram_size=3,
            max_new_tokens=384,
        )
    return [text.strip() for text in tokenizer.batch_decode(generated, skip_special_tokens=True)]


def extract_numbers(value):
    tokens = re.findall(r"\d+(?:[.,]\d+)*", unicodedata.normalize("NFKC", str(value or "")))
    expanded = []
    for token in tokens:
        parts = re.split(r"[.,]", token)
        # Japanese enumerations are commonly emitted as 1,2,3 without spaces.
        if len(parts) >= 3 and all(len(part) == 1 for part in parts):
            expanded.extend(parts)
        else:
            expanded.append(token)
    return expanded


TIME_PATTERN = re.compile(r"(?<!\d)(\d{1,2})\s*(?:h|:)\s*(\d{2})(?!\d)", re.IGNORECASE)
JAPANESE_TIME_PATTERN = re.compile(r"(?<!\d)(\d{1,2})\s*時\s*(\d{1,2})\s*分")
JAPANESE_SPEED_PATTERN = re.compile(r"時速\s*(\d+(?:[.,]\d+)?)\s*キロ")
SPEED_PATTERN = re.compile(
    r"(?<!\d)(\d+(?:[.,]\d+)?)\s*"
    r"(km\s*/\s*h|km\s+(?:par\s+)?heure|kilom(?:e|è)tres?\s+(?:par\s+)?heure|"
    r"mph|miles?\s+(?:an|per)\s+hour)",
    re.IGNORECASE,
)
COMPOUND_METER_PATTERN = re.compile(r"(?<!\d)(\d+)\s*m\s*(\d{1,2})(?!\d)", re.IGNORECASE)
LENGTH_PATTERN = re.compile(
    r"(?<!\d)(\d+(?:[.,]\d+)?)\s*"
    r"(km|kilometers?|kilometres?|kilomètres?|m|meters?|metres?|mètres?|miles?)\b",
    re.IGNORECASE,
)
JAPANESE_LENGTH_PATTERN = re.compile(r"(?<!\d)(\d+(?:[.,]\d+)?)\s*(キロ|メートル)")
JAPANESE_NUMBER_PATTERN = re.compile(
    r"(?<![0-9一-龯ぁ-んァ-ン])"
    r"(?=[0-9一二三四五六七八九十百千万億]*[一二三四五六七八九十百千万億])"
    r"[0-9一二三四五六七八九十百千万億]+"
)
JAPANESE_MULTIPLIER_PATTERN = re.compile(r"(?<!\d)(\d+(?:[.,]\d+)?)\s*倍")
WORD_MULTIPLIER_PATTERN = re.compile(r"\b(?:double|doublé|twice)\b", re.IGNORECASE)


def numeric_candidates(token):
    """Return locale-aware interpretations for a numeric token."""
    token = str(token).replace(" ", "")
    if not token:
        return set()
    separators = [index for index, character in enumerate(token) if character in ".,"]
    if not separators:
        return {float(token)}
    if len(separators) == 1:
        separator = token[separators[0]]
        left, right = token.split(separator)
        if len(right) == 3 and left != "0":
            return {float(left + right), float(f"{left}.{right}")}
        return {float(f"{left}.{right}")}

    parts = re.split(r"[.,]", token)
    candidates = set()
    if all(len(part) == 3 for part in parts[1:]):
        candidates.add(float("".join(parts)))
    decimal = f"{''.join(parts[:-1])}.{parts[-1]}"
    candidates.add(float(decimal))
    return candidates


def values_match(left_candidates, right_candidates, relative_tolerance=1e-9):
    return any(
        math.isclose(left, right, rel_tol=relative_tolerance, abs_tol=1e-9)
        for left in left_candidates
        for right in right_candidates
    )


def japanese_number_value(token):
    digits = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5,
              "六": 6, "七": 7, "八": 8, "九": 9}
    small_units = {"十": 10, "百": 100, "千": 1000}
    large_units = {"万": 10000, "億": 100000000}
    total = 0
    section = 0
    current = 0
    arabic = ""
    for character in token:
        if character.isdigit():
            arabic += character
            continue
        if arabic:
            current = int(arabic)
            arabic = ""
        if character in digits:
            current = digits[character]
        elif character in small_units:
            section += (current or 1) * small_units[character]
            current = 0
        elif character in large_units:
            section += current
            total += (section or 1) * large_units[character]
            section = 0
            current = 0
    if arabic:
        current = int(arabic)
    return float(total + section + current)


def extract_numeric_semantics(value):
    text = unicodedata.normalize("NFKC", str(value or "")).casefold()
    times = []
    speeds_kmh = []
    lengths_meters = []
    multipliers = []

    def capture_time(match):
        times.append((int(match.group(1)), int(match.group(2))))
        return " " * len(match.group(0))

    text = JAPANESE_TIME_PATTERN.sub(capture_time, text)
    text = TIME_PATTERN.sub(capture_time, text)

    def capture_japanese_speed(match):
        speeds_kmh.append(numeric_candidates(match.group(1)))
        return " " * len(match.group(0))

    text = JAPANESE_SPEED_PATTERN.sub(capture_japanese_speed, text)

    def capture_speed(match):
        candidates = numeric_candidates(match.group(1))
        unit = re.sub(r"\s+", " ", match.group(2)).strip()
        factor = 1.609344 if unit == "mph" or unit.startswith("mile") else 1.0
        speeds_kmh.append({value * factor for value in candidates})
        return " " * len(match.group(0))

    text = SPEED_PATTERN.sub(capture_speed, text)

    def capture_compound_meter(match):
        lengths_meters.append({float(match.group(1)) + float(match.group(2)) / 100})
        return " " * len(match.group(0))

    text = COMPOUND_METER_PATTERN.sub(capture_compound_meter, text)

    def capture_length(match):
        candidates = numeric_candidates(match.group(1))
        unit = match.group(2)
        if unit == "km" or unit.startswith("kilom"):
            factor = 1000.0
        elif unit.startswith("mile"):
            factor = 1609.344
        else:
            factor = 1.0
        lengths_meters.append({value * factor for value in candidates})
        return " " * len(match.group(0))

    text = LENGTH_PATTERN.sub(capture_length, text)

    def capture_japanese_length(match):
        factor = 1000.0 if match.group(2) == "キロ" else 1.0
        lengths_meters.append({value * factor for value in numeric_candidates(match.group(1))})
        return " " * len(match.group(0))

    text = JAPANESE_LENGTH_PATTERN.sub(capture_japanese_length, text)

    def capture_japanese_multiplier(match):
        multipliers.append(numeric_candidates(match.group(1)))
        return " " * len(match.group(0))

    text = JAPANESE_MULTIPLIER_PATTERN.sub(capture_japanese_multiplier, text)

    def capture_word_multiplier(match):
        multipliers.append({2.0})
        return " " * len(match.group(0))

    text = WORD_MULTIPLIER_PATTERN.sub(capture_word_multiplier, text)

    japanese_numbers = []

    def capture_japanese_number(match):
        japanese_numbers.append({japanese_number_value(match.group(0))})
        return " " * len(match.group(0))

    text = JAPANESE_NUMBER_PATTERN.sub(capture_japanese_number, text)
    numbers = [numeric_candidates(token) for token in extract_numbers(text)]
    return {
        "times": times,
        "speedsKmh": speeds_kmh,
        "lengthsMeters": lengths_meters,
        "multipliers": multipliers,
        "numbers": numbers + japanese_numbers,
    }


def numeric_content_is_equivalent(source, translated):
    source_values = extract_numeric_semantics(source)
    target_values = extract_numeric_semantics(translated)
    if len(source_values["times"]) != len(target_values["times"]):
        return False
    if any(
        source_minute != target_minute or source_hour % 12 != target_hour % 12
        for (source_hour, source_minute), (target_hour, target_minute)
        in zip(source_values["times"], target_values["times"])
    ):
        return False
    if len(source_values["speedsKmh"]) != len(target_values["speedsKmh"]):
        return False
    if any(
        not values_match(source_speed, target_speed, relative_tolerance=0.05)
        for source_speed, target_speed
        in zip(source_values["speedsKmh"], target_values["speedsKmh"])
    ):
        return False
    if len(source_values["lengthsMeters"]) != len(target_values["lengthsMeters"]):
        return False
    if any(
        not values_match(source_length, target_length, relative_tolerance=0.01)
        for source_length, target_length
        in zip(source_values["lengthsMeters"], target_values["lengthsMeters"])
    ):
        return False
    if len(source_values["multipliers"]) != len(target_values["multipliers"]):
        return False
    if any(
        not values_match(source_multiplier, target_multiplier)
        for source_multiplier, target_multiplier
        in zip(source_values["multipliers"], target_values["multipliers"])
    ):
        return False
    if len(source_values["numbers"]) != len(target_values["numbers"]):
        return False
    return all(
        values_match(source_number, target_number)
        for source_number, target_number
        in zip(source_values["numbers"], target_values["numbers"])
    )


def expected_script_is_present(text, language):
    alphabetic = [
        character for character in str(text or "")
        if unicodedata.category(character).startswith("L")
    ]
    # Une réplique composée uniquement de nombres, de ponctuation ou de
    # symboles est valable dans toutes les langues.
    if not alphabetic:
        return True
    if language == "ja":
        return bool(re.search(r"[\u3040-\u30ff\u3400-\u9fff]", text))
    return bool(re.search(r"[A-Za-zÀ-ÖØ-öø-ÿ]", text))


TRANSLATION_CRITICAL_FLAGS = frozenset({
    "numbers_changed",
    "unexpected_writing_system",
    "local_repetition",
})


def contextual_translation_blocking_policy(segment_reports):
    """Bloque une piste seulement si ses anomalies deviennent structurelles."""
    segment_count = len(segment_reports)
    critical = [
        report for report in segment_reports
        if TRANSLATION_CRITICAL_FLAGS.intersection(report.get("flags") or [])
        or (
            "weak_back_translation" in (report.get("flags") or [])
            and report.get("backTranslationSimilarity", 1) < 0.18
        )
    ]
    repetition = [
        report for report in critical
        if "local_repetition" in (report.get("flags") or [])
    ]
    wrong_script = [
        report for report in critical
        if "unexpected_writing_system" in (report.get("flags") or [])
    ]
    # Sur une longue vidéo, quelques passages douteux doivent pouvoir être
    # corrigés dans l'éditeur. Une accumulation indique en revanche un modèle
    # ou une langue cible défaillante et reste bloquante.
    critical_limit = max(3, math.ceil(segment_count * 0.03))
    wrong_script_limit = max(3, math.ceil(segment_count * 0.10))
    reasons = []
    if len(critical) >= critical_limit:
        reasons.append("critical_warning_density")
    if len(repetition) >= 2:
        reasons.append("repeated_generation_failures")
    if len(wrong_script) >= wrong_script_limit:
        reasons.append("target_script_failure")
    blocked = bool(reasons)
    return {
        "blocked": blocked,
        "reasons": reasons,
        "criticalWarningCount": len(critical),
        "criticalWarningLimit": critical_limit,
        "blockingIndexes": [report["index"] for report in critical] if blocked else [],
    }


def contextual_translation_quality(source_units, translated_texts, back_translated_texts, target_language):
    warnings = []
    segment_reports = []
    for index, (source, translated, back_translated) in enumerate(zip(
        source_units, translated_texts, back_translated_texts
    )):
        source_normalized = normalize_quality_text(source["text"])
        back_normalized = normalize_quality_text(back_translated)
        similarity = difflib.SequenceMatcher(None, source_normalized, back_normalized).ratio()
        source_numbers = extract_numbers(source["text"])
        target_numbers = extract_numbers(translated)
        flags = []
        if source_numbers and target_numbers and not numeric_content_is_equivalent(
            source["text"], translated
        ):
            flags.append("numbers_changed")
        elif source_numbers and not target_numbers:
            flags.append("numbers_not_literal")
        if len(source_normalized) >= 12 and similarity < 0.28:
            flags.append("weak_back_translation")
        if not expected_script_is_present(translated, target_language):
            flags.append("unexpected_writing_system")
        normalized_target = normalize_quality_text(translated)
        words = normalized_target.split()
        if len(words) >= 9 and len(set(words)) / len(words) < 0.35:
            flags.append("local_repetition")
        report = {
            "index": index,
            "start": round(float(source["start"]), 3),
            "end": round(float(source["end"]), 3),
            "backTranslationSimilarity": round(similarity, 4),
            "flags": flags,
        }
        segment_reports.append(report)
        if flags:
            warnings.append(report)
    blocking_policy = contextual_translation_blocking_policy(segment_reports)
    return {
        "schemaVersion": 2,
        "strategy": "sentence-context-nllb-backtranslation-v3-proportional",
        "segmentCount": len(source_units),
        "warningCount": len(warnings),
        "criticalWarningCount": blocking_policy["criticalWarningCount"],
        "criticalWarningLimit": blocking_policy["criticalWarningLimit"],
        "blockingCount": len(blocking_policy["blockingIndexes"]),
        "blockingReasons": blocking_policy["reasons"],
        "blockingIndexes": blocking_policy["blockingIndexes"],
        "warnings": warnings[:200],
        "segments": segment_reports,
    }


def write_translation_quality_log(output_path, source_language, target_language, translated, quality):
    """Keep the generated texts only when contextual validation blocks the job."""
    blocking_indexes = set(quality.get("blockingIndexes") or [])
    log_path = Path(output_path).parent / TRANSLATION_QUALITY_LOG
    write_json(log_path, {
        "schemaVersion": 1,
        "errorCode": CONTEXTUAL_TRANSLATION_CODE,
        "sourceLanguage": source_language,
        "targetLanguage": target_language,
        "blockingCount": quality.get("blockingCount", 0),
        "warningCount": quality.get("warningCount", 0),
        "segments": [
            segment for index, segment in enumerate(translated)
            if index in blocking_indexes
        ],
    })
    return str(log_path)


def translate_segments(manifest, segments, source_language, target_language):
    source_units = contextualize_segments(segments)
    if source_language == target_language:
        return [
            {"start": unit["start"], "end": unit["end"], "text": unit["text"]}
            for unit in source_units
        ], {
            "schemaVersion": 1,
            "strategy": "source-sentence-context-v2",
            "segmentCount": len(source_units),
            "warningCount": 0,
            "warnings": [],
        }
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
    device = translation_device(manifest, torch)
    model = AutoModelForSeq2SeqLM.from_pretrained(
        manifest["translationModelPath"],
        local_files_only=True,
        torch_dtype=torch.float32 if device == "cpu" else torch.float16,
    )
    model.to(device)
    model.eval()
    translated_texts = []
    batch_size = 8
    for offset in range(0, len(source_units), batch_size):
        batch = source_units[offset:offset + batch_size]
        translated_texts.extend(translate_text_batch(
            model, tokenizer, [item["text"] for item in batch], target_language, device
        ))
    reverse_tokenizer = AutoTokenizer.from_pretrained(
        manifest["translationModelPath"],
        src_lang=NLLB_LANGUAGES[target_language],
        local_files_only=True,
    )
    back_translated_texts = []
    for offset in range(0, len(translated_texts), batch_size):
        back_translated_texts.extend(translate_text_batch(
            model,
            reverse_tokenizer,
            translated_texts[offset:offset + batch_size],
            source_language,
            device,
        ))
    quality = contextual_translation_quality(
        source_units, translated_texts, back_translated_texts, target_language
    )
    translated = [
        {
            "start": source["start"],
            "end": source["end"],
            "text": text,
            "sourceText": source["text"],
            "backTranslation": back_text,
            "quality": quality["segments"][index],
        }
        for index, (source, text, back_text) in enumerate(zip(
            source_units, translated_texts, back_translated_texts
        ))
    ]
    return translated, quality


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
    source_segments = tighten_transcript_segments(source_segments)
    assert_transcript_quality(source_segments, "transcription source")
    if payload.get("transcriptionOnly") is True:
        write_json(output_path, {
            "sourceLanguage": source_language, "sourceSegments": source_segments,
            "transcriptionModel": manifest.get("model", "unknown"),
        })
        return
    target_segments, quality_report = translate_segments(
        manifest, source_segments, source_language, target_language
    )
    assert_transcript_quality(target_segments, "piste de sous-titres")
    if quality_report.get("blockingCount", 0) > 0:
        diagnostic_path = write_translation_quality_log(
            output_path,
            source_language,
            target_language,
            target_segments,
            quality_report,
        )
        first = next(
            (item for item in quality_report.get("warnings", []) if item.get("flags")),
            None,
        )
        position = f" à {float(first['start']):.2f}s" if first else ""
        reasons = ", ".join(quality_report.get("blockingReasons") or ["unknown"])
        raise RuntimeError(
            f"[{CONTEXTUAL_TRANSLATION_CODE}] La traduction contextuelle est bloquée{position}: "
            f"{quality_report.get('criticalWarningCount', 0)} passage(s) critique(s) sur "
            f"{quality_report.get('segmentCount', 0)} dépassent le seuil global "
            f"({reasons}). "
            f"Diagnostic conservé dans {diagnostic_path}."
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
        "qualityReport": quality_report,
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
    configure_cuda_library_paths(manifest)
    if args.probe:
        print(json.dumps(probe(manifest), ensure_ascii=False))
        return
    if not args.input or not args.output:
        parser.error("--input et --output sont requis hors mode --probe")
    execute(manifest, load_json(args.input), args.output)


if __name__ == "__main__":
    main()
