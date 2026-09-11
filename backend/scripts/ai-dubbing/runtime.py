import argparse
import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import sys
import time
import uuid
from contextlib import contextmanager
import unicodedata
from pathlib import Path


SUPPORTED_LANGUAGES = {"en", "fr", "ja"}
QWEN_LANGUAGES = {"en": "English", "fr": "French", "ja": "Japanese"}
OFFLINE_VALUES = {"1", "true", "yes", "on"}
MIN_DIALOGUE_UNIT_SECONDS = 0.25
MIN_SYNTHESIS_INPUT_SECONDS = 0.04
MIN_DIALOGUE_MERGE_PART_SECONDS = 0.75
SHORT_SPEAKER_ISLAND_SECONDS = 0.5
SHORT_SPEAKER_NEIGHBOR_GAP_SECONDS = 1.0
MAX_SYNTHESIS_ACCELERATION = 1.3
MAX_VOICE_TAIL_SPILLOVER_SECONDS = 1.0
MAX_SOURCE_SILENCE_EXTENSION_SECONDS = 1.0
MAX_DETECTED_ONSET_DELAY_SECONDS = 0.25
MAX_TIMING_BOUNDARY_TRIM_SECONDS = 0.02
SORTFORMER_CORE_SECONDS = 75.0
SORTFORMER_CONTEXT_SECONDS = 7.5
NON_RETRYABLE_ERROR_PREFIX = "[SAMI dubbing error] "
V5_ALIGNED_QUALITY_PROFILE = "sami-dubbing-v5-aligned-quality"
V5_STABLE_BOUNDARIES_PROFILE = "sami-dubbing-v5-stable-boundaries-r1"
V5_ALIGNED_SENTENCES_PROFILE = "sami-dubbing-v5-aligned-sentences-r2"
V5_FLEXIBLE_TAILS_PROFILE = "sami-dubbing-v5-flexible-tails-r3"
V5_GUIDED_REFERENCES_PROFILE = "sami-dubbing-v5-guided-references-r4"
V5_GUIDED_REFERENCES_R4_R1_PROFILE = "sami-dubbing-v5-guided-references-r4-r1"
V5_GUIDED_REFERENCES_R4_R2_PROFILE = "sami-dubbing-v5-guided-references-r4-r2"
V5_TRANSLATED_CLAUSES_PROFILE = "sami-dubbing-v5-translated-clauses-r5"
V5_BOUNDED_SAMPLES_PROFILE = "sami-dubbing-v5-bounded-samples-r5-r1"
V5_JAPANESE_IDENTITY_PROFILE = "sami-dubbing-v5-japanese-identity-r5-r2"
V5_JAPANESE_BOUNDED_PROFILE = "sami-dubbing-v5-japanese-bounded-r5-r3"
V5_ENGLISH_IDENTITY_PROFILE = "sami-dubbing-v5-english-identity-r5-r4"
JAPANESE_BOUNDED_PROFILES = {V5_JAPANESE_BOUNDED_PROFILE, V5_ENGLISH_IDENTITY_PROFILE}
BOUNDED_V5_PROFILES = {V5_BOUNDED_SAMPLES_PROFILE, V5_JAPANESE_IDENTITY_PROFILE, *JAPANESE_BOUNDED_PROFILES}
TRANSLATED_V5_PROFILES = {V5_TRANSLATED_CLAUSES_PROFILE, *BOUNDED_V5_PROFILES}
V6_CLEAN_PHRASES_R9_R1_PROFILE = "sami-dubbing-v6-clean-phrases-r9-r1"
SUPPORTED_DUBBING_PROFILES = {
    V5_ENGLISH_IDENTITY_PROFILE,
    V5_JAPANESE_BOUNDED_PROFILE,
    V5_JAPANESE_IDENTITY_PROFILE,
    V5_BOUNDED_SAMPLES_PROFILE,
    V5_TRANSLATED_CLAUSES_PROFILE,
    V5_ALIGNED_QUALITY_PROFILE,
    V5_STABLE_BOUNDARIES_PROFILE,
    V5_ALIGNED_SENTENCES_PROFILE,
    V5_FLEXIBLE_TAILS_PROFILE,
    V5_GUIDED_REFERENCES_PROFILE,
    V5_GUIDED_REFERENCES_R4_R1_PROFILE,
    V5_GUIDED_REFERENCES_R4_R2_PROFILE,
    V6_CLEAN_PHRASES_R9_R1_PROFILE,
}
PROFILE_GENERATION_CONFIG_HASHES = {
    V5_ENGLISH_IDENTITY_PROFILE: "0086594bd5b648717f336f68e4acb52b05158873d32c96c4c0f499acec8084d7",
    V5_JAPANESE_BOUNDED_PROFILE: "2e5cddc63b77895b7f5d7a45089814b1aa020e44e3e1c4407d2bcbca0eb3feaf",
    V5_JAPANESE_IDENTITY_PROFILE: "ee0227a0647a8e99f36e96805b4ab3ff68457d3c19b87f147acafcf098e505f7",
    V5_BOUNDED_SAMPLES_PROFILE: "0ca45ec43094d5e158452870f942010287c1abc2c06f3f0dd639611a28f533d9",
    V5_TRANSLATED_CLAUSES_PROFILE: "faff25bdb5e3c0354c196338e16fb7ebebf3887c48b01ec248fe5f5bd0d1d90b",
    V5_GUIDED_REFERENCES_R4_R2_PROFILE: (
        "5619b8512e8840cd51158b182a4f0e5356ff3f5f936b0f079648cdfc27926b51"
    ),
    V5_GUIDED_REFERENCES_R4_R1_PROFILE: (
        "9d894c93f2dced7f0d19f5e1a4fa49a8138fad869b27eb60501cdea1736aa0b3"
    ),
    V5_GUIDED_REFERENCES_PROFILE: (
        "50dfaca4b73e46ae6af75984b576429afb610ff96666439b9c4c875d6c2a908e"
    ),
    V5_FLEXIBLE_TAILS_PROFILE: (
        "b63843015ecdf8cc000714df5bcaa7415bf1788475d61cd43bb4beb36efc60a4"
    ),
    V5_ALIGNED_SENTENCES_PROFILE: (
        "acdd393d8be4d19d26a91b85c915602dcafbc81fd6f473ab61539c1c8eafcfd3"
    ),
    V5_STABLE_BOUNDARIES_PROFILE: (
        "d9b8559b4c019e83e5e1cbe2f8529e2ece8a42325d94058a9ed56db21f4936fc"
    ),
    V5_ALIGNED_QUALITY_PROFILE: (
        "dbe8d8fb553ca099f099bd3c4891125c472509ad0ea05e0c34ceebbe2008ac80"
    ),
    V6_CLEAN_PHRASES_R9_R1_PROFILE: (
        "3421072eb07d9f86b1fce868a77f01318d8c849e55537075a328b600cdc38412"
    ),
}


class DubbingInputQualityError(RuntimeError):
    code = "AI_DUBBING_INPUT_QUALITY_BLOCKED"


class DubbingGenerationLimitError(DubbingInputQualityError):
    code = "AI_DUBBING_GENERATION_LIMIT"


class DubbingGenerationContractError(DubbingInputQualityError):
    code = "AI_DUBBING_GENERATION_CONTRACT"


def resolve_dubbing_profile(pipeline_version):
    profile = str(pipeline_version or "").strip()
    if profile not in SUPPORTED_DUBBING_PROFILES:
        raise ValueError(
            f"Profil de doublage IA inconnu: {profile or '(vide)'}."
        )
    return profile


def is_v5_profile(profile):
    return profile in {*BOUNDED_V5_PROFILES, V5_ALIGNED_QUALITY_PROFILE, V5_STABLE_BOUNDARIES_PROFILE,
                       V5_ALIGNED_SENTENCES_PROFILE, V5_FLEXIBLE_TAILS_PROFILE,
                       V5_GUIDED_REFERENCES_PROFILE, V5_GUIDED_REFERENCES_R4_R1_PROFILE,
                       V5_GUIDED_REFERENCES_R4_R2_PROFILE, V5_TRANSLATED_CLAUSES_PROFILE}


def flexible_v5_profile(profile):
    return profile in {*BOUNDED_V5_PROFILES, V5_FLEXIBLE_TAILS_PROFILE, V5_GUIDED_REFERENCES_PROFILE,
                       V5_GUIDED_REFERENCES_R4_R1_PROFILE,
                       V5_GUIDED_REFERENCES_R4_R2_PROFILE, V5_TRANSLATED_CLAUSES_PROFILE}


def v5_short_quality_profile(profile):
    return profile in {
        *BOUNDED_V5_PROFILES,
        V5_TRANSLATED_CLAUSES_PROFILE,
        V5_GUIDED_REFERENCES_R4_R1_PROFILE,
        V5_GUIDED_REFERENCES_R4_R2_PROFILE,
    }


def log(message):
    print(f"[SAMI dubbing] {message}", file=sys.stderr, flush=True)


def report_progress(value, stage):
    payload = json.dumps({"progress": int(value), "stage": stage}, separators=(",", ":"))
    print(f"[SAMI dubbing progress] {payload}", file=sys.stderr, flush=True)


def load_json(path):
    with Path(path).open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path, value):
    destination = Path(path)
    temporary = destination.with_suffix(f"{destination.suffix}.tmp")
    with temporary.open("w", encoding="utf-8") as handle:
        json.dump(value, handle, ensure_ascii=False)
    os.replace(temporary, destination)


def run(command, *args, capture=False):
    completed = subprocess.run(
        [str(command), *(str(arg) for arg in args)],
        check=True,
        text=True,
        capture_output=capture,
    )
    return completed.stdout.strip() if capture else ""


def digest(path, algorithm="sha256"):
    value = hashlib.new(algorithm)
    with Path(path).open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            value.update(chunk)
    return value.hexdigest()


def timestamp_seconds(value):
    clean = value.strip().replace(",", ".")
    parts = clean.split(":")
    if len(parts) == 2:
        parts.insert(0, "0")
    if len(parts) != 3:
        raise ValueError(f"Horodatage WebVTT invalide: {value}")
    return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])


def clean_vtt_text(lines):
    text = " ".join(line.strip() for line in lines if line.strip())
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"\{[^}]+\}", "", text)
    return re.sub(r"\s+", " ", text).strip()


def parse_vtt(path, start_seconds=0.0, limit_seconds=None):
    lines = Path(path).read_text(encoding="utf-8-sig").splitlines()
    cues = []
    index = 0
    while index < len(lines):
        line = lines[index].strip()
        if "-->" not in line:
            index += 1
            continue
        start_raw, end_raw = (part.strip().split()[0] for part in line.split("-->", 1))
        start = timestamp_seconds(start_raw)
        end = timestamp_seconds(end_raw)
        index += 1
        text_lines = []
        while index < len(lines) and lines[index].strip():
            text_lines.append(lines[index])
            index += 1
        range_end = start_seconds + limit_seconds if limit_seconds is not None else None
        if range_end is not None:
            start_in_range = max(start, start_seconds)
            end_in_range = min(end, range_end)
        else:
            start_in_range = start
            end_in_range = end
        text = clean_vtt_text(text_lines)
        if text and end_in_range > start_in_range:
            cues.append({
                "start": start_in_range - start_seconds,
                "end": end_in_range - start_seconds,
                "sourceStart": start,
                "sourceEnd": end,
                "text": text,
            })
        index += 1
    if not cues:
        raise ValueError("Le sous-titre cible ne contient aucun segment exploitable.")
    return cues


def parse_voice_script(payload):
    if not isinstance(payload, dict) or payload.get("schemaVersion") not in (1, 2):
        raise ValueError("Le script vocal de doublage est invalide.")
    raw_cues = payload.get("cues") or []
    if not isinstance(raw_cues, list) or not raw_cues:
        raise ValueError("Le script vocal ne contient aucune réplique.")
    cues = []
    for index, item in enumerate(raw_cues):
        try:
            display_start = float(item.get("start"))
            display_end = float(item.get("end"))
            start = float(item.get("speechStart", display_start))
            end = float(item.get("speechEnd", display_end))
        except (TypeError, ValueError) as error:
            raise ValueError(f"Le repère du script vocal {index + 1} est invalide.") from error
        display_text = re.sub(r"\s+", " ", str(item.get("displayText") or "")).strip()
        spoken_text = re.sub(r"\s+", " ", str(item.get("spokenText") or "")).strip()
        if (
            display_start < 0
            or display_end <= display_start
            or start < 0
            or end <= start
            or not display_text
            or not spoken_text
        ):
            raise ValueError(f"La réplique du script vocal {index + 1} est invalide.")
        confidence = item.get("sourceConfidence")
        if confidence is not None:
            confidence = max(0.0, min(1.0, float(confidence)))
        source_words = []
        for word in item.get("sourceWords") or []:
            try:
                word_start = float(word.get("start"))
                word_end = float(word.get("end"))
            except (AttributeError, TypeError, ValueError):
                continue
            word_text = re.sub(r"\s+", " ", str(word.get("text") or "")).strip()
            if word_text and word_end > word_start:
                source_words.append({
                    "start": word_start,
                    "end": word_end,
                    "text": word_text,
                    "confidence": word.get("confidence"),
                })
        source_words.sort(key=lambda word: (word["start"], word["end"]))
        cues.append({
            "start": start,
            "end": end,
            "sourceStart": start,
            "sourceEnd": end,
            "displayStart": display_start,
            "displayEnd": display_end,
            "text": spoken_text,
            "displayText": display_text,
            "sourceText": re.sub(r"\s+", " ", str(item.get("sourceText") or "")).strip(),
            "sourceConfidence": confidence,
            "sourceWords": source_words,
            "scriptFlags": [str(flag)[:80] for flag in (item.get("flags") or [])[:20]],
            "scriptCueId": str(item.get("id") or f"cue-{index + 1:05d}"),
        })
    return cues


def cue_identity(cue):
    source_start = float(cue.get("sourceStart", cue["start"]))
    source_end = float(cue.get("sourceEnd", cue["end"]))
    raw = f"{source_start:.3f}|{source_end:.3f}|{cue['text']}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def clip_cues(cues, start_seconds, duration):
    range_end = start_seconds + duration
    clipped = []
    for cue in cues:
        source_start = float(cue.get("sourceStart", cue["start"]))
        source_end = float(cue.get("sourceEnd", cue["end"]))
        if source_start >= start_seconds and source_end <= range_end:
            clipped.append({
                **cue,
                "start": source_start - start_seconds,
                "end": source_end - start_seconds,
                "sourceStart": source_start,
                "sourceEnd": source_end,
            })
    if not clipped:
        raise ValueError("La plage choisie ne contient aucun sous-titre exploitable.")
    return clipped


def media_duration(path):
    value = run(
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", path, capture=True,
    )
    duration = float(value)
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError("Durée audio invalide.")
    return duration


def extract_source_audio(source, destination, duration, start_seconds=0.0):
    run(
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-ss", f"{start_seconds:.3f}", "-i", source,
        "-t", f"{duration:.3f}", "-vn", "-ac", "2",
        "-ar", "48000", "-c:a", "pcm_f32le", destination,
    )


def trim_audio(source, destination, start_seconds, duration):
    run(
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-ss", f"{start_seconds:.3f}", "-i", source,
        "-t", f"{duration:.3f}", "-ac", "2", "-ar", "48000",
        "-c:a", "pcm_f32le", destination,
    )


def atempo_chain(factor):
    factors = []
    while factor > 2.0:
        factors.append(2.0)
        factor /= 2.0
    while factor < 0.5:
        factors.append(0.5)
        factor /= 0.5
    factors.append(factor)
    return ",".join(f"atempo={item:.8f}" for item in factors)


def synthesis_fit_filter(factor, generated_duration, fitted_duration):
    """Ajuste la durée sans laisser de bord vocal brutal dans les stems."""
    spoken_duration = min(
        float(fitted_duration),
        float(generated_duration) / max(float(factor), 1e-6),
    )
    fade_in = min(0.008, spoken_duration / 4.0)
    fade_out = min(0.035, max(0.008, spoken_duration * 0.15))
    fade_out = min(fade_out, spoken_duration)
    fade_out_start = max(0.0, spoken_duration - fade_out)
    return (
        f"{atempo_chain(factor)},"
        f"afade=t=in:st=0:d={fade_in:.4f},"
        f"afade=t=out:st={fade_out_start:.4f}:d={fade_out:.4f},"
        f"apad=pad_dur={float(fitted_duration):.3f},"
        f"atrim=0:{float(fitted_duration):.3f},aresample=48000"
    )


def select_continuous_reference(turns, max_seconds=12.0, boundary_trim=0.25, min_seconds=0.8):
    for turn in sorted(turns, key=lambda item: item["end"] - item["start"], reverse=True):
        raw_start = max(0.0, float(turn["start"]))
        raw_end = max(raw_start, float(turn["end"]))
        raw_duration = raw_end - raw_start
        available_trim = max(0.0, (raw_duration - min_seconds) / 2.0)
        trim = min(boundary_trim, available_trim)
        start = raw_start + trim
        end = raw_end - trim
        duration = end - start
        if duration < min_seconds:
            continue
        if duration > max_seconds:
            midpoint = (start + end) / 2.0
            start = midpoint - (max_seconds / 2.0)
            end = midpoint + (max_seconds / 2.0)
        return {"start": start, "end": end, "duration": end - start}
    raise RuntimeError(
        "Aucune prise vocale continue assez longue n'a été trouvée pour cet intervenant."
    )


def make_reference(source, turns, destination, max_seconds=12.0):
    selected = select_continuous_reference(turns, max_seconds=max_seconds)
    run(
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", source,
        "-af", (
            f"atrim=start={selected['start']:.3f}:end={selected['end']:.3f},"
            "asetpts=PTS-STARTPTS"
        ), "-ac", "1",
        "-ar", "24000", "-c:a", "pcm_s16le", destination,
    )
    return selected


def wsl_path(path):
    return run("wsl.exe", "wslpath", "-a", "-u", Path(path).resolve(), capture=True)


def sortformer_command(install, arguments):
    runtime = str(install.get("sortformerRuntime") or "native").lower()
    python_path = str(install.get("sortformerPythonPath") or "")
    script_path = str(install.get("sortformerScript") or "")
    if runtime == "wsl":
        converted = []
        path_options = {"--model", "--windows-json", "--output"}
        convert_next = False
        for argument in arguments:
            value = str(argument)
            if convert_next:
                converted.append(wsl_path(value))
                convert_next = False
            else:
                converted.append(value)
                convert_next = value in path_options
        return ["wsl.exe", "--exec", python_path, script_path, *converted]
    return [Path(python_path), Path(script_path), *arguments]


def build_sortformer_windows(source, workspace, duration):
    windows_root = workspace / "sortformer-windows"
    windows_root.mkdir(parents=True, exist_ok=True)
    windows = []
    core_start = 0.0
    index = 0
    while core_start < duration:
        core_end = min(duration, core_start + SORTFORMER_CORE_SECONDS)
        audio_start = max(0.0, core_start - SORTFORMER_CONTEXT_SECONDS)
        audio_end = min(duration, core_end + SORTFORMER_CONTEXT_SECONDS)
        audio_path = windows_root / f"window-{index:04d}.wav"
        run(
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-ss", f"{audio_start:.3f}", "-i", source,
            "-t", f"{audio_end - audio_start:.3f}",
            "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", audio_path,
        )
        windows.append({
            "index": index,
            "audioPath": str(audio_path),
            "audioStart": round(audio_start, 3),
            "coreStart": round(core_start, 3),
            "coreEnd": round(core_end, 3),
        })
        core_start = core_end
        index += 1
    return windows


def serialize_sortformer_windows(windows, install, path_converter=None):
    if str(install.get("sortformerRuntime") or "native").lower() != "wsl":
        return [dict(window) for window in windows]
    convert = path_converter or wsl_path
    return [
        {**window, "audioPath": convert(window["audioPath"])}
        for window in windows
    ]


def run_sortformer(source, install, workspace, duration):
    model = install.get("models", {}).get("sortformer") or {}
    model_path = Path(str(model.get("hostPath") or model.get("path") or ""))
    if not model_path.is_file():
        raise RuntimeError("Le checkpoint NVIDIA Sortformer local est absent.")
    windows = build_sortformer_windows(source, workspace, duration)
    windows_path = workspace / "sortformer-windows.json"
    output_path = workspace / "sortformer.json"
    write_json(windows_path, serialize_sortformer_windows(windows, install))
    command = sortformer_command(install, [
        "--model", model_path,
        "--sha256", str(model.get("sha256") or ""),
        "--windows-json", windows_path,
        "--output", output_path,
    ])
    run(*command)
    payload = load_json(output_path)
    if not payload.get("turns"):
        raise RuntimeError("NVIDIA Sortformer n'a détecté aucune voix exploitable.")
    return output_path, payload


