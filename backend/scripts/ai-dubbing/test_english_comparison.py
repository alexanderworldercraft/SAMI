import io
import sys
import tempfile
import unittest
from contextlib import redirect_stderr
from pathlib import Path
from unittest import mock

import runtime as rt
import compare_english as comparison
import test_japanese_identity as fixtures


class EnglishComparisonTest(unittest.TestCase):
    def inputs(self, root):
        reference = fixtures.ComparisonInputTest.make_inputs(self, root)
        for name in ("quality-failure.json", "generation-attempt.json", "input-profile.json"):
            doc = rt.load_json(root / name)
            doc.update(pipelineVersion=comparison.PROFILE,
                       generationConfigHash=rt.PROFILE_GENERATION_CONFIG_HASHES[comparison.PROFILE])
            if name == "quality-failure.json":
                doc["cue"]["text"] = "Oh, yeah. Yeah, I got it."
            if name == "generation-attempt.json":
                doc.update(language="en", text="Oh, yeah. Yeah, I got it.")
            rt.write_json(root / name, doc)
        return reference

    def test_preflight_is_read_only_and_checks_language_reference_and_profile(self):
        with tempfile.TemporaryDirectory() as directory, mock.patch.object(rt, "load_voice_model") as load:
            root = Path(directory)
            reference = self.inputs(root)
            report = comparison.compare_variant(root, root, reference, root / "out", "speaker-identity", True)
            self.assertEqual(report["diagnosticOverrides"]["promptPolicy"], "speaker-embedding-only")
            self.assertNotIn("generationConfigHash", report)  # not a production configuration
            self.assertFalse((root / "out").exists())
            load.assert_not_called()
            generation = rt.load_json(root / "generation-attempt.json")
            generation["language"] = "ja"
            rt.write_json(root / "generation-attempt.json", generation)
            with self.assertRaisesRegex(ValueError, "langue en"):
                comparison.compare_variant(root, root, reference, root / "out", "reference-text", True)

    def test_only_prompt_changes_and_watchdog_diagnostic_is_truthful(self):
        with tempfile.TemporaryDirectory() as directory, \
                mock.patch.dict(rt.os.environ, {"SAMI_DUBBING_WATCHDOG_PROTOCOL": "1"}), \
                mock.patch.dict(sys.modules, {"torch": mock.Mock()}), redirect_stderr(io.StringIO()):
            root = Path(directory)
            reference_path = self.inputs(root)
            reference = {"path": reference_path, "text": "Oui."}
            cue = rt.load_json(root / "quality-failure.json")["cue"]
            qwen = mock.Mock()
            qwen.create_voice_clone_prompt.return_value = "identity"
            qwen.generate_voice_clone.return_value = (["wave"], 24000)
            model = {"engine": "qwen3-tts", "model": qwen, "prompts": {cue["speaker"]: "icl"}}
            for attempt in range(3):
                options = []
                for variant in ("reference-text", "speaker-identity"):
                    comparison.generate_attempt(model, cue, reference, variant, attempt, 123 + attempt, root)
                    kwargs = dict(qwen.generate_voice_clone.call_args.kwargs)
                    self.assertEqual(kwargs.pop("voice_clone_prompt"), "icl" if variant == "reference-text" else "identity")
                    options.append(kwargs)
                    doc = rt.load_json(root / "generation-attempt.json")
                    self.assertEqual(doc["details"]["comparisonVariant"], variant)
                    self.assertTrue(doc["details"]["diagnosticOnly"])
                    self.assertEqual(doc["timeoutSeconds"], 600)
                self.assertEqual(*options)
                self.assertNotIn("max_new_tokens", options[0])
                self.assertEqual(options[0]["language"], "English")
            qwen.create_voice_clone_prompt.assert_called_once_with(ref_audio=str(reference_path), ref_text=None, x_vector_only_mode=True)
            self.assertEqual(model["prompts"], {cue["speaker"]: "icl"})
            self.assertEqual(reference["text"], "Oui.")

    def test_six_outputs_paired_seeds_and_bad_recognition_remains_visible(self):
        with tempfile.TemporaryDirectory() as directory, \
                mock.patch.dict(rt.os.environ, {"HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1", "SAMI_DUBBING_WATCHDOG_PROTOCOL": "1"}), \
                mock.patch.dict(sys.modules, {"torch": mock.Mock()}), \
                mock.patch.object(rt, "install_manifest", return_value={"voiceEngine": "qwen3-tts", "models": {"voice": {"repo": "Qwen/test", "revision": "revision"}}}), \
                mock.patch.object(rt, "load_voice_model"), mock.patch.object(rt, "load_quality_model"), \
                mock.patch.object(rt, "save_generated_audio", side_effect=lambda wave, sr, dest: dest.write_bytes(b"synthetic")), \
                mock.patch.object(rt, "media_duration", return_value=1.6), \
                mock.patch.object(rt, "transcribe_quality", return_value="That's it. Yeah, yeah, I got it."), \
                mock.patch.object(rt, "generated_audio_activity", return_value={"hasSpeech": True}), redirect_stderr(io.StringIO()):
            root = Path(directory)
            reference = self.inputs(root)
            def generate(model, cue, ref, variant, attempt, seed, output):
                rt.write_json(output / "generation-attempt.json", {"seed": seed})
                return "wave", 24000
            with mock.patch.object(comparison, "generate_attempt", side_effect=generate) as generate_mock:
                reports = [comparison.compare_variant(root, root, reference, root / v, v)
                           for v in ("reference-text", "speaker-identity")]
            self.assertEqual(generate_mock.call_count, 6)
            for report in reports:
                self.assertEqual([a["seed"] for a in report["attempts"]], [123, 124, 125])
                self.assertTrue(all(not a["textCheck"]["passed"] for a in report["attempts"]))
                for attempt in report["attempts"]:
                    self.assertTrue((root / report["variant"] / attempt["audio"]).exists())
            self.assertEqual(reference.read_bytes(), b"original reference")


if __name__ == "__main__":
    unittest.main()
