import importlib.util
import json
import io
import os
from contextlib import redirect_stderr
import math
import struct
import subprocess
import tempfile
import unittest
import wave
from pathlib import Path
from unittest import mock


RUNTIME_PATH = Path(__file__).with_name("runtime.py")
SPEC = importlib.util.spec_from_file_location("sami_ai_dubbing_runtime", RUNTIME_PATH)
RUNTIME = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RUNTIME)


class VoiceProfileContractTest(unittest.TestCase):
    def test_full_generation_feedback_is_identical_for_fr_en_ja(self):
        with tempfile.TemporaryDirectory() as directory, mock.patch.dict(os.environ, {"SAMI_DUBBING_WATCHDOG_PROTOCOL": "1"}):
            root = Path(directory)
            reference = root / "reference.wav"
            reference.write_bytes(b"same-reference")
            model = mock.Mock()
            model.generate_voice_clone.return_value = (["audio"], 24000)
            runtime = {"model": model, "engine": "qwen3-tts", "prompts": {"SPEAKER_01": "prompt"}}
            for language, text in [("fr", "Tout va bien."), ("en", "All is well."), ("ja", "大丈夫だ。")]:
                with self.subTest(language=language), redirect_stderr(io.StringIO()) as output:
                    RUNTIME.generate_voice(runtime, text, language, "SPEAKER_01", {"path": reference}, attempt=2,
                        profile=RUNTIME.V5_BOUNDED_SAMPLES_PROFILE,
                        watch_context={"workspace": root, "kind": "cue", "progress": 78,
                            "source_start": 231.56, "cue_index": 63, "cue_count": 80, "attempt": 3})
                    with RUNTIME.observe_voice_activity("quality", progress=78, speaker="SPEAKER_01",
                            source_start=231.56, cue_index=63, cue_count=80, attempt=3):
                        pass
                events = [json.loads(line.split("] ", 1)[1]) for line in output.getvalue().splitlines()]
                for event in [events[0], events[2]]:
                    self.assertEqual((event["cueIndex"], event["cueCount"], event["attempt"]), (63, 80, 3))
                    self.assertEqual(event["speaker"], "SPEAKER_01")
                self.assertEqual(events[2]["kind"], "quality")
                self.assertEqual(model.generate_voice_clone.call_args.kwargs["language"], RUNTIME.QWEN_LANGUAGES[language])

    def test_r5_r1_selects_a_short_whole_cue_without_changing_inputs(self):
        cues = [
            {"start": 164.04, "end": 172.62, "sourceStart": 164.04, "text": "ゴップロを乗せちゃったよ ゴッポの件は残念だ 気付かないでね 沢山のトラブルを招いてる ドアを塞いでるんだ"},
            {"start": 10, "end": 14, "sourceStart": 10, "text": "短い文です。"},
            {"start": 20, "end": 24, "sourceStart": 20, "text": "あ" * 121},
        ]
        snapshot = json.dumps(cues)
        self.assertIs(RUNTIME.select_bounded_voice_sample(cues), cues[1])
        self.assertEqual(json.dumps(cues), snapshot)
        with self.assertRaises(RUNTIME.DubbingInputQualityError):
            RUNTIME.select_bounded_voice_sample([cues[0], cues[2]])

    def test_r5_r1_writes_diagnostic_before_call_and_reports_completion(self):
        with tempfile.TemporaryDirectory() as directory, mock.patch.dict(os.environ, {"SAMI_DUBBING_WATCHDOG_PROTOCOL": "1"}):
            root = Path(directory)
            def operation():
                report = RUNTIME.load_json(root / "generation-attempt.json")
                self.assertEqual(report["state"], "running")
                self.assertEqual(report["timeoutSeconds"], 180)
                self.assertEqual(report["text"], "短い文です。")
                return "audio"
            output = io.StringIO()
            with redirect_stderr(output):
                result = RUNTIME.guarded_voice_operation(operation, workspace=root,
                    profile=RUNTIME.V5_BOUNDED_SAMPLES_PROFILE, speaker="SPEAKER_01",
                    source_start=10, text="短い文です。", language="ja", kind="sample", progress=51, seed=123)
            self.assertEqual(result, "audio")
            events = [json.loads(line.split("] ", 1)[1]) for line in output.getvalue().splitlines()]
            self.assertEqual([event["state"] for event in events], ["start", "end"])
            self.assertEqual(events[0]["id"], events[1]["id"])
            report = RUNTIME.load_json(root / "generation-attempt.json")
            self.assertEqual(report["state"], "completed")
            self.assertEqual(report["seed"], 123)

    def test_r5_r1_records_failure_and_refuses_unsupervised_generation(self):
        with tempfile.TemporaryDirectory() as directory:
            args = dict(workspace=Path(directory), profile=RUNTIME.V5_BOUNDED_SAMPLES_PROFILE,
                        speaker="SPEAKER_01", source_start=10, text="test", language="ja", kind="sample", progress=51)
            operation = mock.Mock(side_effect=RuntimeError("model failed"))
            with mock.patch.dict(os.environ, {"SAMI_DUBBING_WATCHDOG_PROTOCOL": "0"}):
                with self.assertRaises(RUNTIME.DubbingInputQualityError):
                    RUNTIME.guarded_voice_operation(operation, **args)
            operation.assert_not_called()
            with mock.patch.dict(os.environ, {"SAMI_DUBBING_WATCHDOG_PROTOCOL": "1"}), redirect_stderr(io.StringIO()):
                with self.assertRaisesRegex(RuntimeError, "model failed"):
                    RUNTIME.guarded_voice_operation(operation, **args)
            self.assertEqual(RUNTIME.load_json(Path(directory) / "generation-attempt.json")["state"], "failed")

    def test_r5_r1_does_not_change_generation_options_for_the_same_text(self):
        with tempfile.TemporaryDirectory() as directory, mock.patch.dict(os.environ, {"SAMI_DUBBING_WATCHDOG_PROTOCOL": "1"}), redirect_stderr(io.StringIO()):
            root = Path(directory)
            reference = root / "reference.wav"
            reference.write_bytes(b"reference")
            model = mock.Mock()
            model.generate_voice_clone.return_value = (["audio"], 24000)
            runtime = {"model": model, "engine": "qwen3-tts", "prompts": {"SPEAKER_01": "prompt"}}
            for text in ["はい。", "ゴップロを乗せちゃったよ ゴッポの件は残念だ 気付かないでね 沢山のトラブルを招いてる ドアを塞いでるんだ"]:
                RUNTIME.generate_voice(runtime, text, "ja", "SPEAKER_01", {"path": reference}, profile=RUNTIME.V5_TRANSLATED_CLAUSES_PROFILE)
                original = model.generate_voice_clone.call_args
                RUNTIME.generate_voice(runtime, text, "ja", "SPEAKER_01", {"path": reference},
                    profile=RUNTIME.V5_BOUNDED_SAMPLES_PROFILE,
                    watch_context={"workspace": root, "kind": "sample", "progress": 51, "source_start": 10})
                self.assertEqual(model.generate_voice_clone.call_args, original)

    def test_r5_r1_rejects_an_excessive_sample_without_publishing_a_truncated_sample(self):
        import numpy as np
        with tempfile.TemporaryDirectory() as directory, \
             mock.patch.dict(os.environ, {"SAMI_DUBBING_WATCHDOG_PROTOCOL": "1"}), \
             mock.patch.object(RUNTIME, "seed_synthesis", return_value=123), \
             mock.patch.object(RUNTIME, "watermark_audio") as watermark, redirect_stderr(io.StringIO()):
            root = Path(directory)
            reference = root / "reference.wav"
            reference.write_bytes(b"unchanged-reference")
            model = mock.Mock()
            model.generate_voice_clone.return_value = ([np.ones(21 * 24000, dtype=np.float32) * 0.1], 24000)
            runtime = {"model": model, "engine": "qwen3-tts", "prompts": {"SPEAKER_01": "prompt"}}
            cue = {"start": 10, "end": 14, "sourceStart": 10, "speaker": "SPEAKER_01", "text": "短い文です。"}
            with self.assertRaisesRegex(RUNTIME.DubbingInputQualityError, "sans troncature"):
                RUNTIME.synthesize_voice_samples(runtime, [cue], "ja", {"SPEAKER_01": {"path": reference}},
                    root, "checksum", profile=RUNTIME.V5_BOUNDED_SAMPLES_PROFILE)
            watermark.assert_not_called()
            self.assertFalse((root / "voice-samples" / "SPEAKER_01.wav").exists())
            report = RUNTIME.load_json(root / "generation-attempt.json")
            self.assertEqual(report["state"], "rejected-too-long")
            self.assertFalse(report["audio"]["complete"])
            self.assertTrue((root / report["audio"]["file"]).exists())
            self.assertEqual(reference.read_bytes(), b"unchanged-reference")

    def test_registry_and_python_hashes_match_for_every_immutable_profile(self):
        output = subprocess.check_output(["node", "--input-type=module", "-e",
            "import {AI_DUBBING_PROFILES} from './services/aiDubbing/profiles.js'; "
            "console.log(JSON.stringify(Object.fromEntries(Object.entries(AI_DUBBING_PROFILES).map(([id,p])=>[id,p.generationConfigHash]))));"],
            cwd=RUNTIME_PATH.resolve().parents[2], text=True)
        self.assertEqual(json.loads(output), RUNTIME.PROFILE_GENERATION_CONFIG_HASHES)

    def test_r5_translation_preserves_japanese_words_and_exact_text(self):
        text = "調理に適していますやってみませんか?いいえ,いいえ,私は...ワトソンさん効果がある気づかないかもしれませんが フランス製です"
        parts = RUNTIME.split_translation_at_clause_boundaries(text, [2.533, 1.384, 7.473])
        self.assertEqual("".join(parts), text)
        self.assertTrue(any("やってみませんか" in part for part in parts))
        self.assertTrue(any("ワトソン" in part for part in parts))
        self.assertTrue(all(part.strip() for part in parts))
        self.assertEqual(RUNTIME.split_translation_at_clause_boundaries("Oh, yeah. Yeah, I got it.", [1, 1]),
                         ["Oh, yeah. ", "Yeah, I got it."])
        self.assertIsNone(RUNTIME.split_translation_at_clause_boundaries("Value 1.50 remains whole", [1, 1]))

    def test_r5_translation_without_boundaries_is_whole_and_flagged(self):
        cue = {"start": 0, "end": 6, "text": "Une traduction entière sans ponctuation"}
        turns = [{"start": 0, "end": 2, "speaker": "A"}, {"start": 2, "end": 6, "speaker": "B"}]
        units = RUNTIME.split_cues_at_speaker_boundaries_v5([cue], turns, stable_boundaries=True, protect_translation=True)
        self.assertEqual(len(units), 1)
        self.assertEqual(units[0]["text"], cue["text"])
        self.assertEqual(units[0]["speaker"], "B")
        self.assertEqual(units[0]["translationBoundaryReview"], "unsplit_translation_dominant_speaker")
        legacy = RUNTIME.split_cues_at_speaker_boundaries_v5([cue], turns, stable_boundaries=True)
        self.assertEqual(len(legacy), 2)
        self.assertNotIn("translationBoundaryReview", legacy[0])

    def test_r5_exports_bounded_audio_and_removes_it_on_success(self):
        import numpy as np
        import soundfile as sf
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "raw.wav"
            sf.write(source, np.ones(16 * 24000, dtype=np.float32) * 0.1, 24000)
            result = RUNTIME.preserve_rejected_audio(source, root, 0, 16)
            self.assertFalse(result["complete"])
            with wave.open(str(root / result["file"]), "rb") as audio:
                self.assertEqual((audio.getnchannels(), audio.getsampwidth(), audio.getframerate()), (1, 2, 24000))
                self.assertEqual(audio.getnframes(), 15 * 24000)
            RUNTIME.clear_failure_audio(root)
            self.assertFalse((root / result["file"]).exists())
            self.assertTrue(source.exists())

    def test_r5_cer_failure_keeps_all_three_attempts_without_relaxing_threshold(self):
        import numpy as np
        cue = {"start": 184.64, "end": 185.84, "sourceStart": 184.64, "sourceEnd": 185.84,
               "speaker": "SPEAKER_01", "text": "Oh, yeah. Yeah, I got it."}
        with tempfile.TemporaryDirectory() as directory, \
             mock.patch.object(RUNTIME, "seed_synthesis", return_value=1), \
             mock.patch.object(RUNTIME, "generate_voice", return_value=(np.ones(44160, dtype=np.float32) * 0.1, 24000)), \
             mock.patch.object(RUNTIME, "media_duration", return_value=1.84), \
             mock.patch.object(RUNTIME, "transcribe_quality", return_value="That's sepanoia. Yeah, I got it."), \
             mock.patch.object(RUNTIME, "preserve_rejected_audio", wraps=RUNTIME.preserve_rejected_audio) as capture:
            with self.assertRaises(RUNTIME.DubbingInputQualityError):
                next(RUNTIME.synthesize_cues_v5(None, None, [cue], "en", {"SPEAKER_01": {}},
                    Path(directory), "hash", profile=RUNTIME.V5_TRANSLATED_CLAUSES_PROFILE, render_duration=310))
            report = json.loads((Path(directory) / "quality-failure.json").read_text())
            self.assertEqual(capture.call_count, 3)
            self.assertEqual(len(report["rejectedAttempts"]), 3)
            self.assertFalse(report["diagnostic"]["blockedByMediaEnd"])
            self.assertGreater(report["diagnostic"]["cer"], 0.35)
            for attempt in report["rejectedAttempts"]:
                self.assertTrue((Path(directory) / attempt["audio"]["file"]).is_file())
            with mock.patch.object(RUNTIME, "transcribe_quality", return_value=cue["text"]):
                generated, _, _ = next(RUNTIME.synthesize_cues_v5(None, None, [cue], "en", {"SPEAKER_01": {}},
                    Path(directory), "hash", profile=RUNTIME.V5_TRANSLATED_CLAUSES_PROFILE, render_duration=310))
            self.assertEqual(generated["start"], cue["start"])
            self.assertEqual(list(Path(directory).glob("quality-attempt-*.wav")), [])

    def test_guided_ranges_validate_bounds_and_unique_speaker_mapping(self):
        selected = [{"speaker": "SPEAKER_00", "ranges": [{"start": 1, "end": 4}, {"start": 20, "end": 24}]},
                    {"speaker": "SPEAKER_01", "ranges": [{"start": 10, "end": 13}]}]
        self.assertEqual(RUNTIME.validate_manual_references(selected, 2, 30), selected)
        self.assertIsNone(RUNTIME.validate_manual_references(None, None, 30))
        turns = [{"speaker": "SPEAKER_08", "start": 1, "end": 4},
                 {"speaker": "SPEAKER_08", "start": 20, "end": 24},
                 {"speaker": "SPEAKER_03", "start": 10, "end": 13}]
        self.assertEqual(RUNTIME.map_manual_speakers(turns, selected), {"SPEAKER_08": "SPEAKER_00", "SPEAKER_03": "SPEAKER_01"})
        for duration, count in [(12, 2), (30, 3)]:
            with self.assertRaises(RUNTIME.DubbingInputQualityError):
                RUNTIME.validate_manual_references(selected, count, duration)
        with self.assertRaisesRegex(RUNTIME.DubbingInputQualityError, "même voix"):
            RUNTIME.map_manual_speakers([{**turn, "speaker": "SPEAKER_08"} for turn in turns], selected)
        with self.assertRaisesRegex(RUNTIME.DubbingInputQualityError, "alternatives"):
            RUNTIME.map_manual_speakers([turns[0], {**turns[1], "speaker": "SPEAKER_03"}, turns[2]], selected)

    def test_guided_reference_selects_one_range_then_an_alternative_never_outside_selection(self):
        selected = {"speaker": "SPEAKER_00", "ranges": [{"start": 1, "end": 4}, {"start": 10, "end": 14}]}
        transcript = {"segments": [{"words": [
            {"start": 1.1, "end": 3.8, "text": "Première prise."},
            {"start": 10.1, "end": 13.9, "text": "Autre prise plus longue."},
            {"start": 20, "end": 28, "text": "Longue prise hors sélection."},
        ]}]}
        primary = RUNTIME.select_manual_reference(selected, transcript, [])
        self.assertEqual((primary["start"], primary["end"]), (10.1, 13.9))
        rejected = [{"sourceStart": primary["start"], "sourceEnd": primary["end"]}]
        alternative = RUNTIME.select_manual_reference(selected, transcript, rejected)
        self.assertEqual((alternative["start"], alternative["end"]), (1.1, 3.8))
        rejected.append({"sourceStart": 1.1, "sourceEnd": 3.8})
        with self.assertRaises(RUNTIME.DubbingInputQualityError):
            RUNTIME.select_manual_reference(selected, transcript, rejected)
        self.assertTrue(RUNTIME.flexible_v5_profile(RUNTIME.V5_GUIDED_REFERENCES_PROFILE))

    def test_v5_r4_r1_uses_deterministic_first_generation_for_short_text(self):
        model = mock.Mock()
        model.generate_voice_clone.return_value = (["wave"], 24000)
        runtime = {"engine": "qwen3-tts", "model": model, "prompts": {"SPEAKER_02": "prompt"}}
        RUNTIME.generate_voice(runtime, "Rigueur ?", "fr", "SPEAKER_02", {},
                               attempt=0, profile=RUNTIME.V5_GUIDED_REFERENCES_R4_R1_PROFILE)
        self.assertFalse(model.generate_voice_clone.call_args.kwargs["do_sample"])
        RUNTIME.generate_voice(runtime, "Rigueur ?", "fr", "SPEAKER_02", {},
                               attempt=1, profile=RUNTIME.V5_GUIDED_REFERENCES_R4_R1_PROFILE)
        self.assertTrue(model.generate_voice_clone.call_args.kwargs["do_sample"])

    def test_v5_r4_r1_reports_a_short_cer_mismatch_without_blocking(self):
        cue = {"start": 92.83, "end": 93.29, "sourceStart": 92.83, "sourceEnd": 93.29,
               "speaker": "SPEAKER_02", "text": "Rigueur ?"}
        with tempfile.TemporaryDirectory() as directory, \
             mock.patch.object(RUNTIME, "seed_synthesis", return_value=1), \
             mock.patch.object(RUNTIME, "generate_voice", return_value=([], 24000)), \
             mock.patch.object(RUNTIME, "save_generated_audio"), \
             mock.patch.object(RUNTIME, "media_duration", return_value=0.560), \
             mock.patch.object(RUNTIME, "generated_audio_activity", return_value={"hasSpeech": True}), \
             mock.patch.object(RUNTIME, "transcribe_quality", return_value="figure"), \
             mock.patch.object(RUNTIME, "character_error_rate", return_value=0.714), \
             mock.patch.object(RUNTIME, "run"):
            generated, _, report = next(RUNTIME.synthesize_cues_v5(
                None, None, [cue], "fr", {"SPEAKER_02": {}}, Path(directory), "hash",
                profile=RUNTIME.V5_GUIDED_REFERENCES_R4_R1_PROFILE, render_duration=310,
            ))
        self.assertEqual(generated["start"], cue["start"])
        self.assertEqual(report["retriedCount"], 1)
        self.assertEqual(report["warnings"][0]["cer"], 0.714)
        self.assertTrue(report["warnings"][0]["selectedBestShortAttempt"])
        self.assertTrue(report["warnings"][0]["shortCerMismatchAccepted"])
        self.assertEqual(report["warnings"][0]["candidateAttempts"], 3)

    def test_v5_r4_r2_treats_apostrophe_contractions_as_one_spoken_unit(self):
        text = "il n'y avait rien."
        self.assertEqual(len(RUNTIME.speech_lexical_units(text)), 5)
        self.assertEqual(
            RUNTIME.profile_speech_lexical_units(text, RUNTIME.V5_GUIDED_REFERENCES_R4_R1_PROFILE),
            ["il", "n", "y", "avait", "rien"],
        )
        self.assertEqual(
            RUNTIME.profile_speech_lexical_units(text, RUNTIME.V5_GUIDED_REFERENCES_R4_R2_PROFILE),
            ["il", "n'y", "avait", "rien"],
        )
        self.assertEqual(
            RUNTIME.speech_lexical_units_with_contractions("qu’il don't t'as"),
            ["qu’il", "don't", "t'as"],
        )

    def test_v5_r4_r2_accepts_the_reported_flexible_tail_as_a_short_warning(self):
        cue = {"start": 83.04, "end": 83.311, "sourceStart": 83.04, "sourceEnd": 83.311,
               "speaker": "SPEAKER_01", "text": "il n'y avait rien."}
        with tempfile.TemporaryDirectory() as directory, \
             mock.patch.object(RUNTIME, "seed_synthesis", return_value=1), \
             mock.patch.object(RUNTIME, "generate_voice", return_value=([], 24000)), \
             mock.patch.object(RUNTIME, "save_generated_audio"), \
             mock.patch.object(RUNTIME, "media_duration", return_value=0.960), \
             mock.patch.object(RUNTIME, "generated_audio_activity", return_value={"hasSpeech": True}), \
             mock.patch.object(RUNTIME, "transcribe_quality", return_value="il avait rien"), \
             mock.patch.object(RUNTIME, "character_error_rate", return_value=0.538), \
             mock.patch.object(RUNTIME, "run"):
            generated, _, report = next(RUNTIME.synthesize_cues_v5(
                None, None, [cue], "fr", {"SPEAKER_01": {}}, Path(directory), "hash",
                profile=RUNTIME.V5_GUIDED_REFERENCES_R4_R2_PROFILE, render_duration=310,
            ))
        self.assertEqual(generated["start"], 83.04)
        self.assertAlmostEqual(generated["end"], 83.68)
        self.assertEqual(report["warnings"][0]["durationRatio"], 1.5)
        self.assertEqual(report["warnings"][0]["cer"], 0.538)
        self.assertTrue(report["warnings"][0]["shortCerMismatchAccepted"])

    def test_v5_r4_r1_still_blocks_a_long_cer_mismatch(self):
        cue = {"start": 1, "end": 1.46, "sourceStart": 1, "sourceEnd": 1.46,
               "speaker": "SPEAKER_00", "text": "Cette phrase contient vraiment cinq mots"}
        with tempfile.TemporaryDirectory() as directory, \
             mock.patch.object(RUNTIME, "seed_synthesis", return_value=1), \
             mock.patch.object(RUNTIME, "generate_voice", return_value=([], 24000)), \
             mock.patch.object(RUNTIME, "save_generated_audio"), \
             mock.patch.object(RUNTIME, "media_duration", return_value=0.560), \
             mock.patch.object(RUNTIME, "transcribe_quality", return_value="texte incorrect"), \
             mock.patch.object(RUNTIME, "character_error_rate", return_value=0.714), \
             mock.patch.object(RUNTIME, "run"):
            with self.assertRaises(RUNTIME.DubbingInputQualityError):
                next(RUNTIME.synthesize_cues_v5(
                    None, None, [cue], "fr", {"SPEAKER_00": {}}, Path(directory), "hash",
                    profile=RUNTIME.V5_GUIDED_REFERENCES_R4_R1_PROFILE, render_duration=310,
                ))

    def test_v5_r3_mixer_keeps_the_tail_and_the_next_voice_at_its_original_start(self):
        import numpy as np
        import soundfile as sf
        rate = 48000
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            first_path, next_path, output = root / "first.wav", root / "next.wav", root / "mix.wav"
            sf.write(first_path, np.full(round(0.746667 * rate), 0.2, dtype=np.float32), rate, subtype="FLOAT")
            sf.write(next_path, np.full(round(0.3 * rate), 0.1, dtype=np.float32), rate, subtype="FLOAT")
            first = RUNTIME.plan_v5_flexible_tail({"start": 1.0, "end": 1.271}, 1.120, 2)["cue"]
            following = {"start": 1.5, "end": 1.8}
            RUNTIME.assemble_dialogue([(first, first_path), (following, next_path)], output, 2)
            audio, _ = sf.read(output)
            self.assertAlmostEqual(audio[round(0.99 * rate)], 0, places=5)
            self.assertAlmostEqual(audio[round(1.4 * rate)], 0.2, places=5)
            self.assertAlmostEqual(audio[round(1.6 * rate)], 0.3, places=5)
            self.assertAlmostEqual(audio[round(1.77 * rate)], 0.1, places=5)

    def test_v5_r3_extends_only_the_minimum_tail_without_changing_the_onset(self):
        cue = {"start": 83.04, "end": 83.311, "sourceStart": 83.04, "sourceEnd": 83.311,
               "speaker": "SPEAKER_00", "text": "il n'y avait rien."}
        timing = RUNTIME.plan_v5_flexible_tail(cue, 1.120, 310)
        self.assertEqual(timing["cue"]["start"], 83.04)
        self.assertEqual(timing["cue"]["sourceEnd"], 83.311)
        self.assertAlmostEqual(timing["cue"]["end"], 83.786666667)
        self.assertAlmostEqual(timing["extensionSeconds"], 0.475666667)
        self.assertAlmostEqual(timing["acceleration"], 1.5)
        self.assertFalse(timing["blockedByMediaEnd"])
        self.assertTrue(RUNTIME.plan_v5_flexible_tail(cue, 1.120, 83.5)["blockedByMediaEnd"])
        for generated in [0.1, 0.271, 0.4]:
            unchanged = RUNTIME.plan_v5_flexible_tail(cue, generated, 310)
            self.assertEqual(unchanged["cue"]["end"], cue["end"])
            self.assertEqual(unchanged["extensionSeconds"], 0)

    def test_v5_r3_accepts_valid_text_and_flexible_duration_but_keeps_text_quality_gate(self):
        cue = {"start": 83.04, "end": 83.311, "sourceStart": 83.04, "sourceEnd": 83.311,
               "speaker": "SPEAKER_00", "text": "il n'y avait rien."}
        following = {"start": 83.5, "end": 84.2, "sourceStart": 83.5, "sourceEnd": 84.2,
                     "speaker": "SPEAKER_01", "text": "Oui."}
        for cer, should_pass in [(0.154, True), (0.8, False)]:
            with self.subTest(cer=cer), tempfile.TemporaryDirectory() as directory:
                with mock.patch.object(RUNTIME, "seed_synthesis", return_value=1), \
                     mock.patch.object(RUNTIME, "generate_voice", return_value=([], 24000)), \
                     mock.patch.object(RUNTIME, "save_generated_audio"), \
                     mock.patch.object(RUNTIME, "media_duration", side_effect=lambda _: 1.120), \
                     mock.patch.object(RUNTIME, "transcribe_quality", return_value=cue["text"]), \
                     mock.patch.object(RUNTIME, "character_error_rate", return_value=cer), \
                     mock.patch.object(RUNTIME, "run") as run:
                    iterator = RUNTIME.synthesize_cues_v5(None, None, [cue, following], "fr",
                        {"SPEAKER_00": {}, "SPEAKER_01": {}}, Path(directory), "hash",
                        profile=RUNTIME.V5_FLEXIBLE_TAILS_PROFILE, render_duration=310)
                    if should_pass:
                        first, _, report = next(iterator)
                        self.assertAlmostEqual(first["end"], 83.786666667)
                        self.assertEqual(first["start"], cue["start"])
                        warning = report["warnings"][0]
                        self.assertAlmostEqual(warning["timingOverlapSeconds"], 0.286667)
                        self.assertEqual(warning["durationRatio"], 1.5)
                        self.assertIn("atrim=0:0.746667", " ".join(str(a) for a in run.call_args.args))
                        second, _, _ = next(iterator)
                        self.assertEqual(second["start"], 83.5)
                    else:
                        with self.assertRaises(RUNTIME.DubbingInputQualityError): next(iterator)
                        run.assert_not_called()

    def test_v5_r2_moves_false_first_word_boundary_to_aligned_sentence_end(self):
        first = {"start": 37.09, "end": 39.91, "text": "Deux poteaux comme ça au milieu de rien en plus !"}
        second = {"start": 39.91, "end": 42.83, "text": "Comment t'as demandé aux gens ?"}
        words = [
            {"start": 37.09, "end": 37.67, "text": "Deux"},
            {"start": 37.67, "end": 39.91, "text": "poteaux comme ça au milieu de rien en plus !"},
        ]
        turns = [
            {"start": 37.09, "end": 37.392, "speaker": "SPEAKER_01"},
            {"start": 37.392, "end": 42.83, "speaker": "SPEAKER_02"},
        ]
        legacy = RUNTIME.split_cues_at_speaker_boundaries_v5([first, second], turns, stable_boundaries=True)
        self.assertEqual(legacy[0]["text"], "Deux")
        repaired = RUNTIME.split_cues_at_speaker_boundaries_v5([first, second], turns, stable_boundaries=True, source_words=words)
        self.assertEqual(len(repaired), 2)
        self.assertEqual((repaired[0]["text"], repaired[0]["speaker"]), (first["text"], "SPEAKER_01"))
        self.assertEqual((repaired[1]["text"], repaired[1]["speaker"]), (second["text"], "SPEAKER_02"))
        self.assertEqual(repaired[0]["end"], repaired[1]["start"])
        self.assertTrue(repaired[0]["speakerBoundaryRepair"]["reviewRequired"])
        self.assertEqual(repaired[0]["speakerBoundaryRepair"]["originalBoundary"], 37.392)
        for changed_words in [[], [{**words[0], "text": "Three"}, words[1]],
                              [{**words[0], "end": 37.392}, words[1]]]:
            unchanged = RUNTIME.split_cues_at_speaker_boundaries_v5([first, second], turns, stable_boundaries=True, source_words=changed_words)
            self.assertEqual(unchanged, legacy)

    def test_v5_r2_does_not_force_single_voice_over_multiple_sentences(self):
        cue = {"start": 0, "end": 3, "text": "Oui ! Continue."}
        units = [{**cue, "end": 0.3, "speaker": "A"}, {**cue, "start": 0.3, "speaker": "B"}]
        words = [{"start": 0, "end": 0.5, "text": "Oui !"}, {"start": 0.5, "end": 3, "text": "Continue."}]
        self.assertEqual(RUNTIME.repair_v5_sentence_onset(cue, units, words), units)

    def test_v5_failed_short_fragment_is_diagnosed_and_not_retryable(self):
        cue = {"start": 13.97, "end": 14.003, "sourceStart": 13.97,
               "sourceEnd": 14.003, "text": "t'es", "speaker": "SPEAKER_02"}
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory)
            with mock.patch.object(RUNTIME, "seed_synthesis", return_value=1), \
                 mock.patch.object(RUNTIME, "generate_voice", return_value=([], 24000)), \
                 mock.patch.object(RUNTIME, "save_generated_audio"), \
                 mock.patch.object(RUNTIME, "media_duration", return_value=0.560), \
                 mock.patch.object(RUNTIME, "transcribe_quality") as transcribe:
                with self.assertRaisesRegex(RUNTIME.DubbingInputQualityError, "0.033s"):
                    list(RUNTIME.synthesize_cues_v5(
                        None, None, [cue], "fr", {"SPEAKER_02": {}}, workspace, "hash",
                    ))
                transcribe.assert_not_called()
            diagnostic = RUNTIME.load_json(workspace / "quality-failure.json")
            self.assertEqual(diagnostic["cue"]["text"], "t'es")
            self.assertEqual(diagnostic["diagnostic"]["targetDuration"], 0.033)
            self.assertEqual(diagnostic["diagnostic"]["generatedDuration"], 0.56)
            self.assertEqual(diagnostic["diagnostic"]["attempts"], 3)
            self.assertEqual(RUNTIME.DubbingInputQualityError.code, "AI_DUBBING_INPUT_QUALITY_BLOCKED")

    def test_only_registered_algorithmic_profiles_are_supported(self):
        self.assertEqual(
            RUNTIME.resolve_dubbing_profile("sami-dubbing-v5-aligned-quality"),
            RUNTIME.V5_ALIGNED_QUALITY_PROFILE,
        )
        self.assertEqual(
            RUNTIME.resolve_dubbing_profile("sami-dubbing-v6-clean-phrases-r9-r1"),
            RUNTIME.V6_CLEAN_PHRASES_R9_R1_PROFILE,
        )
        self.assertEqual(
            RUNTIME.resolve_dubbing_profile("sami-dubbing-v5-stable-boundaries-r1"),
            RUNTIME.V5_STABLE_BOUNDARIES_PROFILE,
        )
        self.assertTrue(RUNTIME.is_v5_profile(RUNTIME.V5_STABLE_BOUNDARIES_PROFILE))
        with self.assertRaisesRegex(ValueError, "Profil de doublage IA inconnu"):
            RUNTIME.resolve_dubbing_profile("sami-dubbing-simple-etiquette")

    def test_v5_preserves_its_historical_speaker_boundary_segmentation(self):
        cues = [{
            "start": 0.0,
            "end": 3.0,
            "sourceStart": 0.0,
            "sourceEnd": 3.0,
            "text": "un deux trois",
        }]
        turns = [
            {"start": 0.0, "end": 1.0, "speaker": "SPEAKER_00"},
            {"start": 1.0, "end": 1.2, "speaker": "SPEAKER_01"},
            {"start": 1.2, "end": 3.0, "speaker": "SPEAKER_00"},
        ]

        legacy = RUNTIME.split_cues_at_speaker_boundaries_v5(cues, turns)
        current = RUNTIME.split_cues_at_speaker_boundaries(cues, turns)

        self.assertEqual([cue["speaker"] for cue in legacy], [
            "SPEAKER_00", "SPEAKER_01", "SPEAKER_00",
        ])
        self.assertEqual(len(current), 2)

    def test_v5_r1_rejoins_the_observed_33ms_fragment_without_changing_legacy(self):
        # Horodatages du manifeste fourni : t'es, 13.970–14.003, SPEAKER_02.
        cue = {"start": 13.74, "end": 15.14, "sourceStart": 13.74,
               "sourceEnd": 15.14, "text": "Joseph, t'es un génie !"}
        turns = [
            {"start": 13.74, "end": 13.97, "speaker": "SPEAKER_01"},
            {"start": 13.97, "end": 14.003, "speaker": "SPEAKER_02"},
            {"start": 14.003, "end": 15.14, "speaker": "SPEAKER_01"},
        ]
        legacy = RUNTIME.split_cues_at_speaker_boundaries_v5([cue], turns)
        self.assertEqual(legacy[1]["text"], "t'es")
        self.assertAlmostEqual(legacy[1]["end"] - legacy[1]["start"], 0.033)
        repaired = RUNTIME.split_cues_at_speaker_boundaries_v5([cue], turns, stable_boundaries=True)
        self.assertEqual(repaired, [{**cue, "speaker": "SPEAKER_01"}])

    def test_v5_r1_preserves_standalone_short_interjections_and_real_speaker_changes(self):
        cues = [
            {"start": 0.0, "end": 0.06, "text": "Oh !"},
            {"start": 0.3, "end": 1.5, "text": "Oui, continue."},
        ]
        turns = [
            {"start": 0.0, "end": 0.06, "speaker": "A"},
            {"start": 0.3, "end": 0.5, "speaker": "B"},
            {"start": 0.5, "end": 1.5, "speaker": "C"},
        ]
        result = RUNTIME.split_cues_at_speaker_boundaries_v5(cues, turns, stable_boundaries=True)
        self.assertEqual([(c["text"], c["speaker"]) for c in result], [
            ("Oh !", "A"), ("Oui,", "B"), ("continue.", "C"),
        ])
        self.assertEqual((result[0]["start"], result[0]["end"]), (0.0, 0.06))
        self.assertEqual(result[1]["start"], 0.3)

    def test_v5_r1_handles_edge_fragments_and_excess_boundaries_without_losing_words(self):
        for text in ["Non !", "はい！", "un deux trois !"]:
            with self.subTest(text=text):
                cue = {"start": 1.0, "end": 2.0, "text": text}
                turns = [
                    {"start": 1.0, "end": 1.03, "speaker": "A"},
                    {"start": 1.03, "end": 1.4, "speaker": "B"},
                    {"start": 1.4, "end": 1.97, "speaker": "C"},
                    {"start": 1.97, "end": 2.0, "speaker": "D"},
                ]
                result = RUNTIME.split_cues_at_speaker_boundaries_v5([cue], turns, stable_boundaries=True)
                self.assertEqual(result[0]["start"], 1.0)
                self.assertEqual(result[-1]["end"], 2.0)
                self.assertEqual(
                    "".join("".join(c["text"].split()) for c in result),
                    "".join(text.split()),
                )
                for piece in result:
                    self.assertGreaterEqual(piece["end"] - piece["start"], 0.12)
                    self.assertTrue(any(char.isalnum() for char in piece["text"]))

    def test_v5_r1_dispatches_to_v5_synthesis_and_records_its_own_profile(self):
        with mock.patch.object(RUNTIME, "synthesize_cues_v5", return_value=iter([])) as legacy:
            list(RUNTIME.synthesize_cues(None, None, [], "fr", {}, Path("."), "hash",
                                        profile=RUNTIME.V5_STABLE_BOUNDARIES_PROFILE))
        self.assertEqual(legacy.call_args.kwargs["profile"], RUNTIME.V5_STABLE_BOUNDARIES_PROFILE)

    def test_r7_regenerates_only_the_requested_reference(self):
        self.assert_targeted_reference_regeneration(RUNTIME.V6_CLEAN_PHRASES_R9_R1_PROFILE)

    def test_guided_regeneration_preserves_other_references_and_manual_alternatives(self):
        self.assert_targeted_reference_regeneration(RUNTIME.V5_GUIDED_REFERENCES_PROFILE)

    def test_r5_regeneration_preserves_other_references_and_manual_alternatives(self):
        self.assert_targeted_reference_regeneration(RUNTIME.V5_TRANSLATED_CLAUSES_PROFILE)

    def test_r5_r1_regeneration_preserves_other_references_and_manual_alternatives(self):
        self.assert_targeted_reference_regeneration(RUNTIME.V5_BOUNDED_SAMPLES_PROFILE)

    def assert_targeted_reference_regeneration(self, profile):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source.wav"
            subtitle = root / "target.vtt"
            source.write_bytes(b"source-audio")
            subtitle.write_text("WEBVTT\n", encoding="utf-8")
            previous = root / "previous-profile"
            previous_references = previous / "references"
            previous_references.mkdir(parents=True)
            first = previous_references / "SPEAKER_00.wav"
            second = previous_references / "SPEAKER_01.wav"
            first.write_bytes(b"first-reference")
            second.write_bytes(b"second-reference")
            dialogue_units = [
                {"start": 0.0, "end": 3.0, "speaker": "SPEAKER_00", "text": "Première voix"},
                {"start": 4.0, "end": 7.0, "speaker": "SPEAKER_01", "text": "Deuxième voix"},
            ]
            previous_manifest = {
                "schemaVersion": 2,
                "sourcePlaylistSha256": RUNTIME.digest(source),
                "targetSubtitleSha256": RUNTIME.digest(subtitle),
                "voiceEngine": "qwen3-tts",
                "voiceModel": "voice-model",
                "voiceModelRevision": "revision-1",
                "generationConfigHash": "new-config",
                "pipelineVersion": profile,
                "speakers": ["SPEAKER_00", "SPEAKER_01"],
                "references": {
                    "SPEAKER_00": {
                        "path": "references/SPEAKER_00.wav",
                        "sha256": RUNTIME.digest(first),
                        "sourceStart": 0.0,
                        "sourceEnd": 3.0,
                        "referenceText": "Première voix",
                    },
                    "SPEAKER_01": {
                        "path": "references/SPEAKER_01.wav",
                        "sha256": RUNTIME.digest(second),
                        "sourceStart": 4.0,
                        "sourceEnd": 7.0,
                        "referenceText": "Deuxième voix",
                    },
                },
                "dialogueUnits": dialogue_units,
            }
            manual = [{"speaker": "SPEAKER_00", "ranges": [{"start": 0, "end": 3}]},
                      {"speaker": "SPEAKER_01", "ranges": [{"start": 4, "end": 7}, {"start": 8, "end": 11}]}]
            if profile in {RUNTIME.V5_GUIDED_REFERENCES_PROFILE, *RUNTIME.TRANSLATED_V5_PROFILES}:
                previous_manifest["manualVoiceReferences"] = manual
            manifest_path = previous / "manifest.json"
            RUNTIME.write_json(manifest_path, previous_manifest)
            previous_checksum = RUNTIME.digest(manifest_path)
            output = root / "voice-profile"

            def regenerate_reference(_source, turns, destination, *_args, **_kwargs):
                self.assertEqual({turn["speaker"] for turn in turns}, {"SPEAKER_01"})
                self.assertEqual(_kwargs["manual_references"], previous_manifest.get("manualVoiceReferences"))
                generated = destination / "references" / "SPEAKER_01.wav"
                generated.parent.mkdir(parents=True, exist_ok=True)
                generated.write_bytes(b"new-second-reference")
                return {"SPEAKER_01": generated}, {
                    "SPEAKER_01": {"start": 8.0, "end": 11.0, "text": "Nouvelle deuxième voix"},
                }

            with mock.patch.object(RUNTIME, "make_speaker_references", side_effect=regenerate_reference):
                assigned, references, new_manifest_path, _ = RUNTIME.regenerate_single_voice_profile(
                    output,
                    previous,
                    previous_checksum,
                    source,
                    subtitle,
                    source,
                    {"segments": []},
                    "SPEAKER_01",
                    [{"sourceStart": 4.0, "sourceEnd": 7.0}],
                    profile,
                    {
                        "voiceEngine": "qwen3-tts",
                        "voiceModel": "voice-model",
                        "voiceModelRevision": "revision-1",
                    },
                    "new-config",
                )

            new_manifest = RUNTIME.load_json(new_manifest_path)
            self.assertEqual(assigned, dialogue_units)
            self.assertEqual(set(references), {"SPEAKER_00", "SPEAKER_01"})
            self.assertEqual(
                new_manifest["references"]["SPEAKER_00"]["sha256"],
                previous_manifest["references"]["SPEAKER_00"]["sha256"],
            )
            self.assertNotEqual(
                new_manifest["references"]["SPEAKER_01"]["sha256"],
                previous_manifest["references"]["SPEAKER_01"]["sha256"],
            )
            self.assertEqual(new_manifest["regeneratedSpeaker"], "SPEAKER_01")
            self.assertEqual(new_manifest.get("manualVoiceReferences"), previous_manifest.get("manualVoiceReferences"))

    def test_voice_script_keeps_display_and_spoken_text_distinct(self):
        cues = RUNTIME.parse_voice_script({
            "schemaVersion": 1,
            "cues": [{
                "id": "cue-00001",
                "start": 1.25,
                "end": 3.5,
                "sourceText": "Texte source",
                "displayText": "Texte affiché",
                "spokenText": "Texte parlé",
                "sourceConfidence": 0.91,
                "flags": [],
            }],
        })

        self.assertEqual(cues[0]["text"], "Texte parlé")
        self.assertEqual(cues[0]["displayText"], "Texte affiché")
        self.assertEqual(cues[0]["sourceText"], "Texte source")
        self.assertEqual(cues[0]["sourceConfidence"], 0.91)

    def test_wsl_window_manifest_converts_nested_windows_paths_with_spaces(self):
        windows = [{
            "index": 0,
            "audioPath": r"C:\Users\Lee World\Downloads\sami\window-0000.wav",
            "audioStart": 0.0,
            "coreStart": 0.0,
            "coreEnd": 75.0,
        }]
        converted = RUNTIME.serialize_sortformer_windows(
            windows,
            {"sortformerRuntime": "wsl"},
            path_converter=lambda _path: "/mnt/c/Users/Lee World/Downloads/sami/window-0000.wav",
        )

        self.assertEqual(
            converted[0]["audioPath"],
            "/mnt/c/Users/Lee World/Downloads/sami/window-0000.wav",
        )
        self.assertEqual(
            windows[0]["audioPath"],
            r"C:\Users\Lee World\Downloads\sami\window-0000.wav",
        )

    def test_profile_locks_assignments_references_and_input_files(self):
        with tempfile.TemporaryDirectory(prefix="sami-dubbing-profile-") as temporary:
            root = Path(temporary)
            source_playlist = root / "source.m3u8"
            subtitle = root / "fr.vtt"
            speech = root / "speech.wav"
            profile = root / "profile"
            source_playlist.write_text("#EXTM3U\n#EXT-X-ENDLIST\n", encoding="utf-8")
            subtitle.write_text(
                "WEBVTT\n\n00:00:00.000 --> 00:00:02.200\nPremière voix\n\n"
                "00:00:02.500 --> 00:00:04.800\nDeuxième voix\n",
                encoding="utf-8",
            )
            with wave.open(str(speech), "wb") as audio:
                audio.setnchannels(1)
                audio.setsampwidth(2)
                audio.setframerate(48_000)
                audio.writeframes(b"\0\0" * (48_000 * 5))

            cues = RUNTIME.parse_vtt(subtitle)
            cues[0]["speaker"] = "SPEAKER_00"
            cues[1]["speaker"] = "SPEAKER_01"
            turns = [
                {"start": 0.0, "end": 2.2, "speaker": "SPEAKER_00"},
                {"start": 2.5, "end": 4.8, "speaker": "SPEAKER_01"},
            ]
            _, manifest_path, checksum = RUNTIME.build_voice_profile(
                profile,
                source_playlist,
                subtitle,
                "sami-dubbing-v6-clean-phrases-r9-r1",
                cues,
                turns,
                speech,
                2,
                {
                    "segments": [
                        {"start": 0.0, "end": 2.2, "text": "Première voix"},
                        {"start": 2.5, "end": 4.8, "text": "Deuxième voix"},
                    ],
                },
                None,
                None,
                {
                    "model": "pyannote-speaker-diarization-community-1+nvidia-diar-sortformer-4spk-v1",
                    "refinement": {"applied": True, "acceptedWindows": 1},
                    "assignmentStrategy": "whole-cue-community-baseline-sortformer-conservative-v1",
                    "assignmentSummary": {"community-1": 2, "sortformer": 0},
                },
            )

            loaded_cues, references, manifest = RUNTIME.load_voice_profile(
                profile,
                checksum,
                source_playlist,
                subtitle,
                RUNTIME.parse_vtt(subtitle),
            )
            self.assertTrue(manifest_path.is_file())
            self.assertEqual([cue["speaker"] for cue in loaded_cues], ["SPEAKER_00", "SPEAKER_01"])
            self.assertEqual(set(references), {"SPEAKER_00", "SPEAKER_01"})
            self.assertEqual(
                manifest["pipelineVersion"],
                "sami-dubbing-v6-clean-phrases-r9-r1",
            )
            self.assertEqual(
                manifest["diarizationModel"],
                "pyannote-speaker-diarization-community-1+nvidia-diar-sortformer-4spk-v1",
            )
            self.assertTrue(manifest["diarizationRefinement"]["applied"])
            self.assertEqual(
                manifest["speakerAssignmentStrategy"],
                "whole-cue-community-baseline-sortformer-conservative-v1",
            )
            self.assertEqual(
                manifest["speakerAssignmentSummary"],
                {"community-1": 2, "sortformer": 0},
            )
            self.assertEqual(manifest["expectedSpeakerCount"], 2)
            self.assertEqual(manifest["diarizationSource"], "original-audio")
            self.assertEqual(
                manifest["referenceStrategy"],
                "single-sentence-refined-speaker-consensus-v5",
            )
            first_reference = manifest["references"]["SPEAKER_00"]
            self.assertEqual(first_reference["sourceStart"], 0.0)
            self.assertEqual(first_reference["sourceEnd"], 2.2)
            self.assertEqual(first_reference["referenceText"], "Première voix")

            clipped = RUNTIME.clip_cues(loaded_cues, 1.0, 4.0)
            self.assertEqual(RUNTIME.cue_identity(clipped[0]), RUNTIME.cue_identity(loaded_cues[1]))

            subtitle.write_text("WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nModifié\n", encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError, "sous-titre a changé"):
                RUNTIME.load_voice_profile(
                    profile,
                    checksum,
                    source_playlist,
                    subtitle,
                    loaded_cues,
                )

    def test_continuous_reference_never_concatenates_separate_turns(self):
        selected = RUNTIME.select_continuous_reference([
            {"start": 0.0, "end": 2.0, "speaker": "SPEAKER_00"},
            {"start": 10.0, "end": 16.0, "speaker": "SPEAKER_00"},
        ])
        self.assertEqual(selected, {"start": 10.25, "end": 15.75, "duration": 5.5})

        with self.assertRaisesRegex(RuntimeError, "prise vocale continue"):
            RUNTIME.select_continuous_reference([
                {"start": 0.0, "end": 0.5, "speaker": "SPEAKER_00"},
                {"start": 1.0, "end": 1.4, "speaker": "SPEAKER_00"},
            ])

    def test_reference_rejects_transcript_that_overflows_the_speaker_turn(self):
        with self.assertRaisesRegex(RuntimeError, "strictement alignée"):
            RUNTIME.select_aligned_reference(
                [{"start": 10.0, "end": 15.0, "speaker": "SPEAKER_00"}],
                {"segments": [{
                    "start": 9.0,
                    "end": 16.0,
                    "text": "Texte qui déborde et ne correspond pas à la voix seule",
                }]},
            )

    def test_reference_uses_aligned_words_inside_a_coarse_transcript_segment(self):
        selected = RUNTIME.select_aligned_reference(
            [{"start": 10.0, "end": 15.0, "speaker": "SPEAKER_00"}],
            {"segments": [{
                "start": 9.0,
                "end": 16.0,
                "text": "Un gros segment qui déborde",
                "words": [
                    {"start": 10.5, "end": 11.4, "text": "Un"},
                    {"start": 11.5, "end": 12.4, "text": "passage"},
                    {"start": 12.5, "end": 13.4, "text": "propre"},
                ],
            }]},
        )

        self.assertEqual(selected["start"], 10.5)
        self.assertEqual(selected["end"], 13.4)

    def test_reference_does_not_cross_a_completed_sentence(self):
        selected = RUNTIME.select_aligned_reference(
            [{"start": 0.0, "end": 8.0, "speaker": "SPEAKER_00"}],
            {"segments": [{
                "start": 0.0,
                "end": 8.0,
                "text": "Question, réponse et caméra",
                "words": [
                    {"start": 0.0, "end": 0.7, "text": "Ça"},
                    {"start": 0.7, "end": 1.4, "text": "fait"},
                    {"start": 1.4, "end": 2.2, "text": "combien"},
                    {"start": 2.2, "end": 3.0, "text": "de temps ?"},
                    {"start": 3.1, "end": 3.5, "text": "Trop"},
                    {"start": 3.5, "end": 3.9, "text": "longtemps."},
                    {"start": 4.0, "end": 4.3, "text": "Ah,"},
                    {"start": 4.3, "end": 4.6, "text": "la"},
                    {"start": 4.6, "end": 5.2, "text": "GoPro."},
                ],
            }]},
        )

        self.assertEqual(selected["text"], "Ça fait combien de temps ?")
        self.assertTrue(selected["sentenceComplete"])

    def test_cues_are_split_at_speaker_boundaries_then_merged_naturally(self):
        cues = [{
            "start": 0.0, "end": 4.0, "sourceStart": 0.0, "sourceEnd": 4.0,
            "text": "Bonjour comment allez vous",
        }]
        turns = [
            {"start": 0.0, "end": 2.0, "speaker": "SPEAKER_00"},
            {"start": 2.0, "end": 4.0, "speaker": "SPEAKER_01"},
        ]
        split = RUNTIME.split_cues_at_speaker_boundaries(cues, turns)
        self.assertEqual([unit["speaker"] for unit in split], ["SPEAKER_00", "SPEAKER_01"])
        self.assertEqual([unit["text"] for unit in split], ["Bonjour comment", "allez vous"])

        merged = RUNTIME.merge_dialogue_units([
            {**split[0], "end": 1.0, "sourceEnd": 1.0, "text": "Bonjour"},
            {**split[0], "start": 1.08, "sourceStart": 1.08, "text": "comment"},
        ])
        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0]["text"], "Bonjour comment")

    def test_r4_r2_keeps_short_interjections_as_independent_dialogue_units(self):
        cues = [
            {
                "start": 28.76, "end": 31.06,
                "sourceStart": 28.76, "sourceEnd": 31.06,
                "text": "Je vous présente Xbox 360", "speaker": "SPEAKER_02",
            },
            {
                "start": 31.06, "end": 31.68,
                "sourceStart": 31.06, "sourceEnd": 31.68,
                "text": "Coucou", "speaker": "SPEAKER_02",
            },
            {
                "start": 31.68, "end": 33.40,
                "sourceStart": 31.68, "sourceEnd": 33.40,
                "text": "Ah bah là c'est original tu t'y attendais pas",
                "speaker": "SPEAKER_02",
            },
        ]

        merged = RUNTIME.merge_dialogue_units(cues)

        self.assertEqual(len(merged), 3)
        self.assertEqual([cue["text"] for cue in merged], [
            "Je vous présente Xbox 360",
            "Coucou",
            "Ah bah là c'est original tu t'y attendais pas",
        ])

    def test_short_false_speaker_islands_do_not_create_an_impossible_utterance(self):
        cues = [
            {
                "start": 142.61,
                "end": 144.01,
                "sourceStart": 142.61,
                "sourceEnd": 144.01,
                "text": "Oh ouais !",
            },
            {
                "start": 144.01,
                "end": 145.07,
                "sourceStart": 144.01,
                "sourceEnd": 145.07,
                "text": "Joseph, t'es un génie !",
            },
        ]
        turns = [
            {"start": 141.0, "end": 141.62, "speaker": "SPEAKER_02"},
            {"start": 142.61, "end": 143.013, "speaker": "SPEAKER_01"},
            {"start": 143.013, "end": 143.907, "speaker": "SPEAKER_02"},
            {"start": 143.907, "end": 144.025, "speaker": "SPEAKER_01"},
            {"start": 144.025, "end": 145.07, "speaker": "SPEAKER_02"},
        ]

        smoothed = RUNTIME.smooth_short_speaker_turns(turns)
        dialogue = RUNTIME.merge_dialogue_units(
            RUNTIME.split_cues_at_speaker_boundaries(cues, smoothed)
        )

        self.assertEqual({cue["speaker"] for cue in dialogue}, {"SPEAKER_02"})
        self.assertEqual(len(dialogue), 2)
        self.assertEqual([cue["text"] for cue in dialogue], [
            "Oh ouais !", "Joseph, t'es un génie !",
        ])

    def test_hybrid_assignment_allows_a_decisive_sortformer_correction(self):
        cues = [
            {"start": 0.0, "end": 1.0, "sourceStart": 0.0, "sourceEnd": 1.0, "text": "Réplique A"},
            {"start": 1.0, "end": 2.0, "sourceStart": 1.0, "sourceEnd": 2.0, "text": "Réplique B"},
            {"start": 2.0, "end": 3.0, "sourceStart": 2.0, "sourceEnd": 3.0, "text": "Réplique C"},
            {"start": 3.0, "end": 4.0, "sourceStart": 3.0, "sourceEnd": 4.0, "text": "Réplique D"},
        ]
        base_turns = [
            {"start": 0.0, "end": 1.0, "speaker": "SPEAKER_00"},
            {"start": 1.0, "end": 2.0, "speaker": "SPEAKER_01"},
            {"start": 2.0, "end": 3.0, "speaker": "SPEAKER_02"},
            {"start": 3.0, "end": 4.0, "speaker": "SPEAKER_01"},
        ]
        shifted_refinement = [
            {"start": 0.0, "end": 1.6, "speaker": "SPEAKER_00"},
            {"start": 1.6, "end": 2.6, "speaker": "SPEAKER_01"},
            {"start": 2.6, "end": 4.0, "speaker": "SPEAKER_01"},
        ]

        assigned = RUNTIME.assign_cue_speakers_hybrid(
            cues, base_turns, shifted_refinement
        )

        self.assertEqual(
            [cue["speaker"] for cue in assigned],
            ["SPEAKER_00", "SPEAKER_01", "SPEAKER_01", "SPEAKER_01"],
        )
        self.assertEqual([cue["text"] for cue in assigned], [
            "Réplique A", "Réplique B", "Réplique C", "Réplique D",
        ])
        self.assertEqual(len(assigned), len(cues))

    def test_word_timed_dialogue_splits_a_subtitle_into_five_speakers(self):
        cue = {
            "start": 0.0,
            "end": 5.0,
            "sourceStart": 0.0,
            "sourceEnd": 5.0,
            "text": (
                "Ça s'est arrêté avant moi, mais moi aussi, on s'est fait niquer, "
                "mouais, pépé reste un rouleau"
            ),
            "sourceWords": [
                {"start": 0.0, "end": 0.8, "text": "avant moi,"},
                {"start": 1.0, "end": 1.8, "text": "moi aussi,"},
                {"start": 2.0, "end": 2.8, "text": "niquer,"},
                {"start": 3.0, "end": 3.4, "text": "mouais,"},
                {"start": 3.6, "end": 4.8, "text": "un rouleau"},
            ],
        }
        base_turns = [{"start": 0.0, "end": 5.0, "speaker": "SPEAKER_00"}]
        refined_turns = [
            {"start": 0.0, "end": 0.9, "speaker": "SPEAKER_02"},
            {"start": 0.9, "end": 1.9, "speaker": "SPEAKER_00"},
            {"start": 1.9, "end": 2.9, "speaker": "SPEAKER_02"},
            {"start": 2.9, "end": 3.5, "speaker": "SPEAKER_01"},
            {"start": 3.5, "end": 5.0, "speaker": "SPEAKER_00"},
        ]

        units = RUNTIME.split_cues_by_word_speakers(
            [cue], base_turns, refined_turns
        )

        self.assertEqual(
            [unit["speaker"] for unit in units],
            ["SPEAKER_02", "SPEAKER_00", "SPEAKER_02", "SPEAKER_01", "SPEAKER_00"],
        )
        self.assertEqual([unit["text"] for unit in units], [
            "Ça s'est arrêté avant moi,",
            "mais moi aussi,",
            "on s'est fait niquer,",
            "mouais,",
            "pépé reste un rouleau",
        ])

    def test_punctuation_only_token_never_receives_a_speaker_or_target_words(self):
        cue = {
            "start": 295.5,
            "end": 296.7,
            "sourceStart": 295.5,
            "sourceEnd": 296.7,
            "text": "Attendez, je m'arrête.",
            "sourceWords": [
                {"start": 295.5, "end": 295.66, "text": "!"},
                {"start": 295.66, "end": 296.14, "text": "Attendez,"},
                {"start": 296.14, "end": 296.34, "text": "je"},
                {"start": 296.34, "end": 296.7, "text": "m'arrête."},
            ],
        }
        base_turns = [{"start": 295.5, "end": 295.66, "speaker": "SPEAKER_00"}, {
            "start": 295.66, "end": 296.7, "speaker": "SPEAKER_02",
        }]

        units = RUNTIME.split_cues_by_word_speakers([cue], base_turns, base_turns)

        self.assertTrue(units)
        self.assertEqual({unit["speaker"] for unit in units}, {"SPEAKER_02"})
        self.assertEqual(" ".join(unit["text"] for unit in units), "Attendez, je m'arrête.")
        self.assertAlmostEqual(units[0]["sourceStart"], 295.66)

    def test_short_punctuation_continuation_keeps_the_majority_speaker(self):
        cue = {
            "start": 7.68,
            "end": 8.54,
            "sourceStart": 7.68,
            "sourceEnd": 8.54,
            "text": "Déjà là, c'est chiant.",
            "sourceWords": [
                {"start": 7.68, "end": 7.9, "text": "Déjà"},
                {"start": 7.9, "end": 8.2, "text": "là,"},
                {"start": 8.2, "end": 8.35, "text": "c'est"},
                {"start": 8.35, "end": 8.54, "text": "chiant."},
            ],
        }
        base_turns = [
            {"start": 7.68, "end": 8.35, "speaker": "SPEAKER_01"},
            {"start": 8.35, "end": 8.54, "speaker": "SPEAKER_00"},
        ]
        refined_turns = [
            {"start": 7.68, "end": 8.35, "speaker": "SPEAKER_01"},
            {"start": 8.35, "end": 8.54, "speaker": "SPEAKER_00"},
        ]

        units = RUNTIME.split_cues_by_word_speakers(
            [cue], base_turns, refined_turns
        )

        self.assertEqual({unit["speaker"] for unit in units}, {"SPEAKER_01"})
        self.assertNotIn("chiant.", [unit["text"] for unit in units])
        self.assertEqual(
            " ".join(unit["text"] for unit in units),
            "Déjà là, c'est chiant.",
        )

    def test_sortformer_can_correct_a_genuinely_ambiguous_community_cue(self):
        cue = {
            "start": 10.0, "end": 11.0, "sourceStart": 10.0, "sourceEnd": 11.0,
            "text": "Une réplique entière",
        }
        base_turns = [
            {"start": 10.0, "end": 10.52, "speaker": "SPEAKER_00"},
            {"start": 10.52, "end": 11.0, "speaker": "SPEAKER_01"},
        ]
        refined_turns = [
            {"start": 10.0, "end": 11.0, "speaker": "SPEAKER_01"},
        ]

        assigned = RUNTIME.assign_cue_speakers_hybrid(
            [cue], base_turns, refined_turns
        )

        self.assertEqual(assigned[0]["speaker"], "SPEAKER_01")
        self.assertEqual(assigned[0]["speakerAssignment"]["source"], "sortformer")

    def test_r8_r1_also_accepts_a_real_118ms_interjection(self):
        RUNTIME.validate_synthesis_cues([{
            "start": 143.907,
            "end": 144.025,
            "sourceStart": 143.907,
            "sourceEnd": 144.025,
            "text": "! Joseph,",
            "speaker": "SPEAKER_01",
        }])

    def test_tight_valid_utterance_uses_bounded_spillover_without_excess_acceleration(self):
        timing = RUNTIME.plan_synthesis_timing({
            "start": 154.45,
            "end": 155.21,
            "sourceStart": 154.45,
            "sourceEnd": 155.21,
            "text": "Là ça arrête la voiture",
            "speaker": "SPEAKER_02",
        }, generated_duration=1.6, render_duration=180.0)

        self.assertAlmostEqual(timing["spilloverSeconds"], 1.6 / 1.3 - 0.76)
        self.assertAlmostEqual(timing["acceleration"], 1.3)
        self.assertLessEqual(timing["spilloverSeconds"], 1.0)

    def test_r4_allows_a_bounded_tail_overrun_instead_of_starting_early(self):
        timing = RUNTIME.plan_synthesis_timing({
            "start": 10.0,
            "end": 10.5,
            "text": "Une phrase beaucoup trop longue pour sa fenêtre",
            "speaker": "SPEAKER_00",
        }, generated_duration=1.8, render_duration=60.0)

        self.assertAlmostEqual(timing["acceleration"], RUNTIME.MAX_SYNTHESIS_ACCELERATION)
        self.assertAlmostEqual(timing["spilloverSeconds"], (1.8 / 1.3) - 0.5)

    def test_r4_still_blocks_an_excessive_tail_overrun(self):
        timing = RUNTIME.plan_synthesis_timing({
            "start": 10.0,
            "end": 10.5,
            "text": "Une phrase réellement trop longue pour sa fenêtre",
            "speaker": "SPEAKER_00",
        }, generated_duration=4.0, render_duration=60.0)

        self.assertGreater(timing["acceleration"], RUNTIME.MAX_SYNTHESIS_ACCELERATION)
        self.assertAlmostEqual(timing["spilloverSeconds"], 1.0)

    def test_r4_never_starts_before_the_subtitle_and_keeps_source_end_extension(self):
        cues = [
            {
                "start": 680.58,
                "end": 682.0,
                "sourceStart": 680.58,
                "sourceEnd": 682.0,
                "text": "Ça a pas secoué tant que ça par rapport à ce que la voiture a pris.",
                "speaker": "SPEAKER_00",
            },
            {
                "start": 682.5,
                "end": 683.2,
                "sourceStart": 682.5,
                "sourceEnd": 683.2,
                "text": "Réplique suivante",
                "speaker": "SPEAKER_01",
            },
        ]
        turns = [
            {"start": 680.2, "end": 682.2, "speaker": "SPEAKER_00"},
            {"start": 682.5, "end": 683.2, "speaker": "SPEAKER_01"},
        ]
        transcript = {"segments": [{
            "start": 680.25,
            "end": 682.2,
            "text": cues[0]["text"],
        }]}

        planned = RUNTIME.plan_dialogue_timing(cues, turns, transcript, 700.0)
        prepared = RUNTIME.apply_planned_voice_timing([planned[0]], 680.0, 10.0)
        timing = RUNTIME.plan_synthesis_timing(
            prepared[0], generated_duration=2.72, render_duration=10.0
        )

        self.assertAlmostEqual(planned[0]["voiceStart"], 680.58)
        self.assertAlmostEqual(planned[0]["voiceEnd"], 682.5)
        self.assertAlmostEqual(planned[0]["voiceTiming"]["plannedDuration"], 1.92)
        self.assertLessEqual(timing["acceleration"], RUNTIME.MAX_SYNTHESIS_ACCELERATION)
        self.assertAlmostEqual(timing["spilloverSeconds"], (2.72 / 1.3) - 1.92)

    def test_r4_uses_a_later_detected_speaker_onset_but_never_an_earlier_one(self):
        cues = [{
            "start": 10.0, "end": 12.0, "sourceStart": 10.0, "sourceEnd": 12.0,
            "text": "Une réplique", "speaker": "SPEAKER_00",
        }]
        later = RUNTIME.plan_dialogue_timing(cues, [
            {"start": 10.2, "end": 12.0, "speaker": "SPEAKER_00"},
        ], None, 20.0)
        earlier = RUNTIME.plan_dialogue_timing(cues, [
            {"start": 9.5, "end": 12.0, "speaker": "SPEAKER_00"},
        ], None, 20.0)

        self.assertAlmostEqual(later[0]["voiceStart"], 10.2)
        self.assertAlmostEqual(earlier[0]["voiceStart"], 10.0)

    def test_r4_r1_rejects_an_onset_that_would_leave_a_zero_length_window(self):
        cues = [{
            "start": 343.57, "end": 344.0,
            "sourceStart": 343.57, "sourceEnd": 344.0,
            "text": "Pas mal, non ? On va les vendre en description,",
            "speaker": "SPEAKER_02",
        }]
        planned = RUNTIME.plan_dialogue_timing(cues, [
            {"start": 343.999, "end": 344.0, "speaker": "SPEAKER_02"},
        ], None, 400.0)

        self.assertAlmostEqual(planned[0]["voiceStart"], 343.57)
        self.assertGreaterEqual(
            planned[0]["voiceEnd"] - planned[0]["voiceStart"],
            RUNTIME.MIN_DIALOGUE_UNIT_SECONDS,
        )
        self.assertFalse(planned[0]["voiceTiming"]["detectedSpeechStartAccepted"])

    def test_r8_r1_accepts_a_real_240ms_utterance_and_uses_timing_spillover(self):
        cue = {
            "start": 7.76,
            "end": 8.0,
            "sourceStart": 7.76,
            "sourceEnd": 8.0,
            "text": "Déjà là,",
            "speaker": "SPEAKER_01",
        }

        RUNTIME.validate_synthesis_cues([cue])
        timing = RUNTIME.plan_synthesis_timing(
            cue,
            generated_duration=0.48,
            render_duration=20.0,
        )

        self.assertAlmostEqual(timing["originalDuration"], 0.24)
        self.assertAlmostEqual(timing["fittedDuration"], 0.48 / 1.3)
        self.assertAlmostEqual(timing["spilloverSeconds"], (0.48 / 1.3) - 0.24)
        self.assertAlmostEqual(timing["acceleration"], 1.3)

    def test_r8_r1_still_rejects_a_window_shorter_than_40ms(self):
        with self.assertRaisesRegex(
            RUNTIME.DubbingInputQualityError,
            "aucune fenêtre audio exploitable",
        ):
            RUNTIME.validate_synthesis_cues([{
                "start": 7.76,
                "end": 7.78,
                "sourceStart": 7.76,
                "sourceEnd": 7.78,
                "text": "Ah !",
                "speaker": "SPEAKER_01",
            }])

    def test_r4_r2_keeps_subtitle_start_when_speaker_is_already_active(self):
        cues = [{
            "start": 28.76, "end": 33.40,
            "sourceStart": 28.76, "sourceEnd": 33.40,
            "text": "Je vous présente Xbox 360 Coucou Ah bah là c'est original",
            "speaker": "SPEAKER_02",
        }]
        turns = [
            {"start": 28.70, "end": 31.06, "speaker": "SPEAKER_02"},
            {"start": 31.672, "end": 33.40, "speaker": "SPEAKER_02"},
        ]

        planned = RUNTIME.plan_dialogue_timing(cues, turns, {
            "segments": [{
                "start": 31.672,
                "end": 33.40,
                "text": "Ah bah là c'est original",
            }],
        }, 60.0)

        self.assertAlmostEqual(planned[0]["voiceStart"], 28.76)
        self.assertTrue(planned[0]["voiceTiming"]["speakerActiveAtSubtitleStart"])
        self.assertFalse(planned[0]["voiceTiming"]["detectedSpeechStartAccepted"])
        self.assertGreaterEqual(planned[0]["voiceTiming"]["plannedDuration"], 4.64)

    def test_r4_r2_rejects_a_detected_onset_delayed_by_more_than_250ms(self):
        cues = [{
            "start": 10.0, "end": 12.0,
            "sourceStart": 10.0, "sourceEnd": 12.0,
            "text": "Une réplique", "speaker": "SPEAKER_00",
        }]

        planned = RUNTIME.plan_dialogue_timing(cues, [
            {"start": 10.35, "end": 12.0, "speaker": "SPEAKER_00"},
        ], None, 20.0)

        self.assertAlmostEqual(planned[0]["voiceStart"], 10.0)
        self.assertFalse(planned[0]["voiceTiming"]["detectedSpeechStartAccepted"])

    def test_r4_r2_accepts_a_subframe_shortfall_at_the_preview_boundary(self):
        timing = RUNTIME.plan_synthesis_timing({
            "start": 41.52,
            "end": 45.0,
            "sourceStart": 41.52,
            "sourceEnd": 44.5,
            "text": "The Commission has also adopted a proposal",
            "speaker": "SPEAKER_00",
        }, generated_duration=5.221, render_duration=45.0)

        self.assertGreater(timing["acceleration"], RUNTIME.MAX_SYNTHESIS_ACCELERATION)
        self.assertGreater(timing["boundaryTrimSeconds"], 0.0)

    def test_short_qwen_replies_are_generated_without_sampling(self):
        class FakeQwen:
            def __init__(self):
                self.options = None

            def generate_voice_clone(self, **options):
                self.options = options
                return [[0.0]], 24000

        model = FakeQwen()
        RUNTIME.generate_voice({
            "engine": "qwen3-tts",
            "model": model,
            "prompts": {"SPEAKER_00": "prompt"},
        }, "Ah ouais.", "fr", "SPEAKER_00", {}, attempt=0)

        self.assertFalse(model.options["do_sample"])
        self.assertNotIn("temperature", model.options)
        self.assertNotIn("top_p", model.options)

    def test_v5_short_qwen_replies_keep_historical_sampling(self):
        class FakeQwen:
            def __init__(self):
                self.options = None

            def generate_voice_clone(self, **options):
                self.options = options
                return [[0.0]], 24000

        model = FakeQwen()
        RUNTIME.generate_voice({
            "engine": "qwen3-tts",
            "model": model,
            "prompts": {"SPEAKER_00": "prompt"},
        }, "Ah ouais.", "fr", "SPEAKER_00", {}, attempt=0,
            profile=RUNTIME.V5_ALIGNED_QUALITY_PROFILE)

        self.assertTrue(model.options["do_sample"])
        self.assertEqual(model.options["temperature"], 0.65)
        self.assertEqual(model.options["top_p"], 0.85)

    def test_short_qwen_retry_uses_a_seeded_low_variance_alternative(self):
        class FakeQwen:
            def __init__(self):
                self.options = None

            def generate_voice_clone(self, **options):
                self.options = options
                return [[0.0]], 24000

        model = FakeQwen()
        RUNTIME.generate_voice({
            "engine": "qwen3-tts",
            "model": model,
            "prompts": {"SPEAKER_00": "prompt"},
        }, "Chiant.", "fr", "SPEAKER_00", {}, attempt=1)

        self.assertTrue(model.options["do_sample"])
        self.assertEqual(model.options["temperature"], 0.35)
        self.assertEqual(model.options["top_p"], 0.75)

    def test_best_short_attempt_prefers_transcript_then_duration(self):
        candidates = [{
            "diagnostic": {
                "cer": 1.667,
                "durationRatio": 1.1,
                "timingExtensionSeconds": 0.4,
                "generatedDuration": 1.2,
                "attempts": 1,
            },
        }, {
            "diagnostic": {
                "cer": 0.0,
                "durationRatio": 1.2,
                "timingExtensionSeconds": 0.6,
                "generatedDuration": 1.5,
                "attempts": 2,
            },
        }]

        selected = min(candidates, key=RUNTIME.short_synthesis_candidate_score)

        self.assertEqual(selected["diagnostic"]["attempts"], 2)

    def test_long_qwen_replies_keep_controlled_sampling(self):
        class FakeQwen:
            def __init__(self):
                self.options = None

            def generate_voice_clone(self, **options):
                self.options = options
                return [[0.0]], 24000

        model = FakeQwen()
        RUNTIME.generate_voice({
            "engine": "qwen3-tts",
            "model": model,
            "prompts": {"SPEAKER_00": "prompt"},
        }, "Cette phrase contient plus de quatre mots.", "fr", "SPEAKER_00", {}, attempt=0)

        self.assertTrue(model.options["do_sample"])
        self.assertEqual(model.options["temperature"], 0.65)

    def test_fitted_voice_uses_short_edge_fades_before_padding(self):
        filters = RUNTIME.synthesis_fit_filter(1.3, 1.3, 1.2)

        self.assertIn("afade=t=in:st=0:d=0.0080", filters)
        self.assertIn("afade=t=out:st=0.9650:d=0.0350", filters)
        self.assertLess(filters.index("afade=t=out"), filters.index("apad="))

    def test_rejected_reference_range_is_excluded_from_the_next_selection(self):
        turns = [{"start": 0.0, "end": 12.0, "speaker": "SPEAKER_00"}]
        transcript = {"segments": [
            {"start": 0.0, "end": 4.0, "text": "Première référence pourtant propre"},
            {"start": 5.0, "end": 9.0, "text": "Deuxième référence vocale propre"},
        ]}
        selected = RUNTIME.select_aligned_reference(
            turns,
            transcript,
            consensus_turns=turns,
            rejected_ranges=[{"sourceStart": 0.0, "sourceEnd": 4.0}],
        )
        self.assertEqual(selected["start"], 5.0)
        self.assertEqual(selected["end"], 9.0)

    def test_reference_requires_same_speaker_consensus(self):
        with self.assertRaisesRegex(RuntimeError, "strictement alignée"):
            RUNTIME.select_aligned_reference(
                [{"start": 0.0, "end": 5.0, "speaker": "SPEAKER_00"}],
                {"segments": [{"start": 0.0, "end": 4.0, "text": "Référence mélangée"}]},
                consensus_turns=[
                    {"start": 0.0, "end": 2.0, "speaker": "SPEAKER_00"},
                    {"start": 2.0, "end": 4.0, "speaker": "SPEAKER_01"},
                ],
            )

    def test_r4_never_slows_a_short_synthesis_to_fill_a_long_window(self):
        timing = RUNTIME.plan_synthesis_timing({
            "start": 0.0,
            "end": 2.0,
            "text": "Phrase courte",
            "speaker": "SPEAKER_00",
        }, generated_duration=1.0, render_duration=5.0)

        self.assertEqual(timing["acceleration"], 1.0)
        self.assertEqual(timing["fittedDuration"], 2.0)

    def test_r4_retries_short_asr_disagreement_without_blocking_forever(self):
        first = RUNTIME.transcript_quality_decision(
            "niquer il", "nickel", 0.375, attempt=0
        )
        last = RUNTIME.transcript_quality_decision(
            "niquer il", "nickel", 0.375, attempt=2
        )
        missing = RUNTIME.transcript_quality_decision(
            "bonjour", "", 1.0, attempt=2
        )
        repeated = RUNTIME.transcript_quality_decision(
            "une phrase ultra compétitive répétée",
            "ultra compétitif ultra compétitif",
            0.7,
            attempt=2,
        )

        self.assertFalse(first["accepted"])
        self.assertTrue(last["accepted"])
        self.assertTrue(missing["blocking"])
        self.assertTrue(repeated["blocking"])

    def test_r6_still_blocks_a_short_prompt_that_hallucinates_a_long_repetition(self):
        decision = RUNTIME.transcript_quality_decision(
            "Ultra compétitif",
            "ultra compétitif ultra compétitif ultra compétitif ultra compétitif",
            3.0,
            attempt=2,
        )

        self.assertTrue(decision["shortUtterance"])
        self.assertTrue(decision["excessiveExpansion"])
        self.assertTrue(decision["blocking"])
        self.assertFalse(decision["accepted"])

    def test_r8_r2_downgrades_physically_impossible_short_asr_to_a_warning(self):
        first = RUNTIME.transcript_quality_decision(
            "Ah ouais.",
            "Ah oui alors voici une très longue phrase inventée par le contrôle",
            5.714,
            attempt=0,
            generated_duration=0.323,
            acoustic_evidence={"hasSpeech": True},
        )
        last = RUNTIME.transcript_quality_decision(
            "Ah ouais.",
            "Ah oui alors voici une très longue phrase inventée par le contrôle",
            5.714,
            attempt=2,
            generated_duration=0.323,
            acoustic_evidence={"hasSpeech": True},
        )

        self.assertTrue(last["shortUtterance"])
        self.assertTrue(last["excessiveExpansion"])
        self.assertTrue(last["asrUnreliable"])
        self.assertFalse(last["blocking"])
        self.assertTrue(first["accepted"])
        self.assertTrue(last["accepted"])

    def test_r8_r2_still_blocks_a_plausible_real_tts_expansion(self):
        decision = RUNTIME.transcript_quality_decision(
            "Ah ouais.",
            "Ah oui alors voici une très longue phrase réellement générée plusieurs fois",
            5.714,
            attempt=2,
            generated_duration=5.0,
            acoustic_evidence={"hasSpeech": True},
        )

        self.assertFalse(decision["asrUnreliable"])
        self.assertTrue(decision["blocking"])
        self.assertFalse(decision["accepted"])

    def test_r8_r3_accepts_empty_asr_for_an_acoustically_valid_micro_reply(self):
        first = RUNTIME.transcript_quality_decision(
            "Ouais.", "", 1.0, attempt=0, generated_duration=0.282,
            acoustic_evidence={"hasSpeech": True},
        )
        last = RUNTIME.transcript_quality_decision(
            "Ouais.", "", 1.0, attempt=2, generated_duration=0.282,
            acoustic_evidence={"hasSpeech": True},
        )

        self.assertTrue(last["shortUtterance"])
        self.assertTrue(last["asrUnreliable"])
        self.assertTrue(last["acousticSpeechPresent"])
        self.assertFalse(last["blocking"])
        self.assertTrue(first["accepted"])
        self.assertTrue(last["accepted"])

    def test_r8_r3_still_blocks_empty_asr_when_generated_audio_is_silent(self):
        decision = RUNTIME.transcript_quality_decision(
            "Ouais.", "", 1.0, attempt=2, generated_duration=0.282,
            acoustic_evidence={"hasSpeech": False},
        )

        self.assertFalse(decision["asrUnreliable"])
        self.assertTrue(decision["blocking"])
        self.assertFalse(decision["accepted"])

    def test_r8_r3_detects_activity_in_a_282ms_voice_like_waveform(self):
        with tempfile.TemporaryDirectory() as directory:
            audio_path = Path(directory) / "ouais.wav"
            sample_rate = 16000
            sample_count = round(sample_rate * 0.282)
            frames = b"".join(
                struct.pack(
                    "<h",
                    round(0.2 * 32767 * math.sin(2 * math.pi * 220 * index / sample_rate)),
                )
                for index in range(sample_count)
            )
            with wave.open(str(audio_path), "wb") as output:
                output.setnchannels(1)
                output.setsampwidth(2)
                output.setframerate(sample_rate)
                output.writeframes(frames)

            activity = RUNTIME.generated_audio_activity(audio_path)

        self.assertTrue(activity["hasSpeech"])
        self.assertAlmostEqual(activity["duration"], 0.282, places=3)
        self.assertGreater(activity["activeSeconds"], 0.2)

    def test_r6_treats_a_short_spelled_number_as_an_interjection(self):
        first = RUNTIME.transcript_quality_decision(
            "Allez, cinquante-cinq !", "Allez 55", 0.722, attempt=0
        )
        last = RUNTIME.transcript_quality_decision(
            "Allez, cinquante-cinq !", "Allez 55", 0.722, attempt=2
        )

        self.assertEqual(first["lexicalUnitCount"], 3)
        self.assertTrue(first["shortUtterance"])
        self.assertFalse(first["blocking"])
        self.assertFalse(first["accepted"])
        self.assertTrue(last["accepted"])


if __name__ == "__main__":
    unittest.main()
