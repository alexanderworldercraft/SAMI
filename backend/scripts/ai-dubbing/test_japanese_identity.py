import copy
import io
import tempfile
import sys
import subprocess
import unittest
from contextlib import redirect_stderr
from pathlib import Path
from unittest import mock

import runtime as rt
import compare_japanese as comparison


class JapaneseIdentityTest(unittest.TestCase):
    def test_prompt_is_cached_separately_and_does_not_change_fr_en_or_old_ja(self):
        with tempfile.TemporaryDirectory() as directory:
            reference = {"path": Path(directory) / "reference.wav", "text": "Un, deux, sept."}
            reference["path"].write_bytes(b"original")
            model = mock.Mock()
            model.create_voice_clone_prompt.return_value = "identity"
            model.generate_voice_clone.return_value = (["wave"], 24000)
            runtime = {"engine": "qwen3-tts", "model": model, "prompts": {"SPEAKER_01": "icl"}}
            for language in ("fr", "en"):
                text = "A short line."
                rt.generate_voice_unwatched(runtime, text, language, "SPEAKER_01", reference, profile=rt.V5_BOUNDED_SAMPLES_PROFILE)
                old_call = model.generate_voice_clone.call_args
                rt.generate_voice_unwatched(runtime, text, language, "SPEAKER_01", reference, profile=rt.V5_JAPANESE_IDENTITY_PROFILE)
                self.assertEqual(model.generate_voice_clone.call_args, old_call)
            model.create_voice_clone_prompt.assert_not_called()
            for profile, prompt in [(rt.V5_JAPANESE_IDENTITY_PROFILE, "identity"),
                                    (rt.V5_BOUNDED_SAMPLES_PROFILE, "icl"),
                                    (rt.V5_JAPANESE_IDENTITY_PROFILE, "identity")]:
                rt.generate_voice_unwatched(runtime, "はい。", "ja", "SPEAKER_01", reference, profile=profile)
                self.assertEqual(model.generate_voice_clone.call_args.kwargs["voice_clone_prompt"], prompt)
            model.create_voice_clone_prompt.assert_called_once_with(ref_audio=str(reference["path"]), ref_text=None, x_vector_only_mode=True)
            self.assertEqual(runtime["prompts"], {"SPEAKER_01": "icl"})
            self.assertEqual(reference["text"], "Un, deux, sept.")
            self.assertEqual(reference["path"].read_bytes(), b"original")

    def test_kana_variants_are_folded_but_not_arbitrary_kanji(self):
        decision = rt.japanese_quality_decision("ワトソンさん", "わとそんさん", 1.2, {"hasSpeech": True})
        self.assertTrue(decision["confirmed"])
        self.assertEqual(decision["cer"], 0)
        self.assertNotEqual(rt.normalized_japanese_speech("二十五"), rt.normalized_japanese_speech("にじゅうご"))

    def test_short_policy_counts_characters_not_script_groups_or_digits(self):
        for text in ("ここには何もありませんでした。", "これは5人でやってみませんか"):
            result = rt.japanese_quality_decision(text, "違う", 1, {"hasSpeech": True})
            self.assertFalse(result["shortUtterance"])
            self.assertFalse(result["reviewCandidate"])

    def test_unconfirmed_nine_second_short_text_is_rejected_but_confirmed_tail_is_allowed(self):
        failed = rt.japanese_quality_decision("5人か?", "", 9.28, {"hasSpeech": True})
        self.assertFalse(failed["reviewCandidate"])
        self.assertEqual(failed["rejectionReason"], "unconfirmed-short-duration")
        confirmed = rt.japanese_quality_decision("5人か?", "5人か", 2.8, {"hasSpeech": True})
        self.assertTrue(confirmed["confirmed"])

    def test_empty_short_asr_needs_bounded_acoustic_evidence_and_expansion_cannot_pass(self):
        self.assertTrue(rt.japanese_quality_decision("はい。", "", .28, {"hasSpeech": True})["reviewCandidate"])
        self.assertFalse(rt.japanese_quality_decision("はい。", "", .28, {"hasSpeech": False})["reviewCandidate"])
        self.assertFalse(rt.japanese_quality_decision("はい。", "セット" * 10, .28, {"hasSpeech": True})["reviewCandidate"])

    def run_cue(self, text, recognized, duration, window=.5, should_fail=False, profile=rt.V5_JAPANESE_IDENTITY_PROFILE):
        with tempfile.TemporaryDirectory() as directory, \
                mock.patch.object(rt, "generate_voice", return_value=("wave", 24000)), \
                mock.patch.object(rt, "seed_synthesis", return_value=123), \
                mock.patch.object(rt, "save_generated_audio", side_effect=lambda wave, sr, dest: dest.write_bytes(b"audio")), \
                mock.patch.object(rt, "media_duration", return_value=duration), \
                mock.patch.object(rt, "generated_audio_activity", return_value={"hasSpeech": True}), \
                mock.patch.object(rt, "transcribe_quality", return_value=recognized) as transcribe, \
                mock.patch.object(rt, "preserve_rejected_audio", return_value={"diagnostic": True}), \
                mock.patch.object(rt, "run"), redirect_stderr(io.StringIO()):
            root = Path(directory)
            cue = {"start": 231.56, "end": 231.56 + window, "sourceStart": 231.56,
                   "sourceEnd": 231.56 + window, "speaker": "SPEAKER_01", "text": text}
            snapshot = copy.deepcopy(cue)
            generator = rt.synthesize_cues_v5({}, {}, [cue], "ja", {"SPEAKER_01": {}}, root, "hash", profile, 310)
            if should_fail:
                with self.assertRaisesRegex(rt.DubbingInputQualityError, "dialogue non conforme"):
                    list(generator)
                result = rt.load_json(root / "quality-failure.json")
            else:
                result = list(generator)
            self.assertEqual(cue, snapshot)
            return result, transcribe.call_count

    def test_every_micro_cue_is_checked_even_when_it_fits(self):
        result, count = self.run_cue("はい。", "はい", .28)
        self.assertEqual(count, 1)
        self.assertEqual(result[0][0]["start"], 231.56)

    def test_unconfirmed_micro_cue_is_ranked_after_three_attempts_not_first(self):
        result, count = self.run_cue("はい。", "", .28)
        self.assertEqual(count, 3)
        self.assertTrue(result[-1][2]["warnings"][0]["shortCerMismatchAccepted"])

    def test_huge_micro_cue_now_blocks_in_full_path(self):
        result, count = self.run_cue("5人か?", "", 9.28, should_fail=True)
        self.assertEqual(count, 3)
        self.assertEqual(result["diagnostic"]["rejectionReason"], "unconfirmed-short-duration")

    def test_actual_failed_japanese_phrase_is_not_accepted_by_flexible_tail(self):
        result, count = self.run_cue("じゃあ,これらを外して,大丈夫だ.", "せーのせーの シェスト シェスト" * 3,
                                     10.96, window=2.4, should_fail=True)
        self.assertEqual(count, 3)
        self.assertAlmostEqual(result["diagnostic"]["fittedDuration"], 7.306667)
        self.assertFalse(result["diagnostic"]["blockedByMediaEnd"])

    def test_confirmed_text_keeps_flexible_end_and_fixed_start(self):
        result, count = self.run_cue("はい。", "はい", 1.12, window=.271)
        self.assertEqual(count, 1)
        self.assertEqual(result[0][0]["start"], 231.56)
        self.assertGreater(result[0][0]["end"], 231.56 + .271)

    def test_error_distinguishes_media_end_from_quality(self):
        cue = {"sourceStart": 10, "speaker": "SPEAKER_00", "text": "はい。"}
        diagnostic = {"durationRatio": 1.5, "cer": 0, "blockedByMediaEnd": True, "fittedDuration": 1}
        self.assertIn("durée incompatible avec la fin de la vidéo", rt.v5_quality_failure_message(cue, .2, 1.5, diagnostic))