def run_diarization(
    source,
    install,
    workspace,
    expected_speaker_count=None,
    refinement_path=None,
):
    diarization = install.get("models", {}).get("diarization") or {}
    python_path = Path(str(install.get("diarizationPythonPath") or ""))
    script_path = Path(str(install.get("diarizationScript") or ""))
    model_path = Path(str(diarization.get("path") or ""))
    if not python_path.is_file() or not script_path.is_file() or not model_path.is_dir():
        raise RuntimeError("Le runtime Pyannote Community-1 local est incomplet.")
    output_path = workspace / "diarization.json"
    command = [
        python_path, script_path,
        "--model", model_path,
        "--integrity-json", json.dumps(diarization.get("files") or {}),
        "--audio", source,
        "--output", output_path,
    ]
    if expected_speaker_count is not None:
        command.extend(["--num-speakers", str(expected_speaker_count)])
    if refinement_path is not None:
        command.extend(["--refinement-json", refinement_path])
    run(*command)
    payload = load_json(output_path)
    turns = parse_diarization_turns(payload.get("turns"))
    if not turns:
        raise RuntimeError("Pyannote n'a détecté aucun locuteur exploitable.")
    return turns, payload


def parse_diarization_turns(items):
    turns = []
    for item in items or []:
        start = float(item.get("start", 0.0))
        end = float(item.get("end", 0.0))
        speaker = str(item.get("speaker") or "").strip()
        if speaker and end > start:
            turns.append({"start": start, "end": end, "speaker": speaker})
    return turns


def cue_speaker_evidence(cue, turns):
    duration = max(1e-6, float(cue["end"]) - float(cue["start"]))
    overlaps = {}
    for turn in turns:
        overlap = max(0.0, min(cue["end"], turn["end"]) - max(cue["start"], turn["start"]))
        if overlap > 0:
            overlaps[turn["speaker"]] = overlaps.get(turn["speaker"], 0.0) + overlap
    if overlaps:
        ranked = sorted(overlaps.items(), key=lambda item: item[1], reverse=True)
        winner, winner_overlap = ranked[0]
        runner_up_overlap = ranked[1][1] if len(ranked) > 1 else 0.0
        return {
            "speaker": winner,
            "coverage": min(1.0, winner_overlap / duration),
            "margin": min(1.0, (winner_overlap - runner_up_overlap) / duration),
        }
    midpoint = (cue["start"] + cue["end"]) / 2.0
    nearest = min(
        turns,
        key=lambda turn: abs(midpoint - ((turn["start"] + turn["end"]) / 2.0)),
    )
    return {"speaker": nearest["speaker"], "coverage": 0.0, "margin": 0.0}


def assign_cue_speakers(cues, turns):
    assigned = []
    for cue in cues:
        evidence = cue_speaker_evidence(cue, turns)
        assigned.append({**cue, "speaker": evidence["speaker"]})
    return assigned


def assign_cue_speakers_hybrid(
    cues,
    base_turns,
    refined_turns,
    base_uncertain_coverage=0.55,
    base_uncertain_margin=0.20,
    refined_min_coverage=0.55,
    refined_min_margin=0.25,
    refined_override_coverage=0.75,
    refined_override_margin=0.50,
):
    assigned = []
    for cue in cues:
        selected, assignment = select_hybrid_speaker(
            cue,
            base_turns,
            refined_turns,
            base_uncertain_coverage=base_uncertain_coverage,
            base_uncertain_margin=base_uncertain_margin,
            refined_min_coverage=refined_min_coverage,
            refined_min_margin=refined_min_margin,
            refined_override_coverage=refined_override_coverage,
            refined_override_margin=refined_override_margin,
        )
        assigned.append({
            **cue,
            "speaker": selected["speaker"],
            "speakerAssignment": assignment,
        })
    return assigned


def select_hybrid_speaker(
    interval,
    base_turns,
    refined_turns,
    base_uncertain_coverage=0.55,
    base_uncertain_margin=0.20,
    refined_min_coverage=0.55,
    refined_min_margin=0.25,
    refined_override_coverage=0.75,
    refined_override_margin=0.50,
):
    base = cue_speaker_evidence(interval, base_turns)
    refined = cue_speaker_evidence(interval, refined_turns)
    base_uncertain = (
        base["coverage"] < base_uncertain_coverage
        or base["margin"] < base_uncertain_margin
    )
    refined_strong = (
        refined["coverage"] >= refined_min_coverage
        and refined["margin"] >= refined_min_margin
    )
    refined_decisive = (
        refined["coverage"] >= refined_override_coverage
        and refined["margin"] >= refined_override_margin
    )
    use_refined = (
        refined["speaker"] != base["speaker"]
        and refined_strong
        and (base_uncertain or refined_decisive)
    )
    selected = refined if use_refined else base
    return selected, {
        "source": "sortformer" if use_refined else "community-1",
        "base": base,
        "refined": refined,
        "baseUncertain": base_uncertain,
        "refinedDecisive": refined_decisive,
    }


def eligible_speaker_turns(turns, minimum_seconds=2.0):
    totals = {}
    for turn in turns:
        totals[turn["speaker"]] = totals.get(turn["speaker"], 0.0) + (
            turn["end"] - turn["start"]
        )
    eligible = {speaker for speaker, total in totals.items() if total >= minimum_seconds}
    if not eligible:
        eligible = {max(totals, key=totals.get)}
    return [turn for turn in turns if turn["speaker"] in eligible]


def transcript_segments(source_transcript):
    if not isinstance(source_transcript, dict):
        return []
    parsed = []
    for segment in source_transcript.get("segments") or []:
        try:
            start = float(segment.get("start", segment.get("Start", 0.0)))
            end = float(segment.get("end", segment.get("End", start)))
        except (TypeError, ValueError):
            continue
        text = re.sub(
            r"\s+", " ", str(segment.get("text", segment.get("Text", ""))).strip()
        )
        if text and end > start:
            parsed.append({"start": start, "end": end, "text": text})
    return sorted(parsed, key=lambda item: (item["start"], item["end"]))


def transcript_words(source_transcript):
    if not isinstance(source_transcript, dict):
        return []
    parsed = []
    seen = set()
    for segment in source_transcript.get("segments") or []:
        for word in segment.get("words") or []:
            try:
                start = float(word.get("start"))
                end = float(word.get("end"))
            except (AttributeError, TypeError, ValueError):
                continue
            text = re.sub(r"\s+", " ", str(word.get("text") or "")).strip()
            identity = (round(start, 3), round(end, 3), text)
            if text and end > start and identity not in seen:
                seen.add(identity)
                parsed.append({"start": start, "end": end, "text": text})
    return sorted(parsed, key=lambda item: (item["start"], item["end"]))


def is_lexical_token(value):
    return any(character.isalnum() for character in str(value or ""))


def attach_timing_punctuation(words):
    """Rattache la ponctuation au mot voisin sans lui attribuer une voix."""
    lexical = []
    prefix = []
    for raw_word in sorted(words, key=lambda item: (item["start"], item["end"])):
        word = dict(raw_word)
        text = re.sub(r"\s+", " ", str(word.get("text") or "")).strip()
        if not text:
            continue
        if is_lexical_token(text):
            if prefix:
                word["text"] = f"{' '.join(prefix)} {text}".strip()
                prefix = []
            else:
                word["text"] = text
            lexical.append(word)
        elif lexical:
            lexical[-1]["text"] = f"{lexical[-1]['text']}{text}"
            lexical[-1]["end"] = max(
                float(lexical[-1]["end"]), float(word.get("end", lexical[-1]["end"]))
            )
        else:
            prefix.append(text)
    return lexical


def ends_sentence(value):
    return bool(re.search(r"[.!?…][\"'»”’)]*$", str(value or "").strip()))


def ranges_overlap(start, end, rejected_ranges, tolerance=0.05):
    return any(
        min(end, float(item.get("sourceEnd", 0.0)))
        - max(start, float(item.get("sourceStart", 0.0))) > tolerance
        for item in rejected_ranges or []
        if isinstance(item, dict)
    )


def select_aligned_reference(
    speaker_turns,
    source_transcript,
    consensus_turns=None,
    rejected_ranges=None,
    max_seconds=6.0,
    min_seconds=2.0,
):
    segments = transcript_segments(source_transcript)
    words = attach_timing_punctuation(transcript_words(source_transcript))
    candidates = []
    tolerance = 0.04
    speaker = str(speaker_turns[0]["speaker"]) if speaker_turns else ""
    rejected_counts = {
        "duration": 0,
        "range": 0,
        "consensus": 0,
    }
    sentence_punctuation_available = any(ends_sentence(word["text"]) for word in words)
    for turn in speaker_turns:
        contained = (
            [
                word for word in words
                if turn["start"] - tolerance
                <= (word["start"] + word["end"]) / 2.0
                <= turn["end"] + tolerance
            ]
            if words else [
                segment for segment in segments
                if segment["start"] >= turn["start"] - tolerance
                and segment["end"] <= turn["end"] + tolerance
            ]
        )
        for start_index in range(len(contained)):
            if (
                words
                and sentence_punctuation_available
                and start_index > 0
                and not ends_sentence(contained[start_index - 1]["text"])
            ):
                continue
            selected = []
            for segment in contained[start_index:]:
                if selected and segment["start"] - selected[-1]["end"] > 0.75:
                    break
                proposed_start = selected[0]["start"] if selected else segment["start"]
                if segment["end"] - proposed_start > max_seconds:
                    break
                selected.append(segment)
                duration = selected[-1]["end"] - selected[0]["start"]
                sentence_complete = ends_sentence(selected[-1]["text"])
                can_use = (
                    duration >= min_seconds
                    and (not words or not sentence_punctuation_available or sentence_complete)
                )
                if can_use:
                    start = selected[0]["start"]
                    end = selected[-1]["end"]
                    if ranges_overlap(start, end, rejected_ranges):
                        rejected_counts["range"] += 1
                        continue
                    consensus = (
                        cue_speaker_evidence({"start": start, "end": end}, consensus_turns)
                        if consensus_turns else {"speaker": speaker, "coverage": 1.0, "margin": 1.0}
                    )
                    if (
                        consensus["speaker"] != speaker
                        or consensus["coverage"] < 0.8
                        or consensus["margin"] < 0.65
                    ):
                        rejected_counts["consensus"] += 1
                        continue
                    candidates.append({
                        "start": start,
                        "end": end,
                        "duration": duration,
                        "text": " ".join(item["text"] for item in selected),
                        "sentenceComplete": sentence_complete,
                        "consensusCoverage": consensus["coverage"],
                        "consensusMargin": consensus["margin"],
                    })
                elif duration < min_seconds:
                    rejected_counts["duration"] += 1
                if words and sentence_punctuation_available and sentence_complete:
                    break
    if not candidates:
        raise RuntimeError(
            "Aucune référence voix/texte strictement alignée n'a été trouvée pour "
            f"{speaker or 'cet intervenant'} "
            f"(mots horodatés: {len(words)}, tours: {len(speaker_turns)}, "
            f"rejets durée: {rejected_counts['duration']}, "
            f"plage: {rejected_counts['range']}, consensus: {rejected_counts['consensus']})."
        )
    return max(candidates, key=lambda item: (
        item.get("sentenceComplete", False),
        item["consensusCoverage"] + item["consensusMargin"],
        -abs(item["duration"] - 4.0),
        len(item["text"]),
    ))


def select_aligned_reference_v5(
    speaker_turns,
    source_transcript,
    max_seconds=12.0,
    min_seconds=2.0,
):
    """Sélection historique figée du profil sami-dubbing-v5-aligned-quality."""
    segments = transcript_segments(source_transcript)
    candidates = []
    tolerance = 0.04
    for turn in speaker_turns:
        contained = [
            segment for segment in segments
            if segment["start"] >= turn["start"] - tolerance
            and segment["end"] <= turn["end"] + tolerance
        ]
        for start_index in range(len(contained)):
            selected = []
            for segment in contained[start_index:]:
                if selected and segment["start"] - selected[-1]["end"] > 0.75:
                    break
                proposed_start = selected[0]["start"] if selected else segment["start"]
                if segment["end"] - proposed_start > max_seconds:
                    break
                selected.append(segment)
                duration = selected[-1]["end"] - selected[0]["start"]
                if duration >= min_seconds:
                    candidates.append({
                        "start": selected[0]["start"],
                        "end": selected[-1]["end"],
                        "duration": duration,
                        "text": " ".join(item["text"] for item in selected),
                    })
    if not candidates:
        raise RuntimeError(
            "Aucune référence voix/texte strictement alignée n'a été trouvée "
            "pour cet intervenant."
        )
    return max(candidates, key=lambda item: (item["duration"], len(item["text"])))


def validate_manual_references(value, expected_count, duration):
    if value is None:
        return None
    if not isinstance(value, list) or len(value) != expected_count:
        raise DubbingInputQualityError("Une sélection vocale est requise par intervenant.")
    intervals = []
    for index, entry in enumerate(value):
        if not isinstance(entry, dict) or entry.get("speaker") != f"SPEAKER_{index:02d}":
            raise DubbingInputQualityError("Identité de référence guidée invalide.")
        ranges = entry.get("ranges")
        if not isinstance(ranges, list) or not 1 <= len(ranges) <= 5:
            raise DubbingInputQualityError("Un à cinq passages sont requis par voix.")
        for interval in ranges:
            try:
                start, end = float(interval["start"]), float(interval["end"])
            except (KeyError, TypeError, ValueError) as error:
                raise DubbingInputQualityError("Bornes vocales guidées invalides.") from error
            if not math.isfinite(start + end) or start < 0 or end > duration or not 2 <= end - start <= 12:
                raise DubbingInputQualityError("Un passage guidé doit durer 2 à 12 secondes et rester dans la vidéo.")
            intervals.append((start, end))
    intervals.sort()
    if any(current[0] < previous[1] for previous, current in zip(intervals, intervals[1:])):
        raise DubbingInputQualityError("Les références guidées ne peuvent pas se chevaucher.")
    return value


def map_manual_speakers(turns, manual_references):
    mapping = {}
    for entry in manual_references:
        detected = None
        for interval in entry["ranges"]:
            scores = {}
            total = interval["end"] - interval["start"]
            for turn in turns:
                overlap = max(0.0, min(turn["end"], interval["end"]) - max(turn["start"], interval["start"]))
                scores[turn["speaker"]] = scores.get(turn["speaker"], 0.0) + overlap / total
            ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)
            if not ranked or ranked[0][1] < 0.55 or ranked[0][1] - (ranked[1][1] if len(ranked) > 1 else 0) < 0.15:
                raise DubbingInputQualityError(f"Le passage {interval['start']:.2f}s–{interval['end']:.2f}s de {entry['speaker']} ne permet pas d'identifier une voix unique. Choisissez un passage plus isolé.")
            if detected is not None and detected != ranked[0][0]:
                raise DubbingInputQualityError(f"Les alternatives de {entry['speaker']} ne correspondent pas à la même voix détectée. Vérifiez les passages ; aucun profil ne sera fusionné.")
            detected = ranked[0][0]
        if detected in mapping:
            raise DubbingInputQualityError("Deux sélections guidées correspondent à la même voix détectée. Les profils ne seront pas fusionnés ; vérifiez les passages choisis.")
        mapping[detected] = entry["speaker"]
    if set(mapping) != {turn["speaker"] for turn in turns}:
        raise DubbingInputQualityError("Le nombre de voix détectées ne correspond pas aux références guidées.")
    return mapping


def select_manual_reference(entry, source_transcript, rejected_ranges):
    candidates = []
    words = transcript_words(source_transcript)
    for interval in entry["ranges"]:
        contained = [w for w in words if w["start"] >= interval["start"] and w["end"] <= interval["end"]]
        if not contained:
            continue
        start, end = contained[0]["start"], contained[-1]["end"]
        if end - start < 2 or any(b["start"] - a["end"] > 0.75 for a, b in zip(contained, contained[1:])):
            continue
        # Les limites sont ajustées vers l'intérieur, jamais en dehors du choix admin.
        if any(max(start, float(r["sourceStart"])) < min(end, float(r["sourceEnd"])) for r in rejected_ranges or []):
            continue
        candidates.append({"start": start, "end": end, "duration": end - start,
                           "text": " ".join(w["text"] for w in contained), "selectedRange": interval})
    if not candidates:
        raise DubbingInputQualityError(f"Aucun passage choisi encore disponible pour {entry['speaker']} ne contient deux secondes de mots alignés. Ajoutez un autre passage ou élargissez la sélection.")
    return max(candidates, key=lambda item: (item["duration"], -item["start"]))


def make_speaker_references(
    source,
    turns,
    destination_root,
    source_transcript,
    consensus_turns=None,
    rejected_ranges=None,
    profile=V6_CLEAN_PHRASES_R9_R1_PROFILE,
    manual_references=None,
):
    grouped = {}
    for turn in turns:
        grouped.setdefault(turn["speaker"], []).append(turn)
    references = {}
    selections = {}
    references_root = destination_root / "references"
    references_root.mkdir(parents=True, exist_ok=True)
    for speaker, speaker_turns in grouped.items():
        safe_speaker = re.sub(r"[^A-Za-z0-9_-]+", "_", speaker).strip("_") or "speaker"
        reference = references_root / f"{safe_speaker}.wav"
        if manual_references:
            entry = next((item for item in manual_references if item["speaker"] == speaker), None)
            if entry is None:
                raise DubbingInputQualityError(f"Sélection guidée absente pour {speaker}.")
            selected = select_manual_reference(entry, source_transcript, rejected_ranges)
        elif is_v5_profile(profile):
            selected = select_aligned_reference_v5(
                speaker_turns,
                source_transcript,
            )
        else:
            selected = select_aligned_reference(
                speaker_turns,
                source_transcript,
                consensus_turns=consensus_turns,
                rejected_ranges=rejected_ranges,
            )
        run(
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", source,
            "-af", (
                f"atrim=start={selected['start']:.3f}:end={selected['end']:.3f},"
                "asetpts=PTS-STARTPTS"
            ), "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", reference,
        )
        references[speaker] = reference
        selections[speaker] = selected
        log(
            f"Référence vocale continue {speaker}: "
            f"{selected['start']:.2f}s–{selected['end']:.2f}s."
        )
    return references, selections


def split_text_proportionally(text, durations):
    if len(durations) == 1:
        return [text]
    japanese = not bool(re.search(r"\s", text)) and bool(re.search(r"[\u3040-\u30ff\u3400-\u9fff]", text))
    raw_tokens = list(text) if japanese else text.split()
    tokens = []
    leading_punctuation = ""
    for token in raw_tokens:
        if any(character.isalnum() for character in token):
            tokens.append(f"{leading_punctuation}{token}")
            leading_punctuation = ""
        elif tokens:
            separator = "" if japanese else " "
            tokens[-1] = f"{tokens[-1]}{separator}{token}"
        else:
            separator = "" if japanese or not leading_punctuation else " "
            leading_punctuation = f"{leading_punctuation}{separator}{token}"
    if leading_punctuation:
        if tokens:
            separator = "" if japanese else " "
            tokens[-1] = f"{tokens[-1]}{separator}{leading_punctuation}"
        else:
            tokens = [leading_punctuation]
    if len(tokens) < len(durations):
        longest = max(range(len(durations)), key=lambda index: durations[index])
        return [text if index == longest else "" for index in range(len(durations))]
    total = sum(durations)
    preferred_boundaries = {
        index + 1
        for index, token in enumerate(tokens[:-1])
        if re.search(r"[,;:!?….][\"'»”’)]*$", token.strip())
    }
    boundaries = [0]
    elapsed = 0.0
    for piece_index, duration in enumerate(durations[:-1]):
        elapsed += duration
        ideal = round((elapsed / total) * len(tokens))
        minimum = boundaries[-1] + 1
        maximum = len(tokens) - (len(durations) - piece_index - 1)
        candidates = [
            boundary for boundary in preferred_boundaries
            if minimum <= boundary <= maximum
        ]
        boundary = min(candidates, key=lambda value: abs(value - ideal)) if candidates else ideal
        boundaries.append(max(minimum, min(maximum, boundary)))
    boundaries.append(len(tokens))
    parts = []
    for index in range(len(durations)):
        values = tokens[boundaries[index]:boundaries[index + 1]]
        parts.append("".join(values) if japanese else " ".join(values))
    return parts


