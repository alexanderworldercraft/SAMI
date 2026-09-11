import io
import tempfile
import unittest
from contextlib import redirect_stderr
from pathlib import Path
from unittest import mock

import runtime as rt


class EnglishIdentityTest(unittest.TestCase):
    def test_r4_changes_only_english_prompt_and_keeps_other_generation_options(self):
        with tempfile.TemporaryDirectory() as directory:
            reference = {"path": Path(directory) / "ref.wav", "text": "Un, deux, sept."}
            reference["path"].write_bytes(b"reference")
            qwen = mock.Mock()
            qwen.create_voice_clone_prompt.return_value = "identity"
            qwen.generate_voice_clone.return_value = (["wave"], 24000)
            model = {"engine": "qwen3-tts", "model": qwen, "prompts": {"SPEAKER_01": "icl"}}
            for language in ("fr", "en", "ja"):
                for text in ("Oui.", "Oh, yeah. Yeah, I got it."):
                    for attempt in range(3):
                        calls = []
                        for profile in (rt.V5_JAPANESE_BOUNDED_PROFILE, rt.V5_ENGLISH_IDENTITY_PROFILE):
                            rt.generate_voice_unwatched(model, text, language, "SPEAKER_01", reference, attempt, profile)
                            calls.append(dict(qwen.generate_voice_clone.call_args.kwargs))
                        if language == "en":
                            self.assertEqual(calls[0].pop("voice_clone_prompt"), "icl")
                            self.assertEqual(calls[1].pop("voice_clone_prompt"), "identity")
                        self.assertEqual(*calls)
                        self.assertEqual("max_new_tokens" in calls[1], language == "ja")
            self.assertEqual(model["prompts"]["SPEAKER_01"], "icl")
            qwen.create_voice_clone_prompt.assert_called_once_with(ref_audio=str(reference["path"]), ref_text=None, x_vector_only_mode=True)

    def test_sample_and_cue_supervision_reports_english_identity_without_japanese_guard(self):
        with tempfile.TemporaryDirectory() as directory, \
                mock.patch.dict(rt.os.environ, {"SAMI_DUBBING_WATCHDOG_PROTOCOL": "1"}), \
                mock.patch.object(rt, "generate_voice_unwatched", return_value=("wave", 24000)) as generate, \
                mock.patch.object(rt, "bounded_japanese_generation", return_value=("jp", 24000)) as bounded, redirect_stderr(io.StringIO()):
            root = Path(directory)
            reference = {"path": root / "ref.wav", "text": "Oui."}
            reference["path"].write_bytes(b"reference")
            for kind in ("sample", "cue"):
                for language in ("en", "ja", "fr"):
                    generate.reset_mock(); bounded.reset_mock()
                    rt.generate_voice({"engine": "qwen3-tts"}, "Hello.", language, "SPEAKER_01", reference,
                        profile=rt.V5_ENGLISH_IDENTITY_PROFILE, watch_context={"workspace": root,
                            "kind": kind, "progress": 50, "source_start": 184.64, "seed": 1})
                    self.assertEqual(bounded.call_count, int(language == "ja"))
                    self.assertEqual(generate.call_count, int(language != "ja"))
                    diagnostic = rt.load_json(root / "generation-attempt.json")
                    self.assertEqual(diagnostic["pipelineVersion"], rt.V5_ENGLISH_IDENTITY_PROFILE)
                    self.assertEqual(diagnostic["details"]["promptPolicy"],
                                     "reference-audio-and-text" if language == "fr" else "speaker-embedding-only")
                    self.assertEqual(diagnostic["timeoutSeconds"], 180 if kind == "sample" else 600)

    def test_english_does_not_use_japanese_qc_or_relax_blocking_threshold(self):
        with tempfile.TemporaryDirectory() as directory, \
                mock.patch.object(rt, "generate_voice", return_value=("wave", 24000)), \
                mock.patch.object(rt, "seed_synthesis", return_value=1), \
                mock.patch.object(rt, "save_generated_audio", side_effect=lambda wave, sr, dest: dest.write_bytes(b"wave")), \
                mock.patch.object(rt, "media_duration", return_value=1.6), \
                mock.patch.object(rt, "transcribe_quality", return_value="That's it. Yeah, yeah, I got it."), \
                mock.patch.object(rt, "japanese_quality_decision") as japanese_qc, \
                mock.patch.object(rt, "preserve_rejected_audio", return_value={}), redirect_stderr(io.StringIO()):
            cue = {"start": 184.64, "end": 185.84, "sourceStart": 184.64,
                   "sourceEnd": 185.84, "speaker": "SPEAKER_01", "text": "Oh, yeah. Yeah, I got it."}
            with self.assertRaisesRegex(rt.DubbingInputQualityError, "dialogue non conforme"):
                list(rt.synthesize_cues_v5({}, {}, [cue], "en", {"SPEAKER_01": {}},
                    Path(directory), "hash", rt.V5_ENGLISH_IDENTITY_PROFILE, 310))
            japanese_qc.assert_not_called()
            failure = rt.load_json(Path(directory) / "quality-failure.json")
            self.assertEqual(failure["diagnostic"]["cer"], .375)
            self.assertEqual(failure["diagnostic"]["attempts"], 3)
            self.assertFalse(failure["diagnostic"]["blockedByMediaEnd"])


if __name__ == "__main__":
    unittest.main()