class ComparisonInputTest(unittest.TestCase):
    def make_inputs(self, root):
        reference = root / "original.wav"
        reference.write_bytes(b"original reference")
        cue = {"speaker": "SPEAKER_01", "text": "はい。", "start": 2, "end": 3, "sourceStart": 2}
        profile = rt.V5_BOUNDED_SAMPLES_PROFILE
        common = {"pipelineVersion": profile, "generationConfigHash": rt.PROFILE_GENERATION_CONFIG_HASHES[profile]}
        generation = {**common, "language": "ja", "operation": "cue", "speaker": "SPEAKER_01", "text": "はい。",
            "sourceStart": 2, "seed": 123, "details": {"referenceSha256": rt.digest(reference), "referenceText": "Oui."}}
        manifest = {**common, "voiceModel": "Qwen/test", "voiceModelRevision": "revision",
            "references": {"SPEAKER_01": {"sha256": rt.digest(reference), "referenceText": "Oui."}}}
        rt.write_json(root / "quality-failure.json", {**common, "cue": cue})
        rt.write_json(root / "generation-attempt.json", generation)
        rt.write_json(root / "input-profile.json", manifest)
        return reference

    def test_preflight_does_not_load_models_or_create_output(self):
        with tempfile.TemporaryDirectory() as directory, mock.patch.object(rt, "load_voice_model") as load:
            root = Path(directory)
            reference = self.make_inputs(root)
            report = comparison.compare_variant(root, root, reference, root / "output", "speaker-identity", True)
            self.assertEqual(report["sourceSeed"], 123)
            self.assertTrue(report["diagnosticOnly"])
            load.assert_not_called()
            self.assertFalse((root / "output").exists())
            reference.write_bytes(b"wrong reference")
            with self.assertRaisesRegex(ValueError, "référence exacte"):
                comparison.read_comparison_inputs(root, reference)

    def test_preflight_prints_lossless_json_with_legacy_windows_stdio(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            reference = self.make_inputs(root)
            completed = subprocess.run([
                sys.executable, str(Path(comparison.__file__)), "--root", str(root),
                "--failure", str(root), "--reference", str(reference),
                "--output", str(root / "unused-output"), "--variant", "reference-text", "--check-only",
            ], env={**rt.os.environ, "PYTHONIOENCODING": "cp1252", "PYTHONUTF8": "0"},
                capture_output=True, timeout=10)
            self.assertEqual(completed.returncode, 0, completed.stderr.decode("cp1252"))
            report = rt.json.loads(completed.stdout.decode("ascii"))
            self.assertEqual(report["cue"]["text"], "はい。")
            self.assertFalse((root / "unused-output").exists())

    def test_mixed_archive_is_refused(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            reference = self.make_inputs(root)
            generation = rt.load_json(root / "generation-attempt.json")
            generation["text"] = "別の文"
            rt.write_json(root / "generation-attempt.json", generation)
            with self.assertRaisesRegex(ValueError, "même réplique"):
                comparison.read_comparison_inputs(root, reference)

    def test_comparison_pairs_seeds_and_keeps_all_six_attempts_even_on_bad_quality(self):
        with tempfile.TemporaryDirectory() as directory, \
                mock.patch.dict(rt.os.environ, {"HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1", "SAMI_DUBBING_WATCHDOG_PROTOCOL": "1"}), \
                mock.patch.dict(sys.modules, {"torch": mock.Mock()}), \
                mock.patch.object(rt, "install_manifest", return_value={"voiceEngine": "qwen3-tts", "models": {"voice": {"repo": "Qwen/test", "revision": "revision"}}}), \
                mock.patch.object(rt, "load_voice_model"), mock.patch.object(rt, "load_quality_model"), \
                mock.patch.object(rt, "save_generated_audio", side_effect=lambda wave, sr, dest: dest.write_bytes(b"synthetic")), \
                mock.patch.object(rt, "media_duration", return_value=10.96), \
                mock.patch.object(rt, "transcribe_quality", return_value="セット" * 10), \
                mock.patch.object(rt, "generated_audio_activity", return_value={"hasSpeech": True}), redirect_stderr(io.StringIO()):
            root = Path(directory)
            reference = self.make_inputs(root)
            def generate(*args, **kwargs):
                context = kwargs["watch_context"]
                rt.write_json(context["workspace"] / "generation-attempt.json", {"seed": context["seed"], "state": "completed"})
                return "wave", 24000
            with mock.patch.object(rt, "generate_voice", side_effect=generate) as synthesis:
                reports = [comparison.compare_variant(root, root, reference, root / variant, variant)
                           for variant in ("reference-text", "speaker-identity")]
            self.assertEqual(synthesis.call_count, 6)
            for report in reports:
                self.assertEqual([a["seed"] for a in report["attempts"]], [123, 124, 125])
                self.assertTrue(all(not a["qualityR5R2"]["confirmed"] for a in report["attempts"]))
                for index in range(1, 4):
                    self.assertTrue((root / report["variant"] / f"generation-attempt-{index}.json").exists())
                    self.assertTrue((root / report["variant"] / f"AI-diagnostic-attempt-{index}.wav").exists())
            self.assertEqual(reference.read_bytes(), b"original reference")


if __name__ == "__main__":
    unittest.main()