def split_text_proportionally_v5(text, durations):
    if len(durations) == 1:
        return [text]
    japanese = not bool(re.search(r"\s", text)) and bool(
        re.search(r"[\u3040-\u30ff\u3400-\u9fff]", text)
    )
    tokens = list(text) if japanese else text.split()
    if len(tokens) < len(durations):
        return [text] + ["" for _ in durations[1:]]
    total = sum(durations)
    boundaries = [0]
    elapsed = 0.0
    for duration in durations[:-1]:
        elapsed += duration
        boundary = round((elapsed / total) * len(tokens))
        boundaries.append(max(boundaries[-1] + 1, min(len(tokens) - 1, boundary)))
    boundaries.append(len(tokens))
    parts = []
    for index in range(len(durations)):
        values = tokens[boundaries[index]:boundaries[index + 1]]
        parts.append("".join(values) if japanese else " ".join(values))
    return parts


def smooth_short_speaker_turns(
    turns,
    max_seconds=SHORT_SPEAKER_ISLAND_SECONDS,
    max_neighbor_gap=SHORT_SPEAKER_NEIGHBOR_GAP_SECONDS,
):
    ordered = [dict(turn) for turn in sorted(turns, key=lambda item: (item["start"], item["end"]))]
    if len(ordered) < 3:
        return ordered
    original = [dict(turn) for turn in ordered]
    for index in range(1, len(original) - 1):
        previous = original[index - 1]
        current = original[index]
        following = original[index + 1]
        duration = current["end"] - current["start"]
        previous_gap = max(0.0, current["start"] - previous["end"])
        following_gap = max(0.0, following["start"] - current["end"])
        if (
            duration < max_seconds
            and previous["speaker"] == following["speaker"]
            and current["speaker"] != previous["speaker"]
            and previous_gap <= max_neighbor_gap
            and following_gap <= max_neighbor_gap
        ):
            ordered[index]["speaker"] = previous["speaker"]
    return ordered


def _merge_piece_into_neighbor(pieces, index):
    current = pieces[index]
    if index == 0:
        pieces[1]["start"] = current["start"]
        pieces.pop(0)
        return
    if index == len(pieces) - 1:
        pieces[-2]["end"] = current["end"]
        pieces.pop()
        return
    previous = pieces[index - 1]
    following = pieces[index + 1]
    previous_duration = previous["end"] - previous["start"]
    following_duration = following["end"] - following["start"]
    if previous["speaker"] == following["speaker"] or previous_duration >= following_duration:
        previous["end"] = current["end"]
        pieces.pop(index)
    else:
        following["start"] = current["start"]
        pieces.pop(index)


def stabilize_speaker_pieces(pieces, text, min_seconds=MIN_DIALOGUE_UNIT_SECONDS):
    stable = [dict(piece) for piece in pieces]
    while len(stable) > 1:
        short_indexes = [
            index for index, piece in enumerate(stable)
            if piece["end"] - piece["start"] < min_seconds
        ]
        if not short_indexes:
            break
        shortest = min(
            short_indexes,
            key=lambda index: stable[index]["end"] - stable[index]["start"],
        )
        _merge_piece_into_neighbor(stable, shortest)

    japanese = not bool(re.search(r"\s", text)) and bool(re.search(r"[\u3040-\u30ff\u3400-\u9fff]", text))
    raw_tokens = list(text) if japanese else text.split()
    spoken_token_count = sum(
        1 for token in raw_tokens if any(character.isalnum() for character in token)
    )
    while len(stable) > max(1, spoken_token_count):
        shortest = min(
            range(len(stable)),
            key=lambda index: stable[index]["end"] - stable[index]["start"],
        )
        _merge_piece_into_neighbor(stable, shortest)
    return stable


def split_cues_at_speaker_boundaries(cues, turns):
    units = []
    for cue in cues:
        boundaries = {float(cue["start"]), float(cue["end"])}
        for turn in turns:
            if cue["start"] < turn["start"] < cue["end"]:
                boundaries.add(float(turn["start"]))
            if cue["start"] < turn["end"] < cue["end"]:
                boundaries.add(float(turn["end"]))
        ordered = sorted(boundaries)
        pieces = []
        for start, end in zip(ordered, ordered[1:]):
            midpoint = (start + end) / 2.0
            matching = [turn for turn in turns if turn["start"] <= midpoint <= turn["end"]]
            if matching:
                speaker = max(matching, key=lambda item: item["end"] - item["start"])["speaker"]
            else:
                speaker = min(
                    turns,
                    key=lambda item: abs(midpoint - ((item["start"] + item["end"]) / 2.0)),
                )["speaker"]
            if pieces and pieces[-1]["speaker"] == speaker:
                pieces[-1]["end"] = end
            else:
                pieces.append({"start": start, "end": end, "speaker": speaker})
        pieces = stabilize_speaker_pieces(pieces, cue["text"])
        texts = split_text_proportionally(
            cue["text"], [piece["end"] - piece["start"] for piece in pieces]
        )
        for piece, text in zip(pieces, texts):
            if text:
                units.append({
                    **cue,
                    **piece,
                    "sourceStart": piece["start"],
                    "sourceEnd": piece["end"],
                    "text": text,
                })
    return units


def repair_v5_sentence_onset(cue, units, source_words):
    """Réparation conservatrice et auditée, sans remplacer une frontière par du texte seul."""
    if len(units) != 2 or units[0]["speaker"] == units[1]["speaker"]:
        return units
    first, following = units
    boundary = first["end"]
    text = cue["text"].strip()
    # Pas d'assemblage à travers plusieurs phrases ou de transcription traduite.
    sentences = [part.strip() for part in re.split(r"(?<=[.!?。！？])\s*", text) if part.strip()]
    if len(sentences) != 1 or not re.search(r"[.!?。！？][\"»”)]*$", text):
        return units
    if not (0 < boundary - cue["start"] <= 0.5 and cue["end"] - cue["start"] <= 4
            and 0 < cue["end"] - boundary <= 3):
        return units
    words = [word for word in source_words
             if word["start"] >= cue["start"] - 0.01 and word["end"] <= cue["end"] + 0.01]
    if not words or normalized_speech_text("".join(w["text"] for w in words)) != normalized_speech_text(text):
        return units
    lexical = [word for word in words if is_lexical_token(word["text"])]
    if not lexical:
        return units
    onset = lexical[0]
    if abs(onset["start"] - cue["start"]) > 0.01 or abs(words[-1]["end"] - cue["end"]) > 0.01:
        return units
    if not onset["start"] < boundary < onset["end"]:
        return units
    if (boundary - onset["start"]) / (onset["end"] - onset["start"]) < 0.5:
        return units
    return [{
        **cue, "speaker": first["speaker"],
        "sourceStart": cue["start"], "sourceEnd": cue["end"],
        "speakerBoundaryRepair": {
            "strategy": "source-aligned-sentence-onset-repair-v2",
            "reviewRequired": True,
            "originalBoundary": boundary,
            "sentenceEnd": cue["end"],
            "firstWord": onset,
            "originalUnits": units,
        },
    }]


def split_translation_at_clause_boundaries(text, durations):
    """Only punctuation can delimit translated clauses; never slice words/kana."""
    if len(durations) <= 1:
        return [text]
    cuts = [match.end() for match in re.finditer(
        r'(?:[!?。！？,，、;；:：…]+|(?<!\d)\.+(?!\d))[\s”"」』）)]*', text
    ) if any(char.isalnum() for char in text[:match.start()])
        and any(char.isalnum() for char in text[match.end():])]
    # Reject adjacent punctuation-only "clauses".
    available = []
    last = 0
    for cut in cuts:
        if any(char.isalnum() for char in text[last:cut]):
            available.append(cut)
            last = cut
    needed = len(durations) - 1
    if len(available) < needed:
        return None
    selected = [0]
    elapsed = 0.0
    for index, duration in enumerate(durations[:-1]):
        elapsed += duration
        candidates = [cut for cut in available if cut > selected[-1]]
        candidates = candidates[:len(candidates) - (needed - index - 1)]
        target = len(text) * elapsed / sum(durations)
        selected.append(min(candidates, key=lambda cut: (abs(cut - target), cut)))
    selected.append(len(text))
    return [text[a:b] for a, b in zip(selected, selected[1:])]


def split_cues_at_speaker_boundaries_v5(cues, turns, stable_boundaries=False, source_words=None, protect_translation=False):
    """V5 historique par défaut ; R1 stabilise seulement les coupures internes."""
    units = []
    for cue in cues:
        boundaries = {float(cue["start"]), float(cue["end"])}
        for turn in turns:
            if cue["start"] < turn["start"] < cue["end"]:
                boundaries.add(float(turn["start"]))
            if cue["start"] < turn["end"] < cue["end"]:
                boundaries.add(float(turn["end"]))
        ordered = sorted(boundaries)
        pieces = []
        for start, end in zip(ordered, ordered[1:]):
            midpoint = (start + end) / 2.0
            matching = [
                turn for turn in turns
                if turn["start"] <= midpoint <= turn["end"]
            ]
            if matching:
                speaker = max(
                    matching, key=lambda item: item["end"] - item["start"]
                )["speaker"]
            else:
                speaker = min(
                    turns,
                    key=lambda item: abs(
                        midpoint - ((item["start"] + item["end"]) / 2.0)
                    ),
                )["speaker"]
            if pieces and pieces[-1]["speaker"] == speaker:
                pieces[-1]["end"] = end
            else:
                pieces.append({"start": start, "end": end, "speaker": speaker})
        if stable_boundaries:
            # Une frontière de diarisation ne doit pas isoler artificiellement
            # un mot dans quelques millisecondes. Aucun minimum n'est imposé
            # au sous-titre lui-même : une vraie interjection courte est gardée.
            pieces = stabilize_speaker_pieces(pieces, cue["text"], min_seconds=0.12)
            consolidated = []
            for piece in pieces:
                if consolidated and consolidated[-1]["speaker"] == piece["speaker"]:
                    consolidated[-1]["end"] = piece["end"]
                else:
                    consolidated.append(dict(piece))
            pieces = consolidated
        split_text = split_text_proportionally if stable_boundaries else split_text_proportionally_v5
        texts = (split_translation_at_clause_boundaries if protect_translation else split_text)(
            cue["text"], [piece["end"] - piece["start"] for piece in pieces]
        )
        review = None
        if protect_translation and len(pieces) > 1:
            review = "clause_assignment_heuristic"
            if texts is None:
                coverage = {}
                for piece in pieces:
                    coverage[piece["speaker"]] = coverage.get(piece["speaker"], 0) + piece["end"] - piece["start"]
                speaker = max(coverage, key=coverage.get)
                pieces = [{"start": cue["start"], "end": cue["end"], "speaker": speaker}]
                texts = [cue["text"]]
                review = "unsplit_translation_dominant_speaker"
            log(f"Répartition traduite à vérifier à {cue['start']:.3f}s : {review}.")
        cue_units = []
        for piece, text in zip(pieces, texts):
            if text:
                cue_units.append({
                    **cue,
                    **piece,
                    "sourceStart": piece["start"],
                    "sourceEnd": piece["end"],
                    "text": text,
                    **({"translationBoundaryReview": review} if review else {}),
                })
        if source_words is not None and not protect_translation:
            cue_units = repair_v5_sentence_onset(cue, cue_units, source_words)
        units.extend(cue_units)
    return units


def _word_group_lexical_count(group):
    return sum(
        max(1, len(speech_lexical_units(word.get("text"))))
        for word in group.get("words") or []
    )


def _merge_word_speaker_groups(left, right, speaker=None):
    return {
        "start": min(float(left["start"]), float(right["start"])),
        "end": max(float(left["end"]), float(right["end"])),
        "speaker": speaker or left["speaker"],
        "words": [*(left.get("words") or []), *(right.get("words") or [])],
        "assignments": [
            *(left.get("assignments") or []), *(right.get("assignments") or [])
        ],
    }


def stabilize_short_word_speaker_groups(groups, cue, base_turns, refined_turns):
    """Évite qu'un mot de continuation devienne une réplique/voix isolée."""
    stable = [dict(group) for group in groups]
    if len(stable) < 2:
        return stable
    cue_interval = {
        "start": float(cue.get("sourceStart", cue["start"])),
        "end": float(cue.get("sourceEnd", cue["end"])),
    }
    cue_speaker, _ = select_hybrid_speaker(
        cue_interval, base_turns, refined_turns
    )
    index = 0
    while index < len(stable):
        current = stable[index]
        duration = float(current["end"]) - float(current["start"])
        if _word_group_lexical_count(current) > 1 or duration > 0.6:
            index += 1
            continue
        previous = stable[index - 1] if index > 0 else None
        following = stable[index + 1] if index + 1 < len(stable) else None
        if previous and previous["speaker"] == current["speaker"]:
            stable[index - 1:index + 1] = [
                _merge_word_speaker_groups(previous, current)
            ]
            index = max(0, index - 1)
            continue
        if following and following["speaker"] == current["speaker"]:
            stable[index:index + 2] = [
                _merge_word_speaker_groups(current, following)
            ]
            continue
        if (
            previous
            and following is None
            and previous["speaker"] == cue_speaker["speaker"]
            and not ends_sentence(previous["words"][-1].get("text"))
        ):
            stable[index - 1:index + 1] = [
                _merge_word_speaker_groups(
                    previous, current, speaker=previous["speaker"]
                )
            ]
            index = max(0, index - 1)
            continue
        if (
            following
            and previous is None
            and following["speaker"] == cue_speaker["speaker"]
            and not ends_sentence(current["words"][-1].get("text"))
        ):
            stable[index:index + 2] = [
                _merge_word_speaker_groups(
                    current, following, speaker=following["speaker"]
                )
            ]
            continue
        index += 1
    return stable


def split_cues_by_word_speakers(cues, base_turns, refined_turns):
    units = []
    for cue in cues:
        words = attach_timing_punctuation([
            dict(word)
            for word in cue.get("sourceWords") or []
            if float(word.get("end", 0.0)) > float(word.get("start", 0.0))
        ])
        if not words:
            units.extend(assign_cue_speakers_hybrid([cue], base_turns, refined_turns))
            continue
        groups = []
        for word in sorted(words, key=lambda item: (item["start"], item["end"])):
            interval = {"start": float(word["start"]), "end": float(word["end"])}
            selected, assignment = select_hybrid_speaker(
                interval, base_turns, refined_turns
            )
            speaker = selected["speaker"]
            starts_new_clause = bool(
                groups
                and re.search(r"[,;:!?….][\"'»”’)]*$", groups[-1]["words"][-1]["text"])
            )
            if groups and groups[-1]["speaker"] == speaker and not starts_new_clause:
                groups[-1]["end"] = interval["end"]
                groups[-1]["words"].append(word)
                groups[-1]["assignments"].append(assignment)
            else:
                groups.append({
                    "start": interval["start"],
                    "end": interval["end"],
                    "speaker": speaker,
                    "words": [word],
                    "assignments": [assignment],
                })
        groups = stabilize_short_word_speaker_groups(
            groups, cue, base_turns, refined_turns
        )
        lexical_weights = [
            max(
                1,
                sum(
                    max(1, len(speech_lexical_units(word["text"])))
                    for word in group["words"]
                ),
            )
            for group in groups
        ]
        texts = split_text_proportionally(cue["text"], lexical_weights)
        for group, text in zip(groups, texts):
            if not text:
                continue
            source_name = (
                "sortformer"
                if sum(
                    assignment["source"] == "sortformer"
                    for assignment in group["assignments"]
                ) > len(group["assignments"]) / 2
                else "community-1"
            )
            sortformer_word_count = sum(
                assignment["source"] == "sortformer"
                for assignment in group["assignments"]
            )
            source_start = float(group["start"])
            source_end = float(group["end"])
            units.append({
                **cue,
                "start": source_start,
                "end": max(source_end, source_start + MIN_DIALOGUE_UNIT_SECONDS),
                "sourceStart": source_start,
                "sourceEnd": source_end,
                "speaker": group["speaker"],
                "text": text,
                "sourceText": " ".join(word["text"] for word in group["words"]),
                "sourceWords": group["words"],
                "clauseBoundary": bool(
                    re.search(r"[,;:!?….][\"'»”’)]*$", text.strip())
                ),
                "speakerAssignment": {
                    "source": source_name,
                    "wordCount": len(group["words"]),
                    "sortformerWordCount": sortformer_word_count,
                },
            })
    return units


def merge_dialogue_units(cues, max_gap=0.12, max_duration=5.0, max_words=24):
    merged = []
    for cue in cues:
        if merged:
            previous = merged[-1]
            previous_duration = previous["end"] - previous["start"]
            cue_duration = cue["end"] - cue["start"]
            combined_duration = cue["end"] - previous["start"]
            combined_text = f"{previous['text']} {cue['text']}".strip()
            if (
                previous["speaker"] == cue["speaker"]
                and previous_duration >= MIN_DIALOGUE_MERGE_PART_SECONDS
                and cue_duration >= MIN_DIALOGUE_MERGE_PART_SECONDS
                and 0.0 <= cue["start"] - previous["end"] <= max_gap
                and combined_duration <= max_duration
                and not previous.get("clauseBoundary")
                and not re.search(r"[.!?…][\"'»)]*$", previous["text"].strip())
                and len(combined_text.split()) <= max_words
            ):
                previous["end"] = cue["end"]
                previous["sourceEnd"] = cue["sourceEnd"]
                japanese = bool(re.search(
                    r"[\u3040-\u30ff\u3400-\u9fff]", previous["text"] + cue["text"]
                ))
                separator = "" if japanese else " "
                previous["text"] = f"{previous['text']}{separator}{cue['text']}"
                continue
        merged.append(dict(cue))
    return merged


def merge_dialogue_units_v5(cues, max_gap=0.35, max_duration=8.0):
    """Fusion historique V5, volontairement indépendante des règles R9-R1."""
    merged = []
    for cue in cues:
        if merged:
            previous = merged[-1]
            combined_duration = cue["end"] - previous["start"]
            if (
                previous["speaker"] == cue["speaker"]
                and not previous.get("speakerBoundaryRepair")
                and not cue.get("speakerBoundaryRepair")
                and not previous.get("translationBoundaryReview")
                and not cue.get("translationBoundaryReview")
                and cue["start"] - previous["end"] <= max_gap
                and combined_duration <= max_duration
            ):
                previous["end"] = cue["end"]
                previous["sourceEnd"] = cue["sourceEnd"]
                japanese = bool(re.search(
                    r"[\u3040-\u30ff\u3400-\u9fff]",
                    previous["text"] + cue["text"],
                ))
                separator = "" if japanese else " "
                previous["text"] = (
                    f"{previous['text']}{separator}{cue['text']}"
                )
                continue
        merged.append(dict(cue))
    return merged


def plan_dialogue_timing(
    cues,
    turns,
    source_transcript,
    media_duration,
    max_silence_extension=MAX_SOURCE_SILENCE_EXTENSION_SECONDS,
):
    segments = transcript_segments(source_transcript)
    ordered_turns = sorted(turns, key=lambda item: (item["start"], item["end"]))
    planned = []
    for index, cue in enumerate(cues):
        subtitle_start = float(cue.get("sourceStart", cue["start"]))
        subtitle_end = float(cue.get("sourceEnd", cue["end"]))
        speaker = cue["speaker"]
        next_boundary = float(media_duration)
        if index + 1 < len(cues):
            next_boundary = float(cues[index + 1].get(
                "sourceStart", cues[index + 1]["start"]
            ))
        overlapping_segments = [
            segment for segment in segments
            if segment["end"] > subtitle_start and segment["start"] < subtitle_end
        ]
        transcript_start = min(
            [subtitle_start, *(segment["start"] for segment in overlapping_segments)]
        )
        transcript_end = max(
            [subtitle_end, *(segment["end"] for segment in overlapping_segments)]
        )
        overlapping_speaker_turns = [
            turn for turn in ordered_turns
            if turn["speaker"] == speaker
            and turn["end"] > transcript_start
            and turn["start"] < transcript_end
        ]
        speech_end = max([
            subtitle_end,
            transcript_end,
            *(turn["end"] for turn in overlapping_speaker_turns),
        ])
        # R4: le doublage peut se prolonger, mais ne commence jamais avant le
        # repère de la réplique validée. Si la diarisation détecte le début de
        # la voix après le WebVTT, ce début audio plus tardif devient l'ancre.
        speaker_active_at_subtitle_start = any(
            float(turn["start"]) <= subtitle_start + 0.02
            and float(turn["end"]) > subtitle_start + 0.02
            for turn in overlapping_speaker_turns
        )
        detected_onsets = [] if speaker_active_at_subtitle_start else [
            float(turn["start"])
            for turn in overlapping_speaker_turns
            if subtitle_start + 0.02 < float(turn["start"]) < subtitle_end
        ]
        if not detected_onsets and not speaker_active_at_subtitle_start:
            detected_onsets = [
                float(segment["start"])
                for segment in overlapping_segments
                if subtitle_start + 0.02 < float(segment["start"]) < subtitle_end
            ]
        detected_speech_start = max(
            0.0,
            subtitle_start,
            min(detected_onsets) if detected_onsets else subtitle_start,
        )
        speech_end = min(
            float(media_duration),
            max(subtitle_end, min(max(subtitle_end, next_boundary), speech_end)),
        )
        next_activity_starts = [
            float(turn["start"])
            for turn in ordered_turns
            if float(turn["start"]) >= speech_end - 0.01
            and turn["speaker"] != speaker
        ]
        next_activity = min(next_activity_starts) if next_activity_starts else media_duration
        silence_end = min(
            float(media_duration),
            speech_end + max_silence_extension,
            next_activity,
        )
        voice_end = min(
            float(media_duration),
            max(subtitle_end, min(max(subtitle_end, next_boundary), silence_end)),
        )
        # Une détection audio placée presque à la fin du sous-titre n'est pas
        # une ancre exploitable : elle créait auparavant des fenêtres de 0 ms
        # et supprimait toute la réplique. Dans ce cas, on revient au repère
        # WebVTT validé, qui reste la borne la plus sûre et ne démarre jamais
        # la voix en avance.
        detected_speech_start_accepted = bool(detected_onsets) and (
            subtitle_end - detected_speech_start >= MIN_DIALOGUE_UNIT_SECONDS
            and detected_speech_start - subtitle_start <= MAX_DETECTED_ONSET_DELAY_SECONDS
        )
        speech_start = (
            detected_speech_start
            if detected_speech_start_accepted
            else max(0.0, subtitle_start)
        )
        planned.append({
            **cue,
            "voiceStart": speech_start,
            "voiceEnd": voice_end,
            "voiceTiming": {
                "strategy": "subtitle-start-source-end-v4",
                "subtitleStart": subtitle_start,
                "subtitleEnd": subtitle_end,
                "speakerActiveAtSubtitleStart": speaker_active_at_subtitle_start,
                "detectedSpeechStart": detected_speech_start,
                "detectedSpeechStartAccepted": detected_speech_start_accepted,
                "speechEvidenceStart": speech_start,
                "speechEvidenceEnd": speech_end,
                "nextActivityStart": next_activity,
                "plannedDuration": voice_end - speech_start,
            },
        })
    return planned


def apply_planned_voice_timing(cues, offset_seconds, render_duration):
    prepared = []
    range_end = float(offset_seconds) + float(render_duration)
    for cue in cues:
        voice_start = float(cue.get("voiceStart", cue.get("sourceStart", cue["start"])))
        voice_end = float(cue.get("voiceEnd", cue.get("sourceEnd", cue["end"])))
        start = max(float(offset_seconds), voice_start)
        end = min(range_end, voice_end)
        if end > start:
            prepared.append({
                **cue,
                "start": start - float(offset_seconds),
                "end": end - float(offset_seconds),
            })
    return prepared


def build_voice_profile(
    profile_root,
    source,
    subtitle,
    pipeline_version,
    cues,
    turns,
    reference_source,
    expected_speaker_count=None,
    source_transcript=None,
    models=None,
    generation_config_hash=None,
    diarization_metadata=None,
    consensus_turns=None,
    rejected_voice_references=None,
    manual_references=None,
):
    references, selections = make_speaker_references(
        reference_source,
        turns,
        profile_root,
        source_transcript,
        consensus_turns=consensus_turns,
        rejected_ranges=rejected_voice_references,
        profile=pipeline_version,
        manual_references=manual_references,
    )
    reference_entries = {}
    for speaker, reference in references.items():
        reference_entries[speaker] = {
            "path": str(reference.relative_to(profile_root)),
            "sha256": digest(reference),
            "sourceStart": round(selections[speaker]["start"], 3),
            "sourceEnd": round(selections[speaker]["end"], 3),
            "referenceText": selections[speaker]["text"],
        }
    models = models or {}
    manifest = {
        **({"manualVoiceReferences": manual_references} if manual_references else {}),
        **({"manualSpeakerMapping": (diarization_metadata or {}).get("manualSpeakerMapping")} if manual_references else {}),
        "schemaVersion": 2,
        "sourcePlaylistSha256": digest(source),
        "targetSubtitleSha256": digest(subtitle),
        "voiceEngine": models.get("voiceEngine") or "chatterbox",
        "voiceModel": models.get("voiceModel") or "chatterbox-multilingual-v3",
        "voiceModelRevision": models.get("voiceModelRevision"),
        "generationConfigHash": generation_config_hash,
        "diarizationModel": (
            (diarization_metadata or {}).get("model")
            or "pyannote-speaker-diarization-community-1"
        ),
        "diarizationRefinement": (diarization_metadata or {}).get("refinement"),
        "speakerAssignmentStrategy": (diarization_metadata or {}).get("assignmentStrategy"),
        "speakerAssignmentSummary": (diarization_metadata or {}).get("assignmentSummary"),
        "pipelineVersion": str(pipeline_version or "sami-dubbing-v3-guided-speakers"),
        "expectedSpeakerCount": expected_speaker_count,
        "diarizationSource": "original-audio",
        "referenceStrategy": (
            "admin-selected-range-transcript-aligned-v1" if manual_references else
            "speaker-pure-transcript-aligned-v2"
            if is_v5_profile(pipeline_version)
            else "single-sentence-refined-speaker-consensus-v5"
        ),
        "speakers": sorted(references),
        "references": reference_entries,
        "assignments": {
            cue_identity(cue): cue["speaker"]
            for cue in cues
        },
        "dialogueUnits": cues,
    }
    manifest_path = profile_root / "manifest.json"
    write_json(manifest_path, manifest)
    prepared = {
        speaker: {
            "path": reference,
            "text": reference_entries[speaker]["referenceText"],
        }
        for speaker, reference in references.items()
    }
    return prepared, manifest_path, digest(manifest_path)


def regenerate_single_voice_profile(
    profile_root,
    previous_profile_root,
    previous_checksum,
    source,
    subtitle,
    reference_source,
    source_transcript,
    target_speaker,
    rejected_voice_references,
    pipeline_version,
    models,
    generation_config_hash,
):
    assigned, previous_references, previous_manifest = load_voice_profile(
        previous_profile_root,
        previous_checksum,
        source,
        subtitle,
        [],
        expected_pipeline=pipeline_version,
        expected_generation_config_hash=generation_config_hash,
    )
    target_speaker = str(target_speaker or "")
    if target_speaker not in previous_references:
        raise RuntimeError("Le profil vocal ciblé n'existe pas dans le manifeste précédent.")
    target_turns = []
    for cue in assigned:
        if str(cue.get("speaker") or "") != target_speaker:
            continue
        start = float(cue.get("voiceStart", cue.get("sourceStart", cue.get("start", 0.0))))
        end = float(cue.get("voiceEnd", cue.get("sourceEnd", cue.get("end", start))))
        if end > start:
            target_turns.append({"start": start, "end": end, "speaker": target_speaker})
    if not target_turns:
        raise RuntimeError("Aucune réplique ne permet de régénérer uniquement ce profil vocal.")

    profile_root.mkdir(parents=True, exist_ok=True)
    regenerated, selections = make_speaker_references(
        reference_source,
        target_turns,
        profile_root,
        source_transcript,
        consensus_turns=target_turns,
        rejected_ranges=rejected_voice_references,
        profile=pipeline_version,
        manual_references=previous_manifest.get("manualVoiceReferences"),
    )
    references_root = profile_root / "references"
    references_root.mkdir(parents=True, exist_ok=True)
    reference_entries = {}
    prepared = {}
    for speaker in sorted(previous_references):
        safe_speaker = re.sub(r"[^A-Za-z0-9_-]+", "_", speaker).strip("_") or "speaker"
        destination = references_root / f"{safe_speaker}.wav"
        if speaker == target_speaker:
            source_reference = Path(regenerated[speaker]).resolve()
            selection = selections[speaker]
            reference_text = selection["text"]
            source_start = selection["start"]
            source_end = selection["end"]
        else:
            source_reference = Path(previous_references[speaker]["path"]).resolve()
            previous_entry = (previous_manifest.get("references") or {}).get(speaker) or {}
            reference_text = str(previous_entry.get("referenceText") or previous_references[speaker]["text"])
            source_start = float(previous_entry.get("sourceStart", 0.0))
            source_end = float(previous_entry.get("sourceEnd", source_start))
        if source_reference != destination.resolve():
            shutil.copyfile(source_reference, destination)
        reference_entries[speaker] = {
            "path": str(destination.relative_to(profile_root)),
            "sha256": digest(destination),
            "sourceStart": round(source_start, 3),
            "sourceEnd": round(source_end, 3),
            "referenceText": reference_text,
        }
        prepared[speaker] = {"path": destination, "text": reference_text}

    manifest = json.loads(json.dumps(previous_manifest))
    manifest.update({
        "voiceEngine": models.get("voiceEngine") or previous_manifest.get("voiceEngine"),
        "voiceModel": models.get("voiceModel") or previous_manifest.get("voiceModel"),
        "voiceModelRevision": models.get("voiceModelRevision"),
        "generationConfigHash": generation_config_hash,
        "pipelineVersion": str(pipeline_version or previous_manifest.get("pipelineVersion") or ""),
        "referenceStrategy": (
            "targeted-speaker-reference-regeneration-v1-v5"
            if is_v5_profile(pipeline_version)
            else "targeted-speaker-reference-regeneration-v1"
        ),
        "references": reference_entries,
        "regeneratedSpeaker": target_speaker,
        "regenerationCount": int(previous_manifest.get("regenerationCount") or 0) + 1,
    })
    manifest_path = profile_root / "manifest.json"
    write_json(manifest_path, manifest)
    log(
        f"Profil vocal ciblé {target_speaker} régénéré; "
        f"{len(prepared) - 1} autre(s) référence(s) conservée(s)."
    )
    return assigned, prepared, manifest_path, digest(manifest_path)


def load_voice_profile(
    profile_root,
    expected_checksum,
    source,
    subtitle,
    cues,
    expected_pipeline=None,
    expected_generation_config_hash=None,
):
    profile_root = Path(profile_root).resolve()
    manifest_path = profile_root / "manifest.json"
    if not manifest_path.is_file() or digest(manifest_path) != str(expected_checksum or ""):
        raise RuntimeError("Le profil vocal validé est absent ou son empreinte a changé.")
    manifest = load_json(manifest_path)
    if manifest.get("schemaVersion") != 2:
        raise RuntimeError("La version du profil vocal validé n'est pas prise en charge.")
    if manifest.get("sourcePlaylistSha256") != digest(source):
        raise RuntimeError("La source vidéo a changé depuis la validation des profils vocaux.")
    if manifest.get("targetSubtitleSha256") != digest(subtitle):
        raise RuntimeError("Le sous-titre a changé depuis la validation des profils vocaux.")
    if (
        expected_pipeline is not None
        and manifest.get("pipelineVersion") != expected_pipeline
    ):
        raise RuntimeError("Le profil vocal validé appartient à un autre profil algorithmique.")
    if (
        expected_generation_config_hash is not None
        and manifest.get("generationConfigHash") != expected_generation_config_hash
    ):
        raise RuntimeError("Les paramètres du profil vocal validé ne correspondent plus au job.")

    assigned = manifest.get("dialogueUnits") or []
    if not assigned:
        raise RuntimeError("Les répliques validées du profil vocal sont introuvables.")

    references = {}
    for speaker, entry in (manifest.get("references") or {}).items():
        reference = (profile_root / str(entry.get("path") or "")).resolve()
        try:
            reference.relative_to(profile_root)
        except ValueError as error:
            raise RuntimeError("Le profil vocal contient un chemin invalide.") from error
        if not reference.is_file() or digest(reference) != str(entry.get("sha256") or ""):
            raise RuntimeError(f"La référence vocale validée de {speaker} a changé.")
        references[str(speaker)] = {
            "path": reference,
            "text": str(entry.get("referenceText") or "").strip(),
        }
    if not references or any(cue["speaker"] not in references for cue in assigned):
        raise RuntimeError("Le profil vocal ne couvre pas tous les intervenants validés.")
    return assigned, references, manifest


def separate_bandit(source, destination, install):
    import numpy as np
    import soundfile as sf
    from bandit_infer import BanditSession

    bandit = install.get("models", {}).get("bandit") or {}
    checkpoint = Path(str(bandit.get("path") or ""))
    expected_sha256 = str(bandit.get("sha256") or "")
    if not checkpoint.is_file() or not expected_sha256:
        raise RuntimeError("Poids BandIt absents du manifeste local.")
    source_info = sf.info(source)
    sample_rate = source_info.samplerate
    if sample_rate != 48000:
        raise RuntimeError("BandIt v2 exige une source 48 kHz.")
    try:
        import torch
        cuda = bool(torch.cuda.is_available())
    except ImportError:
        cuda = False
    backend = "torch" if cuda else "mlx"
    device = "cuda" if cuda else "mps"
    speech_path = Path(destination).with_name("speech.wav")
    # Le backend BandIt découpe lui-même en fenêtres de 8 s, mais construit d'abord
    # les tenseurs de sortie pour toute la piste. Sur un film complet, cette allocation
    # peut faire terminer nativement PyTorch sous Windows (0xC0000005). Les blocs
    # extérieurs bornent la mémoire ; le contexte est retiré avant l'écriture afin que
    # les raccords restent calculés avec de l'audio réel de part et d'autre.
    core_samples = sample_rate * 120
    context_samples = sample_rate * 8
    with BanditSession(
        "v2-multi",
        backend=backend,
        device=device,
        checkpoint_path=checkpoint,
        checkpoint_sha256=expected_sha256,
    ) as session:
        with (
            sf.SoundFile(source, mode="r") as input_file,
            sf.SoundFile(
                destination,
                mode="w",
                samplerate=sample_rate,
                channels=source_info.channels,
                subtype="FLOAT",
            ) as background_file,
            sf.SoundFile(
                speech_path,
                mode="w",
                samplerate=sample_rate,
                channels=source_info.channels,
                subtype="FLOAT",
            ) as speech_file,
        ):
            total_samples = source_info.frames
            total_blocks = max(1, math.ceil(total_samples / core_samples))
            for block_index, core_start in enumerate(
                range(0, total_samples, core_samples),
                start=1,
            ):
                core_end = min(total_samples, core_start + core_samples)
                read_start = max(0, core_start - context_samples)
                read_end = min(total_samples, core_end + context_samples)
                input_file.seek(read_start)
                audio = input_file.read(
                    read_end - read_start,
                    dtype="float32",
                    always_2d=True,
                )
                stems = session.infer(audio.T, sample_rate=sample_rate)
                trim_start = core_start - read_start
                trim_end = trim_start + (core_end - core_start)
                music = np.asarray(stems["music"], dtype=np.float32)
                effects = np.asarray(stems["effects"], dtype=np.float32)
                speech = np.asarray(stems["speech"], dtype=np.float32)
                background = np.clip(
                    music[:, trim_start:trim_end] + effects[:, trim_start:trim_end],
                    -1.0,
                    1.0,
                )
                background_file.write(background.T)
                speech_file.write(speech[:, trim_start:trim_end].T)
                log(f"Séparation BandIt bloc {block_index}/{total_blocks} terminée.")
    return speech_path


def qwen_device_options(torch):
    if torch.cuda.is_available():
        return {"device_map": "cuda:0", "dtype": torch.bfloat16, "attn_implementation": "sdpa"}
    if torch.backends.mps.is_available():
        # FP32 avoids unsupported/unstable low-precision codec operations on Metal.
        # torch 2.6 SDPA/GQA on MPS aborts in Metal with mismatched KV heads.
        # Eager attention expands the KV heads explicitly and preserves the model.
        return {"device_map": "mps", "dtype": torch.float32, "attn_implementation": "eager"}
    raise RuntimeError("Qwen3-TTS nécessite NVIDIA CUDA ou Apple Silicon avec Metal (MPS) accessible.")


def load_voice_model(install, references=None):
    import torch

    engine = str(install.get("voiceEngine") or "chatterbox").lower()
    voice = install.get("models", {}).get("voice") or install.get("models", {}).get("chatterbox") or {}
    if engine == "qwen3-tts":
        device_options = qwen_device_options(torch)
        from qwen_tts import Qwen3TTSModel

        model_path = Path(str(voice.get("path") or ""))
        if not model_path.is_dir():
            raise RuntimeError("Le checkpoint Qwen3-TTS local est absent.")
        log(f"Chargement {voice.get('repo')} sur {device_options['device_map']} ({device_options['dtype']}, {device_options['attn_implementation']}).")
        model = Qwen3TTSModel.from_pretrained(
            str(model_path),
            **device_options,
        )
        prompts = {}
        for speaker, reference in (references or {}).items():
            ref_text = str(reference.get("text") or "").strip()
            prompts[speaker] = model.create_voice_clone_prompt(
                ref_audio=str(reference["path"]),
                ref_text=ref_text or None,
                x_vector_only_mode=not bool(ref_text),
            )
        return {
            "engine": engine,
            "model": model,
            "prompts": prompts,
            "sampleRate": None,
        }
    if engine != "chatterbox":
        raise RuntimeError(f"Moteur vocal local non pris en charge: {engine}.")
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    log(f"Chargement Chatterbox Multilingual V3 sur {device}.")
    return {
        "engine": engine,
        "model": ChatterboxMultilingualTTS.from_pretrained(device=device, t3_model="v3"),
        "prompts": {},
        "sampleRate": None,
    }


def guarded_voice_operation(operation, *, workspace, profile, speaker, source_start,
                            text, language, kind, progress, seed=None, details=None,
                            cue_index=None, cue_count=None, attempt=1):
    """The Node supervisor owns the deadline, even if Python/CUDA stops responding."""
    if os.environ.get("SAMI_DUBBING_WATCHDOG_PROTOCOL") != "1":
        raise DubbingInputQualityError("R5-R1 nécessite le superviseur SAMI mis à jour ; génération directe non protégée refusée.")
    timeout_seconds = {"sample": 180, "cue": 600, "library": 1800, "watermark": 60}[kind]
    identity = uuid.uuid4().hex
    report = {
        "schemaVersion": 1, "pipelineVersion": profile, "id": identity,
        "speaker": speaker, "sourceStart": source_start, "text": text,
        "language": language, "operation": kind, "timeoutSeconds": timeout_seconds,
        "startedAt": time.time(), "state": "running", "details": details or {},
        "seed": seed, "generationConfigHash": PROFILE_GENERATION_CONFIG_HASHES[profile],
    }
    diagnostic = workspace / "generation-attempt.json"
    write_json(diagnostic, report)
    event = {"id": identity, "state": "start", "kind": kind, "speaker": speaker,
             "sourceStart": source_start, "progress": progress,
             "cueIndex": cue_index, "cueCount": cue_count, "attempt": attempt}
    print("[SAMI dubbing watchdog] " + json.dumps(event), file=sys.stderr, flush=True)
    try:
        result = operation()
    except Exception as error:
        report.update(load_json(diagnostic))
        report.update({"state": "failed", "message": str(error)[:2000], "endedAt": time.time()})
        write_json(diagnostic, report)
        raise
    else:
        report.update(load_json(diagnostic))
        report.update({"state": "completed", "endedAt": time.time()})
        write_json(diagnostic, report)
        return result
    finally:
        print("[SAMI dubbing watchdog] " + json.dumps({"id": identity, "state": "end"}), file=sys.stderr, flush=True)


@contextmanager
def observe_voice_activity(kind, *, progress, speaker="SPEAKER_00", source_start=0,
                           cue_index=None, cue_count=None, attempt=1):
    """Observability only: does not change synthesis, timing or quality thresholds."""
    identity = uuid.uuid4().hex
    event = {"id": identity, "state": "observe", "kind": kind, "speaker": speaker,
             "sourceStart": source_start, "progress": progress,
             "cueIndex": cue_index, "cueCount": cue_count, "attempt": attempt}
    print("[SAMI dubbing watchdog] " + json.dumps(event), file=sys.stderr, flush=True)
    try:
        yield
    finally:
        print("[SAMI dubbing watchdog] " + json.dumps({"id": identity, "state": "end"}), file=sys.stderr, flush=True)


def generate_voice(runtime, text, language, speaker, reference, attempt=0,
                   profile=V6_CLEAN_PHRASES_R9_R1_PROFILE, watch_context=None):
    operation = lambda: generate_voice_unwatched(runtime, text, language, speaker, reference, attempt, profile)
    if profile not in BOUNDED_V5_PROFILES:
        return operation()
    if not watch_context:
        raise DubbingInputQualityError("Contexte du superviseur vocal R5-R1 absent.")
    if profile in JAPANESE_BOUNDED_PROFILES and language == "ja":
        operation = lambda: bounded_japanese_generation(
            runtime, text, language, speaker, reference, attempt, profile, watch_context["workspace"],
        )
    return guarded_voice_operation(operation, profile=profile, speaker=speaker,
        text=text, language=language, **watch_context,
        details={"attempt": attempt + 1, "engine": runtime["engine"],
                 "promptPolicy": "speaker-embedding-only" if identity_prompt_enabled(profile, language) else "reference-audio-and-text",
                 "referenceText": reference.get("text"), "referenceSha256": digest(reference["path"])})


def japanese_identity_enabled(profile, language):
    return profile in {V5_JAPANESE_IDENTITY_PROFILE, *JAPANESE_BOUNDED_PROFILES} and language == "ja"


def identity_prompt_enabled(profile, language):
    # Prompt selection and Japanese text QC are deliberately separate contracts.
    return japanese_identity_enabled(profile, language) or (profile == V5_ENGLISH_IDENTITY_PROFILE and language == "en")


def japanese_token_budget(text):
    count = len(normalized_speech_text(text))
    if not count:
        raise DubbingInputQualityError("Le budget vocal nécessite un texte prononçable non vide.")
    return min(720, max(96, count * 4 + 48))


def record_generation_stage(workspace, stage, **details):
    diagnostic = Path(workspace) / "generation-attempt.json"
    report = load_json(diagnostic)
    entry = {"stage": stage, "at": time.time(), **details}
    report["internalStage"] = stage
    report["internalStages"] = [*(report.get("internalStages") or []), entry][-16:]
    write_json(diagnostic, report)
    log(f"Qwen R5-R3 : {stage} " + json.dumps(details, ensure_ascii=True))


@contextmanager
def temporary_instance_method(instance, name, replacement):
    # Restore the original descriptor, not a permanently bound instance method.
    existed = name in vars(instance)
    previous = vars(instance).get(name)
    setattr(instance, name, replacement)
    try:
        yield
    finally:
        if existed:
            setattr(instance, name, previous)
        else:
            delattr(instance, name)


def guarded_qwen_call(model, operation, budget, report_stage):
    """Observe Qwen's real talker result BEFORE its wrapper strips EOS/decodes.

    Single synchronous utterance only; no library files or global classes patched.
    Unknown adapters fail closed rather than guessing completion from WAV duration.
    """
    try:
        core = model.model
        talker, tokenizer = core.talker, core.speech_tokenizer
        eos = core.config.talker_config.codec_eos_token_id
        original_generate, original_decode = talker.generate, tokenizer.decode
        if isinstance(eos, bool) or not isinstance(eos, int) or not callable(original_generate) or not callable(original_decode):
            raise ValueError("invalid Qwen adapter")
    except (AttributeError, TypeError, ValueError) as error:
        raise DubbingGenerationContractError("Interface Qwen incompatible avec la vérification de fin R5-R3.") from error
    observed = {"eos": False, "decoded": False}

    def generate(*args, **kwargs):
        if kwargs.get("max_new_tokens") != budget:
            raise DubbingGenerationContractError("Qwen n'a pas transmis le budget de génération R5-R3.")
        report_stage("TOKEN_GENERATION", maxNewTokens=budget)
        # A forced EOS at the length limit would masquerade as natural completion.
        kwargs["forced_eos_token_id"] = None
        result = original_generate(*args, **kwargs)
        try:
            sequences = result.sequences
            if len(sequences.shape) != 2 or sequences.shape[0] != 1:
                raise ValueError("single sequence required")
            tokens = sequences[0].tolist()
            if not tokens or not all(isinstance(token, int) for token in tokens):
                raise ValueError("invalid sequence")
        except (AttributeError, TypeError, ValueError) as error:
            raise DubbingGenerationContractError("Qwen ne fournit pas une séquence de fin vérifiable ; audio refusé.") from error
        observed["eos"] = tokens[-1] == eos
        report_stage("TOKEN_GENERATION_RETURNED", sequenceTokens=len(tokens), maxNewTokens=budget,
                     eosObserved=observed["eos"])
        if not observed["eos"]:
            raise DubbingGenerationLimitError(
                f"Génération japonaise interrompue sans signal de fin (budget {budget} tokens). "
                "Sortie refusée avant décodage : aucune réplique tronquée ne sera validée."
            )
        return result

    def decode(*args, **kwargs):
        if not observed["eos"]:
            raise DubbingGenerationContractError("Décodage demandé sans signal de fin Qwen vérifié.")
        report_stage("AUDIO_DECODING")
        result = original_decode(*args, **kwargs)
        observed["decoded"] = True
        report_stage("AUDIO_DECODED")
        return result

    with temporary_instance_method(talker, "generate", generate), temporary_instance_method(tokenizer, "decode", decode):
        result = operation()
    if not observed["eos"] or not observed["decoded"]:
        raise DubbingGenerationContractError("Le modèle a contourné le contrôle de fin/décodage R5-R3 ; audio refusé.")
    return result


def bounded_japanese_generation(runtime, text, language, speaker, reference, attempt, profile, workspace):
    if runtime["engine"] != "qwen3-tts":
        raise DubbingGenerationContractError("La génération japonaise bornée R5-R3 nécessite Qwen3-TTS.")
    budget = japanese_token_budget(text)
    report = lambda stage, **details: record_generation_stage(workspace, stage, **details)
    report("VOICE_PROMPT", maxNewTokens=budget, textCharacters=len(normalized_speech_text(text)))
    generation_voice_prompt(runtime, speaker, reference, profile, language)
    report("VOICE_PROMPT_READY", maxNewTokens=budget)
    return guarded_qwen_call(runtime["model"],
        lambda: generate_voice_unwatched(runtime, text, language, speaker, reference, attempt, profile),
        budget, report)


def generation_voice_prompt(runtime, speaker, reference, profile, language):
    if not identity_prompt_enabled(profile, language):
        return runtime["prompts"][speaker]
    # Separate cache: never replace legacy ICL prompts or the selected reference.
    key = (speaker, digest(reference["path"]))
    prompts = runtime.setdefault("identityPrompts", {})
    if key not in prompts:
        prompts[key] = runtime["model"].create_voice_clone_prompt(
            ref_audio=str(reference["path"]), ref_text=None, x_vector_only_mode=True,
        )
    return prompts[key]


def generate_voice_unwatched(
    runtime,
    text,
    language,
    speaker,
    reference,
    attempt=0,
    profile=V6_CLEAN_PHRASES_R9_R1_PROFILE,
):
    model = runtime["model"]
    if runtime["engine"] == "qwen3-tts":
        prompt = generation_voice_prompt(runtime, speaker, reference, profile, language)
        limits = {"max_new_tokens": japanese_token_budget(text)} if profile in JAPANESE_BOUNDED_PROFILES and language == "ja" else {}
        retry = attempt > 0
        if is_v5_profile(profile) and not (
            v5_short_quality_profile(profile)
            and len(profile_speech_lexical_units(text, profile)) <= 4
        ):
            waveforms, sample_rate = model.generate_voice_clone(
                text=text,
                language=QWEN_LANGUAGES[language],
                voice_clone_prompt=prompt,
                do_sample=True,
                temperature=0.5 if retry else 0.65,
                top_p=0.8 if retry else 0.85,
                repetition_penalty=1.1 if retry else 1.05,
                **limits,
            )
            return waveforms[0], sample_rate
        short_utterance = len(profile_speech_lexical_units(text, profile)) <= 4
        generation_options = {
            "do_sample": not short_utterance or retry,
            "repetition_penalty": 1.1 if retry or short_utterance else 1.05,
        }
        if short_utterance and retry:
            generation_options.update({
                "temperature": 0.35 if attempt == 1 else 0.45,
                "top_p": 0.75 if attempt == 1 else 0.8,
            })
        elif not short_utterance:
            generation_options.update({
                "temperature": 0.5 if retry else 0.65,
                "top_p": 0.8 if retry else 0.85,
            })
        waveforms, sample_rate = model.generate_voice_clone(
            text=text,
            language=QWEN_LANGUAGES[language],
            voice_clone_prompt=prompt,
            **limits,
            **generation_options,
        )
        return waveforms[0], sample_rate
    waveform = model.generate(
        text,
        language_id=language,
        audio_prompt_path=str(reference["path"]),
        exaggeration=0.5,
        cfg_weight=0.3,
    )
    return waveform, model.sr


def save_generated_audio(waveform, sample_rate, destination):
    import numpy as np
    import soundfile as sf

    if hasattr(waveform, "detach"):
        waveform = waveform.detach().cpu().numpy()
    audio = np.asarray(waveform, dtype=np.float32).squeeze()
    if audio.ndim != 1 or audio.size == 0:
        raise RuntimeError("Chatterbox a renvoyé un signal audio invalide.")
    sf.write(destination, audio, sample_rate, subtype="FLOAT")


def seed_synthesis(
    cue,
    profile_checksum,
    attempt=0,
    profile=V6_CLEAN_PHRASES_R9_R1_PROFILE,
):
    import random
    import numpy as np
    import torch

    if is_v5_profile(profile):
        seed_material = (
            f"{profile_checksum}|{cue['speaker']}|speaker-stable-retry-v2"
        )
    else:
        speaker_identity = (
            profile_checksum.get(str(cue["speaker"]))
            if isinstance(profile_checksum, dict)
            else profile_checksum
        )
        seed_material = (
            f"{speaker_identity}|{cue['speaker']}|speaker-reference-stable-retry-v3"
        )
    if attempt:
        seed_material += f"|{cue_identity(cue)}|retry-{attempt}"
    seed = int(hashlib.sha256(seed_material.encode("utf-8")).hexdigest()[:8], 16)
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    return seed


def normalized_speech_text(value):
    value = unicodedata.normalize("NFKC", str(value or "")).lower()
    return "".join(character for character in value if character.isalnum())


def edit_distance(left, right):
    if len(left) < len(right):
        left, right = right, left
    previous = list(range(len(right) + 1))
    for left_index, left_value in enumerate(left, start=1):
        current = [left_index]
        for right_index, right_value in enumerate(right, start=1):
            current.append(min(
                current[-1] + 1,
                previous[right_index] + 1,
                previous[right_index - 1] + (left_value != right_value),
            ))
        previous = current
    return previous[-1]


def character_error_rate(expected, recognized):
    expected_value = normalized_speech_text(expected)
    recognized_value = normalized_speech_text(recognized)
    if not expected_value:
        return 0.0
    return edit_distance(expected_value, recognized_value) / len(expected_value)


def normalized_japanese_speech(value):
    # Fold kana variants only; do not guess kanji readings or rewrite the dialogue.
    normalized = normalized_speech_text(value)
    return "".join(chr(ord(char) - 0x60) if "ァ" <= char <= "ヶ" else char for char in normalized)


def japanese_quality_decision(expected, recognized, generated_duration, acoustic_evidence):
    expected_value = normalized_japanese_speech(expected)
    recognized_value = normalized_japanese_speech(recognized)
    count = len(expected_value)
    cer = edit_distance(expected_value, recognized_value) / max(1, count)
    speech = bool((acoustic_evidence or {}).get("hasSpeech"))
    confirmed = bool(count and recognized_value and speech and cer <= 0.35)
    short = 0 < count <= 8
    maximum_unconfirmed = max(1.2, count * 0.25 + 0.5)
    expansion = len(recognized_value) > max(count * 2, count + 2)
    review = bool(short and speech and 0 < generated_duration <= maximum_unconfirmed and not expansion)
    return {
        "japaneseQuality": True, "cer": round(cer, 6),
        "confirmed": confirmed, "reviewCandidate": review and not confirmed,
        "shortUtterance": short, "expectedCharacterCount": count,
        "recognizedCharacterCount": len(recognized_value),
        "excessiveAsrExpansion": expansion, "acousticSpeechPresent": speech,
        "shortUnconfirmedMaximumSeconds": maximum_unconfirmed if short else None,
        "rejectionReason": None if confirmed or review else (
            "no-acoustic-speech" if not speech else
            "unconfirmed-short-duration" if short and generated_duration > maximum_unconfirmed else
            "text-mismatch"
        ),
    }


def v5_quality_failure_message(cue, target_duration, generated_duration, diagnostic):
    timing_blocked = diagnostic.get("blockedByMediaEnd") is True
    cause = "durée incompatible avec la fin de la vidéo" if timing_blocked else "dialogue non conforme"
    return (
        f"Contrôle vocal V5 bloquant — {cause} à {cue['sourceStart']:.2f}s ({cue['speaker']}): "
        f"« {cue['text']} ». Fenêtre initiale {target_duration:.3f}s, synthèse {generated_duration:.3f}s, "
        f"durée après ajustement {diagnostic.get('fittedDuration', target_duration):.3f}s, "
        f"accélération {diagnostic['durationRatio']}×, CER {diagnostic['cer']}. "
        + ("La fin minimale dépasserait la vidéo source." if timing_blocked else
           "La fin souple est autorisée ; elle ne valide pas un texte incorrect ou un signal vocal inexploitable.")
    )


def speech_lexical_units(value):
    """Compte les unités parlées, sans faire dépendre le QC de la ponctuation."""
    normalized = unicodedata.normalize("NFKC", str(value or "")).casefold()
    latin_or_numeric = re.findall(r"[\w]+", normalized, flags=re.UNICODE)
    if any(re.search(r"[a-zà-öø-ÿ0-9]", token) for token in latin_or_numeric):
        return [token for token in latin_or_numeric if token]
    # Le japonais ne sépare pas nécessairement ses mots par des espaces. On
    # mesure donc les groupes de graphies plutôt que chaque caractère.
    return re.findall(
        r"[\u3040-\u309f]+|[\u30a0-\u30ff]+|[\u3400-\u9fff]+|\d+",
        normalized,
    )


def speech_lexical_units_with_contractions(value):
    """Compte n'y, t'as ou qu'il comme un mot parlé, sans modifier les anciens profils."""
    normalized = unicodedata.normalize("NFKC", str(value or "")).casefold()
    tokens = re.findall(r"[^\W_]+(?:['’][^\W_]+)*", normalized, flags=re.UNICODE)
    if any(re.search(r"[a-zà-öø-ÿ0-9]", token) for token in tokens):
        return tokens
    return re.findall(
        r"[\u3040-\u309f]+|[\u30a0-\u30ff]+|[\u3400-\u9fff]+|\d+",
        normalized,
    )


def profile_speech_lexical_units(value, profile):
    if profile in {V5_GUIDED_REFERENCES_R4_R2_PROFILE, *TRANSLATED_V5_PROFILES}:
        return speech_lexical_units_with_contractions(value)
    return speech_lexical_units(value)


def transcript_quality_decision(
    expected,
    recognized,
    cer,
    attempt,
    max_attempts=3,
    generated_duration=None,
    acoustic_evidence=None,
    lexical_unit_parser=speech_lexical_units,
):
    normalized_expected = normalized_speech_text(expected)
    normalized_recognized = normalized_speech_text(recognized)
    checked = len(normalized_expected) >= 4
    mismatch = cer is not None and cer > 0.35
    lexical_unit_count = len(lexical_unit_parser(expected))
    recognized_lexical_unit_count = len(lexical_unit_parser(recognized))
    short_utterance = lexical_unit_count <= 4
    final_attempt = attempt >= max_attempts - 1
    excessive_expansion = recognized_lexical_unit_count > max(
        lexical_unit_count * 2,
        lexical_unit_count + 4,
    )
    duration = (
        float(generated_duration)
        if generated_duration is not None and float(generated_duration) > 0
        else None
    )
    recognized_character_count = len(normalized_recognized)
    acoustic_word_capacity = math.ceil(duration * 7.5) + 2 if duration else None
    acoustic_character_capacity = (
        max(len(normalized_expected) * 3, math.ceil(duration * 30.0) + 8)
        if duration else None
    )
    acoustic_speech_present = bool((acoustic_evidence or {}).get("hasSpeech"))
    recognition_physically_impossible = bool(
        duration is not None
        and excessive_expansion
        and (
            recognized_lexical_unit_count > acoustic_word_capacity
            or recognized_character_count > acoustic_character_capacity
        )
    )
    asr_unreliable = bool(
        mismatch
        and short_utterance
        and acoustic_speech_present
        and (
            not normalized_recognized
            or recognition_physically_impossible
        )
    )
    blocking = (
        checked and not normalized_recognized and not asr_unreliable
    ) or (
        mismatch and not short_utterance
    ) or (
        mismatch and excessive_expansion and not asr_unreliable
    )
    short_mismatch_accepted = (
        mismatch
        and short_utterance
        and (
            asr_unreliable
            or (final_attempt and bool(normalized_recognized))
        )
    )
    return {
        "checked": checked,
        "mismatch": mismatch,
        "blocking": blocking,
        "shortUtterance": short_utterance,
        "lexicalUnitCount": lexical_unit_count,
        "recognizedLexicalUnitCount": recognized_lexical_unit_count,
        "excessiveExpansion": excessive_expansion,
        "asrUnreliable": asr_unreliable,
        "acousticSpeechPresent": acoustic_speech_present,
        "recognitionPhysicallyImpossible": recognition_physically_impossible,
        "acousticWordCapacity": acoustic_word_capacity,
        "acousticCharacterCapacity": acoustic_character_capacity,
        "accepted": not blocking and (not mismatch or short_mismatch_accepted),
    }


def plan_synthesis_timing(
    cue,
    generated_duration,
    render_duration=None,
    max_acceleration=MAX_SYNTHESIS_ACCELERATION,
    max_spillover=MAX_VOICE_TAIL_SPILLOVER_SECONDS,
):
    start = float(cue["start"])
    original_end = float(cue["end"])
    original_duration = original_end - start
    if original_duration <= 0:
        raise DubbingInputQualityError("Une réplique possède une durée temporelle invalide.")
    required_duration = float(generated_duration) / max_acceleration
    maximum_end = original_end + max_spillover
    if render_duration is not None:
        maximum_end = min(maximum_end, float(render_duration))
    fitted_end = max(original_end, min(start + required_duration, maximum_end))
    fitted_duration = fitted_end - start
    boundary_trim_seconds = max(0.0, required_duration - fitted_duration)
    raw_acceleration = max(1.0, float(generated_duration) / fitted_duration)
    acceleration = (
        max_acceleration
        if raw_acceleration > max_acceleration
        and boundary_trim_seconds <= MAX_TIMING_BOUNDARY_TRIM_SECONDS
        else raw_acceleration
    )
    return {
        "cue": {**cue, "end": fitted_end},
        "originalDuration": original_duration,
        "fittedDuration": fitted_duration,
        "spilloverSeconds": max(0.0, fitted_duration - original_duration),
        "boundaryTrimSeconds": boundary_trim_seconds,
        "rawAcceleration": raw_acceleration,
        "acceleration": acceleration,
    }


def load_quality_model(install):
    quality = install.get("models", {}).get("quality") or {}
    model_path = Path(str(quality.get("path") or ""))
    if not model_path.is_dir():
        raise RuntimeError("Le modèle local de contrôle vocal faster-whisper est absent.")
    from faster_whisper import WhisperModel
    try:
        import torch
        cuda = torch.cuda.is_available()
    except ImportError:
        cuda = False
    return WhisperModel(
        str(model_path),
        device="cuda" if cuda else "cpu",
        compute_type="float16" if cuda else "int8",
        local_files_only=True,
    )


def transcribe_quality(model, audio_path, language):
    segments, _ = model.transcribe(
        str(audio_path), language=language, beam_size=3, vad_filter=False,
        condition_on_previous_text=False,
    )
    return " ".join(str(segment.text).strip() for segment in segments).strip()


def generated_audio_activity(audio_path):
    """Measure speech-like energy without relying on ASR for micro-utterances."""
    import numpy as np
    import soundfile as sf

    audio, sample_rate = sf.read(audio_path, dtype="float32", always_2d=False)
    if audio.ndim > 1:
        audio = np.mean(audio, axis=1)
    samples = np.asarray(audio, dtype=np.float32).reshape(-1)
    duration = samples.size / float(sample_rate) if sample_rate else 0.0
    if not samples.size or duration <= 0:
        return {
            "hasSpeech": False,
            "duration": 0.0,
            "peakDbfs": -120.0,
            "rmsDbfs": -120.0,
            "activeSeconds": 0.0,
            "activeRatio": 0.0,
        }
    absolute = np.abs(samples)
    peak = float(np.max(absolute))
    rms = float(np.sqrt(np.mean(np.square(samples, dtype=np.float64))))
    frame_size = max(1, round(float(sample_rate) * 0.02))
    frame_count = math.ceil(samples.size / frame_size)
    padded = np.pad(samples, (0, frame_count * frame_size - samples.size))
    frame_rms = np.sqrt(np.mean(
        np.square(padded.reshape(frame_count, frame_size), dtype=np.float64),
        axis=1,
    ))
    active_threshold = 10 ** (-45.0 / 20.0)
    active_frames = int(np.count_nonzero(frame_rms >= active_threshold))
    active_seconds = min(duration, active_frames * frame_size / float(sample_rate))
    active_ratio = active_seconds / duration
    minimum_active_seconds = min(0.04, duration * 0.2)
    has_speech = bool(
        duration >= MIN_SYNTHESIS_INPUT_SECONDS
        and peak >= 10 ** (-40.0 / 20.0)
        and rms >= 10 ** (-50.0 / 20.0)
        and active_seconds >= minimum_active_seconds
    )
    return {
        "hasSpeech": has_speech,
        "duration": round(duration, 4),
        "peakDbfs": round(20.0 * math.log10(max(peak, 1e-6)), 2),
        "rmsDbfs": round(20.0 * math.log10(max(rms, 1e-6)), 2),
        "activeSeconds": round(active_seconds, 4),
        "activeRatio": round(active_ratio, 4),
    }


def trim_generated_silence(source, destination):
    # Qwen peut ajouter un silence variable avant la première syllabe. Le
    # retirer ici garantit que le placement sur la timeline correspond au
    # début réel de la voix et non au début du fichier synthétisé.
    silence_filter = (
        "silenceremove=start_periods=1:start_duration=0.02:start_threshold=-50dB,"
        "areverse,"
        "silenceremove=start_periods=1:start_duration=0.04:start_threshold=-50dB,"
        "areverse"
    )
    run(
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", source,
        "-filter:a", silence_filter, "-ac", "1", "-c:a", "pcm_f32le", destination,
    )


def short_synthesis_candidate_score(candidate):
    diagnostic = candidate["diagnostic"]
    cer = diagnostic.get("cer")
    return (
        float(cer) if cer is not None else 0.35,
        float(diagnostic.get("durationRatio") or 1.0),
        float(diagnostic.get("timingExtensionSeconds") or 0.0),
        float(diagnostic.get("generatedDuration") or 0.0),
        int(diagnostic.get("attempts") or 0),
    )


def plan_v5_flexible_tail(cue, generated_duration, render_duration=None):
    start, end = float(cue["start"]), float(cue["end"])
    generated_duration = float(generated_duration)
    if not all(math.isfinite(value) for value in (start, end, generated_duration)) or end <= start or generated_duration <= 0:
        raise DubbingInputQualityError("Durée vocale V5 invalide : début, fin et synthèse doivent être exploitables.")
    original_duration = end - start
    fitted_duration = max(original_duration, generated_duration / 1.5)
    fitted_end = start + fitted_duration
    return {
        "cue": {**cue, "end": fitted_end},
        "fittedDuration": fitted_duration,
        "acceleration": generated_duration / fitted_duration,
        "extensionSeconds": max(0.0, fitted_end - end),
        "blockedByMediaEnd": render_duration is not None and fitted_end > float(render_duration) + 1e-6,
    }


def clear_failure_audio(workspace):
    for attempt in range(1, 4):
        (workspace / f"quality-attempt-{attempt}.wav").unlink(missing_ok=True)


def preserve_rejected_audio(source, workspace, attempt, duration):
    name = f"quality-attempt-{attempt + 1}.wav"
    destination = workspace / name
    try:
        run("ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", source,
            "-t", "15", "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", destination)
        return {"file": name, "complete": duration <= 15, "maxSeconds": 15}
    except Exception as error:
        destination.unlink(missing_ok=True)
        log(f"Conservation de l'audio rejeté impossible: {error}")
        return {"error": "audio-capture-failed"}


def synthesize_cues_v5(
    model,
    quality_model,
    cues,
    language,
    references,
    workspace,
    profile_checksum,
    profile=V5_ALIGNED_QUALITY_PROFILE,
    render_duration=None,
):
    """Synthèse figée du profil historique sami-dubbing-v5-aligned-quality."""
    keep_failure_audio = profile in TRANSLATED_V5_PROFILES
    quality_report = {
        "schemaVersion": 1,
        "utteranceCount": len(cues),
        "retriedCount": 0,
        "validatedCount": 0,
        "warnings": [],
    }
    for index, cue in enumerate(cues):
        rejected_attempts = []
        if keep_failure_audio:
            clear_failure_audio(workspace)
        if cue.get("translationBoundaryReview"):
            quality_report["warnings"].append({
                "sourceStart": cue["sourceStart"], "speaker": cue["speaker"],
                "expected": cue["text"][:500], "severity": "warning",
                "translationBoundaryReview": cue["translationBoundaryReview"],
            })
        fitted_path = workspace / f"cue-{index:04d}.wav"
        target_duration = cue["end"] - cue["start"]
        accepted = None
        last_diagnostic = None
        short_candidates = []
        japanese_quality = japanese_identity_enabled(profile, language)
        short_quality = (
            not japanese_quality
            and
            v5_short_quality_profile(profile)
            and len(profile_speech_lexical_units(cue["text"], profile)) <= 4
        )
        for attempt in range(3):
            raw_path = workspace / f"cue-{index:04d}-raw-{attempt}.wav"
            seed = seed_synthesis(
                cue,
                profile_checksum,
                attempt,
                profile=profile,
            )
            log(
                f"Synthèse V5 {index + 1}/{len(cues)} ({cue['start']:.2f}s, "
                f"tentative {attempt + 1}, seed {seed})."
            )
            try:
                waveform, sample_rate = generate_voice(
                    model,
                    cue["text"],
                    language,
                    cue["speaker"],
                    references[cue["speaker"]],
                    attempt=attempt,
                    profile=profile,
                    **({"watch_context": {"workspace": workspace, "source_start": cue["sourceStart"], "seed": seed,
                        "cue_index": index + 1, "cue_count": len(cues), "attempt": attempt + 1,
                        "kind": "cue", "progress": 52 + round(index / len(cues) * 34)}}
                       if profile in BOUNDED_V5_PROFILES else {}),
                )
            except DubbingGenerationLimitError as error:
                report = load_json(workspace / "generation-attempt.json")
                quality_report.setdefault("generationLimitAttempts", []).append({
                    "sourceStart": cue["sourceStart"], "speaker": cue["speaker"],
                    "attempt": attempt + 1, "message": str(error),
                    "internalStages": report.get("internalStages", []),
                })
                write_json(workspace / "quality-failure.json", {
                    "schemaVersion": 1, "pipelineVersion": profile, "cue": cue,
                    "diagnostic": {"generationLimit": True, "attempts": attempt + 1},
                    "qualityReport": quality_report,
                })
                if attempt == 2:
                    raise
                if attempt == 0:
                    quality_report["retriedCount"] += 1
                log(f"Fin Qwen absente à {cue['sourceStart']:.2f}s ; nouvelle tentative bornée {attempt + 2}/3.")
                continue
            save_generated_audio(waveform, sample_rate, raw_path)
            generated_duration = media_duration(raw_path)
            timing = plan_v5_flexible_tail(cue, generated_duration, render_duration) if flexible_v5_profile(profile) else None
            factor = generated_duration / target_duration
            suspicious = (
                factor > 1.2
                and len(normalized_speech_text(cue["text"])) >= 4
            ) or japanese_quality
            recognized = ""
            cer = None
            if suspicious:
                with observe_voice_activity("quality", progress=52 + round(index / len(cues) * 34),
                    speaker=cue["speaker"], source_start=cue["sourceStart"],
                    cue_index=index + 1, cue_count=len(cues), attempt=attempt + 1):
                    recognized = transcribe_quality(quality_model, raw_path, language)
                cer = character_error_rate(cue["text"], recognized)
                quality_report["validatedCount"] += 1
            acoustic_evidence = generated_audio_activity(raw_path) if short_quality or japanese_quality else None
            japanese_decision = japanese_quality_decision(cue["text"], recognized, generated_duration, acoustic_evidence) if japanese_quality else None
            if japanese_decision is not None:
                cer = japanese_decision["cer"]
            last_diagnostic = {
                "sourceStart": round(float(cue["sourceStart"]), 3),
                "speaker": cue["speaker"],
                "expected": cue["text"][:500],
                "recognized": recognized[:500],
                "durationRatio": round(factor, 3),
                "targetDuration": round(target_duration, 6),
                "generatedDuration": round(generated_duration, 6),
                "attempts": attempt + 1,
                "cer": round(cer, 3) if cer is not None else None,
            }
            if japanese_decision is not None:
                last_diagnostic.update(japanese_decision)
            transcript_decision = transcript_quality_decision(
                cue["text"], recognized, cer, attempt,
                generated_duration=generated_duration,
                acoustic_evidence=acoustic_evidence,
                lexical_unit_parser=lambda value: profile_speech_lexical_units(value, profile),
            ) if short_quality else None
            if transcript_decision:
                strict_expansion = transcript_decision["recognizedLexicalUnitCount"] > max(
                    transcript_decision["lexicalUnitCount"] * 2,
                    transcript_decision["lexicalUnitCount"] + 2,
                )
                last_diagnostic.update({
                    "shortUtterance": True,
                    "lexicalUnitCount": transcript_decision["lexicalUnitCount"],
                    "recognizedLexicalUnitCount": transcript_decision["recognizedLexicalUnitCount"],
                    "excessiveAsrExpansion": strict_expansion,
                    "qualityAsrUnreliable": transcript_decision["asrUnreliable"],
                    "acousticSpeechPresent": transcript_decision["acousticSpeechPresent"],
                    "acousticEvidence": acoustic_evidence,
                })
            if timing is not None:
                next_cue = cues[index + 1] if index + 1 < len(cues) else None
                overlap = max(0.0, min(timing["cue"]["end"], next_cue["end"]) - max(cue["end"], next_cue["start"])) if next_cue else 0.0
                last_diagnostic.update({
                    "originalDurationRatio": round(factor, 3),
                    "durationRatio": round(timing["acceleration"], 3),
                    "fittedDuration": round(timing["fittedDuration"], 6),
                    "timingExtensionSeconds": round(timing["extensionSeconds"], 6),
                    "timingOverlapSeconds": round(overlap, 6),
                    "blockedByMediaEnd": timing["blockedByMediaEnd"],
                })
            duration_accepted = not timing["blockedByMediaEnd"] if timing is not None else factor <= 1.5
            short_candidate = bool(
                short_quality
                and duration_accepted
                and transcript_decision["acousticSpeechPresent"]
                and not transcript_decision["blocking"]
                and not (
                    strict_expansion
                    and not transcript_decision["recognitionPhysicallyImpossible"]
                )
            )
            if japanese_decision is not None:
                short_candidate = duration_accepted and japanese_decision["reviewCandidate"]
            if short_candidate and cer is not None and cer > 0.35:
                short_candidates.append({
                    "path": raw_path,
                    "timing": timing,
                    "factor": timing["acceleration"] if timing else factor,
                    "diagnostic": last_diagnostic,
                })
            elif duration_accepted and (cer is None or cer <= 0.35) and (japanese_decision is None or japanese_decision["confirmed"]):
                accepted = (raw_path, timing["acceleration"] if timing else factor, timing)
                if (cer is not None and cer > 0.2) or (timing and timing["extensionSeconds"] > 0):
                    quality_report["warnings"].append({
                        **last_diagnostic,
                        "severity": "warning",
                    })
                if timing and timing["extensionSeconds"] > 0:
                    log(f"Fin V5 R3 prolongée de {timing['extensionSeconds']:.3f}s à {cue['sourceStart']:.3f}s "
                        f"({cue['speaker']}, départ inchangé, {timing['acceleration']:.2f}×).")
                break
            if keep_failure_audio:
                rejected_attempts.append({**last_diagnostic, "audio": preserve_rejected_audio(
                    raw_path, workspace, attempt, generated_duration,
                )})
            if not (short_candidate and cer is not None and cer > 0.35):
                raw_path.unlink(missing_ok=True)
            if attempt == 0:
                quality_report["retriedCount"] += 1
        if accepted is None and short_candidates:
            selected = min(short_candidates, key=short_synthesis_candidate_score)
            accepted = (selected["path"], selected["factor"], selected["timing"])
            for candidate in short_candidates:
                if candidate["path"] != selected["path"]:
                    candidate["path"].unlink(missing_ok=True)
            last_diagnostic = selected["diagnostic"]
            quality_report["warnings"].append({
                **last_diagnostic,
                "severity": "warning",
                "selectedBestShortAttempt": True,
                "shortCerMismatchAccepted": True,
                "candidateAttempts": len(short_candidates),
            })
            log(
                f"CER court V5 non bloquant à {cue['sourceStart']:.2f}s "
                f"({cue['speaker']}, meilleure tentative {last_diagnostic['attempts']}/3, "
                f"CER {last_diagnostic['cer']})."
            )
        if accepted is None:
            try:
                write_json(workspace / "quality-failure.json", {
                    "schemaVersion": 1,
                    "pipelineVersion": profile,
                    "cue": cue,
                    "diagnostic": last_diagnostic,
                    "qualityReport": quality_report,
                    **({"rejectedAttempts": rejected_attempts} if keep_failure_audio else {}),
                })
            except OSError as error:
                log(f"Conservation du diagnostic vocal impossible: {error}")
            raise DubbingInputQualityError(
                v5_quality_failure_message(cue, target_duration, generated_duration, last_diagnostic)
                if profile in {V5_JAPANESE_IDENTITY_PROFILE, *JAPANESE_BOUNDED_PROFILES} else
                "Contrôle vocal V5 bloquant à "
                f"{cue['sourceStart']:.2f}s ({cue['speaker']}): "
                f"« {cue['text']} » dispose de {target_duration:.3f}s, "
                f"la synthèse dure {generated_duration:.3f}s, "
                f"ratio {last_diagnostic['durationRatio']}, "
                f"CER {last_diagnostic['cer']}."
                + (" La fin minimale dépasserait la fin de la vidéo source." if last_diagnostic.get("blockedByMediaEnd") else "")
            )
        raw_path, factor, timing = accepted
        if keep_failure_audio:
            clear_failure_audio(workspace)
        fitted_duration = timing["fittedDuration"] if timing else target_duration
        duration_text = f"{fitted_duration:.6f}" if timing else f"{fitted_duration:.3f}"
        filters = (
            f"{atempo_chain(factor)},apad=pad_dur={duration_text},"
            f"atrim=0:{duration_text},aresample=48000"
        )
        with observe_voice_activity("fitting", progress=52 + round(index / len(cues) * 34),
            speaker=cue["speaker"], source_start=cue["sourceStart"],
            cue_index=index + 1, cue_count=len(cues), attempt=last_diagnostic["attempts"]):
            run(
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", raw_path,
                "-filter:a", filters, "-ac", "1", "-ar", "48000", "-c:a", "pcm_f32le",
                fitted_path,
            )
        raw_path.unlink(missing_ok=True)
        if profile in JAPANESE_BOUNDED_PROFILES:
            (workspace / "quality-failure.json").unlink(missing_ok=True)
        yield timing["cue"] if timing else cue, fitted_path, quality_report


def synthesize_cues(
    model,
    quality_model,
    cues,
    language,
    references,
    workspace,
    profile_checksum,
    render_duration=None,
    profile=V6_CLEAN_PHRASES_R9_R1_PROFILE,
):
    if is_v5_profile(profile):
        yield from synthesize_cues_v5(
            model,
            quality_model,
            cues,
            language,
            references,
            workspace,
            profile_checksum,
            profile=profile,
            render_duration=render_duration,
        )
        return
    quality_report = {
        "schemaVersion": 1,
        "utteranceCount": len(cues),
        "retriedCount": 0,
        "validatedCount": 0,
        "warnings": [],
    }
    for index, cue in enumerate(cues):
        fitted_path = workspace / f"cue-{index:04d}.wav"
        target_duration = cue["end"] - cue["start"]
        accepted = None
        last_diagnostic = None
        short_candidates = []
        for attempt in range(3):
            raw_path = workspace / f"cue-{index:04d}-raw-{attempt}.wav"
            untrimmed_path = workspace / f"cue-{index:04d}-untrimmed-{attempt}.wav"
            seed = seed_synthesis(cue, profile_checksum, attempt)
            log(
                f"Synthèse {index + 1}/{len(cues)} ({cue['start']:.2f}s, "
                f"tentative {attempt + 1}, seed {seed})."
            )
            waveform, sample_rate = generate_voice(
                model, cue["text"], language, cue["speaker"],
                references[cue["speaker"]], attempt=attempt,
                profile=profile,
            )
            save_generated_audio(waveform, sample_rate, untrimmed_path)
            trim_generated_silence(untrimmed_path, raw_path)
            untrimmed_path.unlink(missing_ok=True)
            generated_duration = media_duration(raw_path)
            acoustic_evidence = generated_audio_activity(raw_path)
            original_factor = generated_duration / target_duration
            timing = plan_synthesis_timing(cue, generated_duration, render_duration)
            factor = timing["acceleration"]
            normalized_expected = normalized_speech_text(cue["text"])
            requires_transcript_check = len(normalized_expected) >= 4
            recognized = ""
            cer = None
            if requires_transcript_check:
                recognized = transcribe_quality(quality_model, raw_path, language)
                cer = character_error_rate(cue["text"], recognized)
                quality_report["validatedCount"] += 1
            last_diagnostic = {
                "sourceStart": round(float(cue["sourceStart"]), 3),
                "speaker": cue["speaker"],
                "expected": cue["text"][:500],
                "recognized": recognized[:500],
                "generatedDuration": round(generated_duration, 3),
                "durationRatio": round(factor, 3),
                "originalDurationRatio": round(original_factor, 3),
                "timingExtensionSeconds": round(timing["spilloverSeconds"], 3),
                "timingBoundaryTrimSeconds": round(timing["boundaryTrimSeconds"], 3),
                "attempts": attempt + 1,
                "cer": round(cer, 3) if cer is not None else None,
            }
            transcript_decision = transcript_quality_decision(
                cue["text"],
                recognized,
                cer,
                attempt,
                generated_duration=generated_duration,
                acoustic_evidence=acoustic_evidence,
            )
            last_diagnostic.update({
                "shortUtterance": transcript_decision["shortUtterance"],
                "excessiveAsrExpansion": transcript_decision["excessiveExpansion"],
                "qualityAsrUnreliable": transcript_decision["asrUnreliable"],
                "acousticSpeechPresent": transcript_decision["acousticSpeechPresent"],
                "acousticEvidence": acoustic_evidence,
                "acousticWordCapacity": transcript_decision["acousticWordCapacity"],
                "acousticCharacterCapacity": transcript_decision[
                    "acousticCharacterCapacity"
                ],
            })
            timing_accepted = factor <= MAX_SYNTHESIS_ACCELERATION + 1e-6
            if (
                transcript_decision["shortUtterance"]
                and timing_accepted
                and not transcript_decision["blocking"]
                and transcript_decision["acousticSpeechPresent"]
            ):
                short_candidates.append({
                    "path": raw_path,
                    "timing": timing,
                    "generatedDuration": generated_duration,
                    "diagnostic": last_diagnostic,
                })
            elif (
                factor <= MAX_SYNTHESIS_ACCELERATION + 1e-6
                and transcript_decision["accepted"]
            ):
                accepted = (raw_path, timing, generated_duration, last_diagnostic)
                if (
                    timing["spilloverSeconds"] > 0
                    or timing["boundaryTrimSeconds"] > 0
                    or (cer is not None and cer > 0.2)
                ):
                    quality_report["warnings"].append({**last_diagnostic, "severity": "warning"})
                break
            else:
                raw_path.unlink(missing_ok=True)
            if attempt == 0:
                quality_report["retriedCount"] += 1
        if accepted is None and short_candidates:
            selected_candidate = min(
                short_candidates, key=short_synthesis_candidate_score
            )
            accepted = (
                selected_candidate["path"],
                selected_candidate["timing"],
                selected_candidate["generatedDuration"],
                selected_candidate["diagnostic"],
            )
            for candidate in short_candidates:
                if candidate["path"] != selected_candidate["path"]:
                    candidate["path"].unlink(missing_ok=True)
            selected_diagnostic = selected_candidate["diagnostic"]
            if (
                selected_candidate["timing"]["spilloverSeconds"] > 0
                or selected_candidate["timing"]["boundaryTrimSeconds"] > 0
                or (
                    selected_diagnostic.get("cer") is not None
                    and selected_diagnostic["cer"] > 0.2
                )
            ):
                quality_report["warnings"].append({
                    **selected_diagnostic,
                    "severity": "warning",
                    "selectedBestShortAttempt": True,
                })
        if accepted is None:
            target_duration = cue["end"] - cue["start"]
            generated_duration = last_diagnostic["generatedDuration"]
            subtitle_duration = (
                float((cue.get("voiceTiming") or {}).get("subtitleEnd", cue["end"]))
                - float((cue.get("voiceTiming") or {}).get("subtitleStart", cue["start"]))
            )
            raise DubbingInputQualityError(
                "Contrôle vocal bloquant à "
                f"{cue['sourceStart']:.2f}s ({cue['speaker']}): "
                f"« {cue['text'][:120]} » dispose d'une fenêtre vocale planifiée de "
                f"{target_duration:.3f}s (sous-titre {subtitle_duration:.3f}s), "
                f"la synthèse dure environ {generated_duration:.3f}s "
                f"(ratio initial {last_diagnostic['originalDurationRatio']}, "
                f"ratio après marge {last_diagnostic['durationRatio']}, "
                f"CER {last_diagnostic['cer']})."
            )
        raw_path, timing, generated_duration, last_diagnostic = accepted
        fitted_cue = timing["cue"]
        factor = timing["acceleration"]
        fitted_duration = timing["fittedDuration"]
        filters = synthesis_fit_filter(factor, generated_duration, fitted_duration)
        run(
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", raw_path,
            "-filter:a", filters, "-ac", "1", "-ar", "48000", "-c:a", "pcm_f32le",
            fitted_path,
        )
        raw_path.unlink(missing_ok=True)
        yield fitted_cue, fitted_path, quality_report


def validate_synthesis_cues(cues, min_seconds=MIN_SYNTHESIS_INPUT_SECONDS):
    for cue in cues:
        duration = float(cue["end"]) - float(cue["start"])
        if duration < min_seconds and normalized_speech_text(cue.get("text")):
            raise DubbingInputQualityError(
                "Découpage vocal impossible à "
                f"{float(cue.get('sourceStart', cue['start'])):.2f}s ({cue['speaker']}): "
                f"« {cue['text'][:120]} » ne dispose d'aucune fenêtre audio exploitable "
                f"({duration:.3f}s). Vérifiez le changement d'intervenant et les "
                "horodatages mot à mot avant de relancer l'analyse."
            )


def select_bounded_voice_sample(candidates):
    # Keep complete subtitle/dialogue units: never cut a word or invent a timed
    # fragment. These bounds affect the audition text, not the manual reference.
    eligible = [cue for cue in candidates if 0 < cue["end"] - cue["start"] <= 8
                and 0 < len(cue["text"].strip()) <= 120]
    if not eligible:
        raise DubbingInputQualityError("Aucune réplique entière assez courte pour l'échantillon vocal (8 s source et 120 caractères maximum). Révisez le découpage du texte ; les références manuelles sont conservées.")
    return min(eligible, key=lambda cue: (
        bool(cue.get("translationBoundaryReview")),
        abs(cue["end"] - cue["start"] - 4),
        len(cue["text"]), cue["start"],
    ))


def synthesize_voice_samples(
    model,
    cues,
    language,
    references,
    workspace,
    profile_checksum,
    speakers=None,
    profile=V6_CLEAN_PHRASES_R9_R1_PROFILE,
):
    samples_root = workspace / "voice-samples"
    samples_root.mkdir(parents=True, exist_ok=True)
    grouped = {}
    for cue in cues:
        grouped.setdefault(cue["speaker"], []).append(cue)
    samples = []
    ordered_speakers = sorted(
        str(speaker) for speaker in (speakers if speakers is not None else references)
    )
    if any(speaker not in references for speaker in ordered_speakers):
        raise RuntimeError("Un profil vocal ciblé est absent des références chargées.")
    for sample_index, speaker in enumerate(ordered_speakers, start=1):
        report_progress(
            48 + round((sample_index / len(ordered_speakers)) * 4),
            "SYNTHESIZING_VOICE_SAMPLES",
        )
        candidates = grouped.get(speaker) or []
        if not candidates:
            raise RuntimeError(f"Aucune réplique ne permet de contrôler la voix {speaker}.")
        cue = select_bounded_voice_sample(candidates) if profile in BOUNDED_V5_PROFILES else max(
            candidates,
            key=lambda item: (
                min(item["end"] - item["start"], 8.0),
                min(len(item["text"]), 160),
            ),
        )
        safe_speaker = re.sub(r"[^A-Za-z0-9_-]+", "_", speaker).strip("_") or "speaker"
        raw_path = samples_root / f"{safe_speaker}-raw.wav"
        sample_path = samples_root / f"{safe_speaker}.wav"
        seed = seed_synthesis(cue, profile_checksum, profile=profile)
        log(f"Échantillon de validation {speaker} à {cue['sourceStart']:.2f}s (seed {seed}).")
        waveform, sample_rate = generate_voice(
            model,
            cue["text"],
            language,
            speaker,
            references[speaker],
            profile=profile,
            **({"watch_context": {"workspace": workspace, "source_start": cue["sourceStart"], "seed": seed,
                "kind": "sample", "progress": 48 + round(sample_index / len(ordered_speakers) * 4)}}
               if profile in BOUNDED_V5_PROFILES else {}),
        )
        save_generated_audio(waveform, sample_rate, raw_path)
        if profile in BOUNDED_V5_PROFILES:
            generated_duration = media_duration(raw_path)
            if generated_duration > 20:
                diagnostic = load_json(workspace / "generation-attempt.json")
                diagnostic.update({"state": "rejected-too-long", "generatedDuration": generated_duration,
                    "audio": preserve_rejected_audio(raw_path, workspace, 0, generated_duration)})
                write_json(workspace / "generation-attempt.json", diagnostic)
                raise DubbingInputQualityError(f"Échantillon {speaker} excessif : {generated_duration:.2f}s pour un texte court. Audio refusé, sans troncature ni validation automatique.")
            confidence = guarded_voice_operation(lambda: watermark_audio(raw_path, sample_path),
                workspace=workspace, profile=profile, speaker=speaker, source_start=cue["sourceStart"],
                text=cue["text"], language=language, kind="watermark",
                progress=48 + round(sample_index / len(ordered_speakers) * 4),
                details={"generatedDuration": generated_duration})
        else:
            confidence = watermark_audio(raw_path, sample_path)
        raw_path.unlink(missing_ok=True)
        samples.append({
            "speaker": speaker,
            "sourceStart": float(cue["sourceStart"]),
            "text": cue["text"],
            "audioPath": str(sample_path),
            "watermarkConfidence": confidence,
        })
    return samples


def assemble_dialogue(cues, destination, duration):
    import numpy as np
    import soundfile as sf

    sample_rate = 48000
    dialogue = np.zeros(max(1, round(duration * sample_rate)), dtype=np.float32)
    for cue, cue_path in cues:
        audio, actual_rate = sf.read(cue_path, dtype="float32", always_2d=False)
        if actual_rate != sample_rate:
            raise RuntimeError(f"Segment vocal à {actual_rate} Hz au lieu de {sample_rate} Hz.")
        if audio.ndim > 1:
            audio = np.mean(audio, axis=1)
        start = max(0, round(cue["start"] * sample_rate))
        end = min(dialogue.size, start + audio.size)
        if end > start:
            dialogue[start:end] += audio[:end - start]
    sf.write(destination, dialogue, sample_rate, subtype="FLOAT")


def assemble_speaker_stems(cues, destination_root, duration):
    import numpy as np
    import soundfile as sf

    sample_rate = 48000
    destination_root.mkdir(parents=True, exist_ok=True)
    grouped = {}
    for cue, cue_path in cues:
        grouped.setdefault(cue["speaker"], []).append((cue, cue_path))
    stems = {}
    for speaker, speaker_cues in sorted(grouped.items()):
        audio_track = np.zeros(max(1, round(duration * sample_rate)), dtype=np.float32)
        for cue, cue_path in speaker_cues:
            audio, actual_rate = sf.read(cue_path, dtype="float32", always_2d=False)
            if actual_rate != sample_rate:
                raise RuntimeError(f"Segment vocal à {actual_rate} Hz au lieu de {sample_rate} Hz.")
            if audio.ndim > 1:
                audio = np.mean(audio, axis=1)
            start = max(0, round(cue["start"] * sample_rate))
            end = min(audio_track.size, start + audio.size)
            if end > start:
                audio_track[start:end] += audio[:end - start]
        safe_speaker = re.sub(r"[^A-Za-z0-9_-]+", "_", speaker).strip("_") or "speaker"
        destination = destination_root / f"{safe_speaker}.wav"
        sf.write(destination, audio_track, sample_rate, subtype="FLOAT")
        stems[speaker] = destination
    return stems


def combine_speaker_stems(stems, destination, duration):
    import numpy as np
    import soundfile as sf

    sample_rate = 48000
    dialogue = np.zeros(max(1, round(duration * sample_rate)), dtype=np.float32)
    for speaker, stem_path in sorted(stems.items()):
        audio, actual_rate = sf.read(stem_path, dtype="float32", always_2d=False)
        if actual_rate != sample_rate:
            raise RuntimeError(f"Stem {speaker} à {actual_rate} Hz au lieu de {sample_rate} Hz.")
        if audio.ndim > 1:
            audio = np.mean(audio, axis=1)
        end = min(dialogue.size, audio.size)
        dialogue[:end] += audio[:end]
    sf.write(destination, dialogue, sample_rate, subtype="FLOAT")


def ducking_filter(cues):
    filters = []
    for cue, _ in cues:
        filters.append(
            f"volume=0.18:enable='between(t,{cue['start']:.3f},{cue['end']:.3f})'"
        )
    return ",".join(filters) if filters else "anull"


def mix_audio(background, dialogue, destination, duration, separated, cues):
    base_filter = "anull" if separated else ducking_filter(cues)
    run(
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-i", background, "-i", dialogue,
        "-filter_complex",
        f"[0:a]{base_filter},aresample=48000[base];"
        f"[base][1:a]amix=inputs=2:duration=first:normalize=0,"
        f"alimiter=limit=0.96[mix]",
        "-map", "[mix]", "-ac", "1", "-ar", "48000", "-c:a", "pcm_f32le",
        "-t", f"{duration:.3f}",
        destination,
    )


def watermark_audio(source, destination):
    import numpy as np
    import perth
    import soundfile as sf

    audio, sample_rate = sf.read(source, dtype="float32", always_2d=False)
    if audio.ndim > 1:
        audio = np.mean(audio, axis=1)
    watermarker = perth.PerthImplicitWatermarker(device="cpu")
    # Perth construit plusieurs représentations temps-fréquence intermédiaires. Sur une
    # piste de film complète, leur allocation en un seul bloc peut terminer brutalement
    # le processus sous Windows (0xC0000005). Le traitement par fenêtres borne la mémoire
    # tout en appliquant et en contrôlant le watermark sur l'intégralité de la piste.
    chunk_samples = max(sample_rate, int(sample_rate * 20))
    watermarked = np.empty_like(audio)
    confidence_sum = 0.0
    confidence_weight = 0
    for start in range(0, len(audio), chunk_samples):
        end = min(len(audio), start + chunk_samples)
        original = audio[start:end]
        original_length = len(original)
        if original_length < sample_rate:
            original = np.pad(original, (0, sample_rate - original_length))
        marked = np.asarray(
            watermarker.apply_watermark(original, sample_rate=sample_rate),
            dtype=np.float32,
        ).reshape(-1)
        if len(marked) < original_length:
            marked = np.pad(marked, (0, original_length - len(marked)))
        detected = watermarker.get_watermark(
            marked,
            sample_rate=sample_rate,
            round=False,
        )
        chunk_confidence = float(np.mean(detected))
        if not math.isfinite(chunk_confidence) or chunk_confidence < 0.5:
            raise RuntimeError(
                f"Watermark Perth non détecté sur le bloc {start // chunk_samples + 1} "
                f"({chunk_confidence:.3f})."
            )
        watermarked[start:end] = marked[:original_length]
        confidence_sum += chunk_confidence * original_length
        confidence_weight += original_length
    confidence = confidence_sum / max(1, confidence_weight)
    if not math.isfinite(confidence) or confidence < 0.5:
        raise RuntimeError(f"Watermark Perth non détecté ({confidence:.3f}).")
    sf.write(destination, watermarked, sample_rate, subtype="PCM_16")
    return confidence


def install_manifest(root):
    manifest_path = Path(root) / "install.json"
    if not manifest_path.is_file():
        raise RuntimeError("Manifeste d'installation du doublage IA absent.")
    return load_json(manifest_path)


def probe(root):
    result = {"ready": False, "root": str(root), "components": {}}
    try:
        import platform
        import torch
        import perth  # noqa: F401
        import soundfile  # noqa: F401

        install = install_manifest(root)
        engine = str(install.get("voiceEngine") or "chatterbox").lower()
        voice = install.get("models", {}).get("voice") or install.get("models", {}).get("chatterbox") or {}
        voice_path = Path(str(voice.get("path") or ""))
        if engine == "qwen3-tts":
            import qwen_tts  # noqa: F401
        else:
            import chatterbox  # noqa: F401
        bandit = install["models"].get("bandit")
        quality = install["models"].get("quality") or {}
        quality_path = Path(str(quality.get("path") or ""))
        import faster_whisper  # noqa: F401
        result["components"]["quality"] = {
            "ready": quality_path.is_dir(),
            "model": quality.get("repo"),
            "revision": quality.get("revision"),
            "offline": True,
        }
        result["components"]["voice"] = {
            "ready": voice_path.is_dir() and (engine != "qwen3-tts" or torch.cuda.is_available() or torch.backends.mps.is_available()),
            "engine": engine,
            "model": voice.get("repo"),
            "revision": voice.get("revision"),
            "device": "cuda" if torch.cuda.is_available() else ("mps" if torch.backends.mps.is_available() else "cpu"),
        }
        if bandit:
            from bandit_infer import BanditSession  # noqa: F401
            if not torch.cuda.is_available():
                import mlx.core  # noqa: F401

            checkpoint = Path(bandit["path"])
            result["components"]["separation"] = {
                "ready": checkpoint.is_file() and digest(checkpoint) == bandit["sha256"],
                "model": "bandit-v2-multi",
                "license": bandit.get("license"),
            }
        else:
            result["components"]["separation"] = {"ready": False, "mode": "ducking"}
        result["components"]["diarization"] = {
            "ready": False,
            "mode": "single-speaker-test",
            "requiresUserHuggingFaceAcceptance": True,
        }
        diarization = install.get("models", {}).get("diarization")
        if diarization:
            diarization_python = Path(str(install.get("diarizationPythonPath") or ""))
            diarization_script = Path(str(install.get("diarizationScript") or ""))
            diarization_model = Path(str(diarization.get("path") or ""))
            if diarization_python.is_file() and diarization_script.is_file() and diarization_model.is_dir():
                diarization_probe = json.loads(run(
                    diarization_python,
                    diarization_script,
                    "--model", diarization_model,
                    "--integrity-json", json.dumps(diarization.get("files") or {}),
                    "--probe",
                    capture=True,
                ).splitlines()[-1])
                result["components"]["diarization"] = {
                    **diarization_probe,
                    "ready": bool(diarization_probe.get("ready")),
                    "license": diarization.get("license"),
                }
        sortformer = install.get("models", {}).get("sortformer")
        if sortformer:
            sortformer_model_path = sortformer.get("hostPath") or sortformer.get("path")
            command = sortformer_command(install, [
                "--model", sortformer_model_path,
                "--sha256", sortformer.get("sha256"),
                "--probe",
            ])
            sortformer_probe = json.loads(run(*command, capture=True).splitlines()[-1])
            result["components"]["sortformer"] = {
                **sortformer_probe,
                "ready": bool(sortformer_probe.get("ready")),
                "license": sortformer.get("license"),
                "nonCommercialOnly": sortformer.get("nonCommercialOnly") is True,
            }
        else:
            result["components"]["sortformer"] = {
                "ready": False,
                "model": "nvidia/diar_sortformer_4spk-v1",
            }
        result["platform"] = platform.machine()
        result["torchVersion"] = torch.__version__
        result["voiceEngine"] = engine
        result["voiceModel"] = voice.get("repo")
        result["voiceModelRevision"] = voice.get("revision")
        result["device"] = result["components"]["voice"]["device"]
        result["ready"] = result["components"]["voice"]["ready"]
        result["ready"] = result["ready"] and result["components"]["quality"]["ready"]
        if install.get("separationRequired", True):
            result["ready"] = result["ready"] and result["components"]["separation"]["ready"]
        if install.get("diarizationRequired", False):
            result["ready"] = result["ready"] and result["components"]["diarization"]["ready"]
        configured_profile = resolve_dubbing_profile(
            os.environ.get("SAMI_AI_DUBBING_PIPELINE_VERSION")
            or V6_CLEAN_PHRASES_R9_R1_PROFILE
        )
        if install.get("hybridDiarizationRequired", False) and not is_v5_profile(configured_profile):
            result["ready"] = result["ready"] and result["components"]["sortformer"]["ready"]
        if not is_v5_profile(configured_profile):
            result["ready"] = result["ready"] and result["components"]["sortformer"]["ready"]
            result["ready"] = result["ready"] and result["components"]["diarization"]["ready"]
            if not result["components"]["sortformer"]["ready"]:
                result["error"] = "Le pipeline V6 configuré exige le modèle Sortformer local (CUDA ou CPU sur Mac). Exécutez npm run setup:ai-dubbing:sortformer."
            elif not result["components"]["diarization"]["ready"]:
                result["error"] = "Le pipeline V6 configuré exige Pyannote Community-1 local. Exécutez npm run setup:ai-dubbing:diarization."
    except Exception as error:
        result["error"] = str(error)
    return result


def smoke_test(root):
    import numpy as np
    import soundfile as sf

    install = install_manifest(root)
    if str(install.get("voiceEngine") or "chatterbox").lower() == "qwen3-tts":
        raise RuntimeError("Le smoke test Qwen3-TTS nécessite une référence vocale et doit passer par un aperçu SAMI.")
    model = load_voice_model(install)
    sample = Path(root) / "smoke-test-fr.wav"
    waveform = model["model"].generate(
        "Ceci est un test local du doublage synthétique de SAMI.", language_id="fr"
    )
    temporary = sample.with_name("smoke-test-fr-raw.wav")
    save_generated_audio(waveform, model["model"].sr, temporary)
    confidence = watermark_audio(temporary, sample)
    bandit = install.get("models", {}).get("bandit")
    separation = False
    if bandit:
        from bandit_infer import BanditSession
        silence = np.zeros((2, 48000), dtype=np.float32)
        import torch
        with BanditSession(
            "v2-multi", backend="torch" if torch.cuda.is_available() else "mlx",
            device="cuda" if torch.cuda.is_available() else "mps",
            checkpoint_path=Path(bandit["path"]),
            checkpoint_sha256=bandit["sha256"],
        ) as session:
            stems = session.infer(silence, sample_rate=48000)
        separation = set(stems) == {"speech", "music", "effects"}
    if temporary.exists():
        temporary.unlink()
    return {
        "ready": confidence >= 0.5 and (separation or not bandit),
        "sample": str(sample),
        "watermarkConfidence": confidence,
        "bandit": separation,
        "sampleRate": int(sf.info(sample).samplerate),
    }


def process(phase, input_path, output_path, root):
    if os.environ.get("HF_HUB_OFFLINE", "").lower() not in OFFLINE_VALUES:
        raise RuntimeError("Le runtime doit être exécuté avec Hugging Face hors ligne.")
    if os.environ.get("TRANSFORMERS_OFFLINE", "").lower() not in OFFLINE_VALUES:
        raise RuntimeError("Le runtime doit être exécuté avec Transformers hors ligne.")
    payload = load_json(input_path)
    if payload.get("schemaVersion") not in {1, 2, 3, 4} or payload.get("phase") != phase:
        raise ValueError("Contrat de tâche de doublage invalide.")
    if payload.get("requirements", {}).get("localOnly") is not True:
        raise ValueError("La garantie de traitement local est obligatoire.")
    language = str(payload.get("targetLanguage") or "").lower()
    if language not in SUPPORTED_LANGUAGES:
        raise ValueError("Langue de doublage non prise en charge.")
    expected_speaker_count = payload.get("expectedSpeakerCount")
    if expected_speaker_count is not None:
        if isinstance(expected_speaker_count, bool):
            raise ValueError("Le nombre d'intervenants attendu est invalide.")
        expected_speaker_count = int(expected_speaker_count)
        if expected_speaker_count < 1 or expected_speaker_count > 30:
            raise ValueError("Le nombre d'intervenants attendu est invalide.")
    rejected_voice_references = payload.get("rejectedVoiceReferences") or []
    if not isinstance(rejected_voice_references, list) or len(rejected_voice_references) > 100:
        raise ValueError("La liste des références vocales rejetées est invalide.")
    for rejected in rejected_voice_references:
        if not isinstance(rejected, dict):
            raise ValueError("Une référence vocale rejetée est invalide.")
        try:
            rejected_start = float(rejected.get("sourceStart"))
            rejected_end = float(rejected.get("sourceEnd"))
        except (TypeError, ValueError) as error:
            raise ValueError("Une référence vocale rejetée est invalide.") from error
        if rejected_start < 0 or rejected_end <= rejected_start:
            raise ValueError("Une référence vocale rejetée est invalide.")
    regeneration_target = str(payload.get("regenerationTarget") or "").strip()
    if regeneration_target and phase != "preview":
        raise ValueError("La régénération ciblée d'un profil est réservée à l'aperçu.")
    source = Path(payload["sourcePlaylist"]).resolve()
    subtitle = Path(payload["targetSubtitle"]).resolve()
    if not source.is_file() or not subtitle.is_file():
        raise FileNotFoundError("Source vidéo ou sous-titre cible absent.")

    workspace = Path(input_path).resolve().parent
    install = install_manifest(root)
    models = payload.get("models") or {}
    profile = resolve_dubbing_profile(models.get("pipeline"))
    expected_generation_config_hash = PROFILE_GENERATION_CONFIG_HASHES[profile]
    if payload.get("generationConfigHash") != expected_generation_config_hash:
        raise RuntimeError(
            f"L'empreinte de génération ne correspond pas au profil {profile}."
        )
    expected_identity = {
        "voiceEngine": str(models.get("voiceEngine") or "chatterbox"),
        "voiceModel": str(models.get("voiceModel") or ""),
        "voiceModelRevision": models.get("voiceModelRevision"),
    }
    installed_identity = {
        "voiceEngine": str(install.get("voiceEngine") or "chatterbox"),
        "voiceModel": str(install.get("voiceModel") or (install.get("models", {}).get("voice") or {}).get("repo") or ""),
        "voiceModelRevision": install.get("voiceModelRevision") or (install.get("models", {}).get("voice") or {}).get("revision"),
    }
    if any(expected_identity[key] != installed_identity[key] for key in expected_identity):
        raise RuntimeError("Le runtime local ne correspond pas au moteur, modèle et checkpoint attribués.")
    requested_diarization = str(models.get("diarization") or "")
    expected_diarization = (
        "pyannote-speaker-diarization-community-1"
        if is_v5_profile(profile)
        else "pyannote-speaker-diarization-community-1+nvidia-diar-sortformer-4spk-v1"
    )
    if requested_diarization != expected_diarization:
        raise RuntimeError(
            f"Le profil {profile} exige le modèle de diarisation "
            f"{expected_diarization}."
        )
    hybrid_required = not is_v5_profile(profile)
    if hybrid_required and (
        install.get("hybridDiarizationRequired") is not True
        or not install.get("models", {}).get("sortformer")
    ):
        raise RuntimeError("Le job V6 exige NVIDIA Sortformer, mais son runtime local est absent.")
    source_duration = media_duration(source)
    manual_references = validate_manual_references(payload.get("manualVoiceReferences"), expected_speaker_count, source_duration)
    if manual_references and profile not in {
        *TRANSLATED_V5_PROFILES,
        V5_GUIDED_REFERENCES_PROFILE, V5_GUIDED_REFERENCES_R4_R1_PROFILE,
        V5_GUIDED_REFERENCES_R4_R2_PROFILE,
    }:
        raise DubbingInputQualityError("Le profil attribué ne supporte pas les références guidées.")
    requested_duration = float(payload.get("previewDurationSeconds") or 45)
    duration = min(source_duration, requested_duration) if phase == "preview" else source_duration
    requested_start = (
        float(payload.get("previewStartSeconds") or 0.0)
        if phase == "preview" else 0.0
    )
    start_seconds = max(0.0, min(requested_start, source_duration - duration))
    all_cues = (
        parse_vtt(subtitle)
        if is_v5_profile(profile)
        else (
            parse_voice_script(payload.get("voiceScript"))
            if payload.get("voiceScript") is not None
            else parse_vtt(subtitle)
        )
    )
    source_audio = workspace / "source.wav"
    full_background = workspace / "background-full.wav"
    report_progress(3, "EXTRACTING")
    extract_source_audio(source, source_audio, source_duration)
    report_progress(8, "SEPARATING")

    separated = False
    reference_source = source_audio
    try:
        reference_source = separate_bandit(source_audio, full_background, install)
        separated = True
        log("Séparation BandIt terminée.")
    except Exception as error:
        if install.get("singleSpeakerFallback") is not True:
            raise
        log(f"BandIt indisponible, repli mono-locuteur avec ducking: {error}")
        full_background = source_audio

    profile_path = None
    profile_checksum = None
    diarization_metadata = {
        "model": "pyannote-speaker-diarization-community-1",
        "refinement": {"applied": False, "reason": "fallback"},
    }
    if phase == "preview" and regeneration_target:
        report_progress(38, "LOADING_LOCKED_VOICE_PROFILES")
        previous_profile_root = Path(str(payload.get("voiceProfilePath") or ""))
        profile_root = workspace / "voice-profile"
        all_cues, references, profile_path, profile_checksum = regenerate_single_voice_profile(
            profile_root,
            previous_profile_root,
            payload.get("voiceProfileChecksum"),
            source,
            subtitle,
            reference_source,
            payload.get("sourceTranscript"),
            regeneration_target,
            rejected_voice_references,
            payload.get("models", {}).get("pipeline"),
            models,
            payload.get("generationConfigHash"),
        )
        expected_profiles = expected_speaker_count or len(references)
        if len(references) != expected_profiles:
            raise RuntimeError(
                "La régénération ciblée n'a pas conservé tous les profils vocaux "
                f"({len(references)}/{expected_profiles})."
            )
    elif phase == "preview":
        report_progress(38, "DIARIZING")
        try:
            refinement_path = None
            sortformer_payload = None
            if hybrid_required:
                report_progress(34, "DIARIZING_SORTFORMER")
                refinement_path, sortformer_payload = run_sortformer(
                    source_audio,
                    install,
                    workspace,
                    source_duration,
                )
                log(
                    "Diarisation locale NVIDIA Sortformer terminée: "
                    f"{sortformer_payload.get('windowCount', 0)} fenêtre(s)."
                )
            raw_turns, diarization_metadata = run_diarization(
                source_audio,
                install,
                workspace,
                expected_speaker_count=expected_speaker_count,
                refinement_path=refinement_path,
            )
            base_raw_turns = (
                parse_diarization_turns(diarization_metadata.get("baseTurns"))
                or raw_turns
            )
            turns = (
                eligible_speaker_turns(raw_turns)
                if is_v5_profile(profile)
                else smooth_short_speaker_turns(eligible_speaker_turns(raw_turns))
            )
            reference_turns = (
                eligible_speaker_turns(base_raw_turns)
                if is_v5_profile(profile)
                else smooth_short_speaker_turns(eligible_speaker_turns(base_raw_turns))
            )
            detected_speakers = {turn["speaker"] for turn in reference_turns}
            if manual_references:
                mapping = map_manual_speakers(reference_turns, manual_references)
                turns = [{**turn, "speaker": mapping[turn["speaker"]]} for turn in turns]
                reference_turns = [{**turn, "speaker": mapping[turn["speaker"]]} for turn in reference_turns]
                diarization_metadata["manualSpeakerMapping"] = mapping
            if (
                expected_speaker_count is not None
                and len(detected_speakers) != expected_speaker_count
            ):
                raise RuntimeError(
                    "Pyannote n'a pas retrouvé le nombre d'intervenants demandé "
                    f"({len(detected_speakers)}/{expected_speaker_count})."
                )
            if is_v5_profile(profile):
                all_cues = merge_dialogue_units_v5(
                    split_cues_at_speaker_boundaries_v5(
                        all_cues, turns,
                        stable_boundaries=profile in {*TRANSLATED_V5_PROFILES, V5_STABLE_BOUNDARIES_PROFILE, V5_ALIGNED_SENTENCES_PROFILE, V5_FLEXIBLE_TAILS_PROFILE, V5_GUIDED_REFERENCES_PROFILE, V5_GUIDED_REFERENCES_R4_R1_PROFILE, V5_GUIDED_REFERENCES_R4_R2_PROFILE},
                        source_words=transcript_words(payload.get("sourceTranscript"))
                        if profile in {*TRANSLATED_V5_PROFILES, V5_ALIGNED_SENTENCES_PROFILE, V5_FLEXIBLE_TAILS_PROFILE, V5_GUIDED_REFERENCES_PROFILE, V5_GUIDED_REFERENCES_R4_R1_PROFILE, V5_GUIDED_REFERENCES_R4_R2_PROFILE} else None,
                        protect_translation=profile in TRANSLATED_V5_PROFILES and
                        str((payload.get("sourceTranscript") or {}).get("sourceLanguage") or "").lower() != language,
                    )
                )
                assignment_summary = {
                    "community-1": len(all_cues),
                    "sortformer": 0,
                }
            else:
                assigned_cues = split_cues_by_word_speakers(
                    all_cues,
                    reference_turns,
                    turns,
                )
                assignment_summary = {
                    source: sum(
                        cue["speakerAssignment"]["source"] == source
                        for cue in assigned_cues
                    )
                    for source in ("community-1", "sortformer")
                }
                all_cues = merge_dialogue_units(assigned_cues)
            assigned_speakers = {cue["speaker"] for cue in all_cues}
            if (
                expected_speaker_count is not None
                and len(assigned_speakers) != expected_speaker_count
            ):
                raise RuntimeError(
                    "Les sous-titres ne permettent pas d'attribuer une réplique à chacun des "
                    f"{expected_speaker_count} intervenants demandés."
                )
            reference_turns = [
                turn for turn in reference_turns
                if turn["speaker"] in assigned_speakers
            ]
            diarization_metadata["assignmentStrategy"] = (
                "translated-punctuation-boundaries-review-required-v1"
                if profile in TRANSLATED_V5_PROFILES and
                str((payload.get("sourceTranscript") or {}).get("sourceLanguage") or "").lower() != language else
                "source-aligned-sentence-onset-repair-v2"
                if profile in {*TRANSLATED_V5_PROFILES, V5_ALIGNED_SENTENCES_PROFILE, V5_FLEXIBLE_TAILS_PROFILE, V5_GUIDED_REFERENCES_PROFILE, V5_GUIDED_REFERENCES_R4_R1_PROFILE, V5_GUIDED_REFERENCES_R4_R2_PROFILE} else
                "speaker-boundary-stabilized-within-subtitle-v1"
                if profile == V5_STABLE_BOUNDARIES_PROFILE else
                "speaker-boundary-merge-v1"
                if is_v5_profile(profile)
                else "word-timed-community-sortformer-decisive-v3"
            )
            diarization_metadata["assignmentSummary"] = assignment_summary
            if is_v5_profile(profile):
                for repaired in (cue for cue in all_cues if cue.get("speakerBoundaryRepair")):
                    repair = repaired["speakerBoundaryRepair"]
                    log(
                        f"Frontière V5 R2 à contrôler: {repair['originalBoundary']:.3f}s "
                        f"rattachée à la phrase {repaired['start']:.3f}–{repaired['end']:.3f}s "
                        f"({repaired['speaker']})."
                    )
                log(
                    "Diarisation V5 Pyannote terminée: "
                    f"{len(set(cue['speaker'] for cue in all_cues))} voix assignée(s)."
                )
            else:
                log(
                    "Diarisation hybride V6 terminée: "
                    f"{len(set(cue['speaker'] for cue in all_cues))} voix assignée(s), "
                    f"{assignment_summary['sortformer']} correction(s) Sortformer "
                    f"sur {sum(assignment_summary.values())} unité(s) vocale(s)."
                )
        except Exception as error:
            if (
                install.get("diarizationRequired") is True
                or hybrid_required
                or expected_speaker_count is not None
            ):
                raise
            log(f"Pyannote indisponible, repli mono-locuteur: {error}")
            turns = [{"start": 0.0, "end": source_duration, "speaker": "SPEAKER_00"}]
            reference_turns = turns
            assigned_fallback = [
                {**cue, "speaker": "SPEAKER_00"} for cue in all_cues
            ]
            all_cues = (
                merge_dialogue_units_v5(assigned_fallback)
                if is_v5_profile(profile)
                else merge_dialogue_units(assigned_fallback)
            )

        if not is_v5_profile(profile):
            all_cues = plan_dialogue_timing(
                all_cues,
                turns,
                payload.get("sourceTranscript"),
                source_duration,
            )
            adjusted_windows = [
                cue for cue in all_cues
                if (
                    abs(float(cue["voiceStart"]) - float(cue["voiceTiming"]["subtitleStart"])) > 0.001
                    or abs(float(cue["voiceEnd"]) - float(cue["voiceTiming"]["subtitleEnd"])) > 0.001
                )
            ]
            maximum_gain = max([
                float(cue["voiceTiming"]["plannedDuration"])
                - (
                    float(cue["voiceTiming"]["subtitleEnd"])
                    - float(cue["voiceTiming"]["subtitleStart"])
                )
                for cue in adjusted_windows
            ], default=0.0)
            log(
                "Planification vocale R4 terminée: "
                f"{len(adjusted_windows)}/{len(all_cues)} fenêtre(s) ajustée(s), "
                f"gain maximal {maximum_gain:.3f}s."
            )

        report_progress(43, "VOICE_REFERENCE")
        profile_root = workspace / "voice-profile"
        references, profile_path, profile_checksum = build_voice_profile(
            profile_root,
            source,
            subtitle,
            payload.get("models", {}).get("pipeline"),
            all_cues,
            turns,
            reference_source,
            expected_speaker_count,
            payload.get("sourceTranscript"),
            models,
            payload.get("generationConfigHash"),
            diarization_metadata,
            turns,
            rejected_voice_references,
            manual_references,
        )
    else:
        report_progress(38, "LOADING_VOICE_PROFILE")
        profile_root = Path(str(payload.get("voiceProfilePath") or ""))
        all_cues, references, _ = load_voice_profile(
            profile_root,
            payload.get("voiceProfileChecksum"),
            source,
            subtitle,
            all_cues,
            expected_pipeline=profile,
            expected_generation_config_hash=payload.get("generationConfigHash"),
        )
        profile_path = profile_root / "manifest.json"
        profile_checksum = digest(profile_path)
        log(f"Profil vocal validé chargé: {len(references)} voix verrouillée(s).")

    if phase == "preview":
        cues = clip_cues(all_cues, start_seconds, duration)
        background = workspace / "background-preview.wav"
        trim_audio(full_background, background, start_seconds, duration)
    else:
        cues = all_cues
        background = full_background

    if not is_v5_profile(profile):
        cues = apply_planned_voice_timing(
            cues,
            start_seconds if phase == "preview" else 0.0,
            duration,
        )
        validate_synthesis_cues(cues)
    report_progress(47, "LOADING_VOICE_MODEL")
    model = load_voice_model(install, references)
    quality_model = load_quality_model(install)
    reference_seed_identities = (
        profile_checksum
        if is_v5_profile(profile)
        else {
            speaker: digest(reference["path"])
            for speaker, reference in references.items()
        }
    )
    voice_samples = []
    if phase == "preview":
        report_progress(48, "SYNTHESIZING_VOICE_SAMPLES")
        voice_samples = synthesize_voice_samples(
            model,
            all_cues,
            language,
            references,
            workspace,
            reference_seed_identities,
            speakers=[regeneration_target] if regeneration_target else None,
            profile=profile,
        )
    report_progress(52, "SYNTHESIZING")
    generated_cues = []
    quality_report = None
    for index, generated in enumerate(
        synthesize_cues(
            model,
            quality_model,
            cues,
            language,
            references,
            workspace,
            reference_seed_identities,
            render_duration=source_duration - start_seconds if flexible_v5_profile(profile) else duration,
            profile=profile,
        ), start=1
    ):
        cue, fitted_path, quality_report = generated
        generated_cues.append((cue, fitted_path))
        report_progress(52 + round((index / len(cues)) * 34), "SYNTHESIZING")
    report_progress(88, "ASSEMBLING")
    if flexible_v5_profile(profile) and phase == "preview":
        extended_duration = max([duration, *(cue["end"] for cue, _ in generated_cues)])
        if extended_duration > duration:
            duration = extended_duration
            trim_audio(full_background, background, start_seconds, duration)
    dialogue = workspace / "dialogue.wav"
    with observe_voice_activity("assembly", progress=88):
        if is_v5_profile(profile):
            speaker_stems = {}
            assemble_dialogue(generated_cues, dialogue, duration)
        else:
            speaker_stems = assemble_speaker_stems(
                generated_cues,
                workspace / "speaker-stems",
                duration,
            )
            combine_speaker_stems(speaker_stems, dialogue, duration)
    report_progress(91, "MIXING")
    mixed = workspace / "mixed.wav"
    with observe_voice_activity("mixing", progress=90):
        mix_audio(background, dialogue, mixed, duration, separated, generated_cues)
    report_progress(95, "WATERMARKING")
    final_audio = workspace / "result.wav"
    with observe_voice_activity("finalWatermark", progress=90):
        confidence = watermark_audio(mixed, final_audio)
    report_progress(99, "FINALIZING")

    script_payload = payload.get("voiceScript") or {}
    quality_report["script"] = {
        "schemaVersion": 1,
        "strategy": str(script_payload.get("strategy") or "legacy-vtt"),
        "cueCount": len(all_cues),
        "warningCount": sum(bool(cue.get("scriptFlags")) for cue in all_cues),
        "warnings": [
            {
                "sourceStart": round(float(cue.get("sourceStart", cue["start"])), 3),
                "flags": cue.get("scriptFlags") or [],
                "sourceConfidence": cue.get("sourceConfidence"),
                "displayText": str(cue.get("displayText") or cue["text"])[:500],
            }
            for cue in all_cues if cue.get("scriptFlags")
        ][:100],
    }
    quality_report["speakerStems"] = sorted(speaker_stems)
    quality_report["backgroundStem"] = "bandit-v2-multi" if separated else "original-ducked"

    write_json(output_path, {
        "audioPath": str(final_audio),
        "sourceLanguage": None,
        "watermarked": True,
        "watermarkConfidence": confidence,
        "separation": "bandit-v2-multi" if separated else "single-speaker-ducking",
        "diarization": (
            "pyannote-speaker-diarization-community-1+nvidia-diar-sortformer-4spk-v1"
            if hybrid_required
            else "pyannote-speaker-diarization-community-1"
        ),
        "speakerCount": len(references),
        "voiceProfilePath": str(profile_path.parent),
        "voiceProfileChecksum": profile_checksum,
        "voiceSamples": voice_samples,
        "previewStartSeconds": start_seconds,
        "voiceEngine": expected_identity["voiceEngine"],
        "voiceModel": expected_identity["voiceModel"],
        "voiceModelRevision": expected_identity["voiceModelRevision"],
        "generationConfigHash": payload.get("generationConfigHash"),
        "qualityReport": quality_report,
    })


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--phase", choices=["preview", "full", "voice"])
    parser.add_argument("--input")
    parser.add_argument("--output")
    parser.add_argument("--probe", action="store_true")
    parser.add_argument("--smoke-test", action="store_true")
    args = parser.parse_args()
    root = Path(os.environ.get("SAMI_AI_DUBBING_ROOT") or Path(__file__).parents[2] / "var" / "ai-dubbing").resolve()
    if args.probe:
        result = probe(root)
        result["voiceLibrary"] = 1
        print(json.dumps(result, ensure_ascii=False))
        raise SystemExit(0 if result.get("ready") else 1)
    if args.smoke_test:
        result = smoke_test(root)
        print(json.dumps(result, ensure_ascii=False))
        raise SystemExit(0 if result.get("ready") else 1)
    if not args.phase or not args.input or not args.output:
        parser.error("--phase, --input et --output sont requis.")
    if args.phase == "voice":
        from voice_library import process_voice
        process_voice(args.input, args.output, root, sys.modules[__name__])
    else:
        process(args.phase, args.input, args.output, root)


if __name__ == "__main__":
    try:
        main()
    except DubbingInputQualityError as error:
        print(
            f"{NON_RETRYABLE_ERROR_PREFIX}"
            + json.dumps({
                "code": error.code,
                "message": str(error),
                "retryable": False,
            }, ensure_ascii=False, separators=(",", ":")),
            file=sys.stderr,
            flush=True,
        )
        raise SystemExit(2)
