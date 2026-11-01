"""Verify actual Qwen prompt arguments without loading model weights."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest import mock

SPEC = importlib.util.spec_from_file_location("voice_modes_runtime", Path(__file__).with_name("runtime.py"))
rt = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(rt)


class VoiceModesTest(unittest.TestCase):
    def test_explicit_modes_override_every_language_and_historical_identity_profile(self):
        with tempfile.TemporaryDirectory() as directory:
            reference = {"path": Path(directory) / "reference.wav", "text": "Texte source exact."}
            for mode in ("natural", "faithful"):
                model = mock.Mock()
                model.create_voice_clone_prompt.return_value = f"{mode}-prompt"
                model.generate_voice_clone.return_value = (["waveform"], 24000)
                qwen = mock.Mock()
                qwen.from_pretrained.return_value = model
                torch = mock.Mock()
                torch.cuda.is_available.return_value = True
                with mock.patch.dict(sys.modules, {"torch": torch, "qwen_tts": SimpleNamespace(Qwen3TTSModel=qwen)}):
                    engine = rt.load_voice_model({"voiceEngine": "qwen3-tts", "models": {"voice": {"path": directory}}}, {"SPEAKER_00": reference}, voice_mode=mode)
                model.create_voice_clone_prompt.assert_called_once_with(
                    ref_audio=str(reference["path"]),
                    ref_text=None if mode == "natural" else reference["text"],
                    x_vector_only_mode=mode == "natural",
                )
                for profile in rt.PROFILE_GENERATION_CONFIG_HASHES:
                    for language in ("fr", "en", "ja"):
                        with self.subTest(mode=mode, profile=profile, language=language):
                            rt.generate_voice_unwatched(engine, "Bonjour à tous.", language, "SPEAKER_00", reference, profile=profile)
                            self.assertEqual(model.generate_voice_clone.call_args.kwargs["voice_clone_prompt"], f"{mode}-prompt")
                self.assertEqual(model.create_voice_clone_prompt.call_count, 1)

    def test_faithful_requires_a_transcript_instead_of_falling_back_to_natural(self):
        with mock.patch.dict(sys.modules, {"torch": mock.Mock()}):
            with self.assertRaisesRegex(ValueError, "transcription exacte"):
                rt.load_voice_model({"voiceEngine": "qwen3-tts"}, {"SPEAKER_00": {"path": "reference.wav", "text": " "}}, voice_mode="faithful")

    def test_rejects_unknown_modes_and_incompatible_engines(self):
        for mode in ("other", "", True, [], {}):
            with self.subTest(mode=mode), self.assertRaises(ValueError):
                rt.validate_voice_mode(mode, "qwen3-tts")
        with self.assertRaisesRegex(ValueError, "Qwen3"):
            rt.validate_voice_mode("faithful", "chatterbox")
        self.assertIsNone(rt.validate_voice_mode(None, "qwen3-tts"))

    def test_manifest_locks_mode_between_preview_and_full(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, subtitle, reference = [root / name for name in ("source.wav", "target.vtt", "reference.wav")]
            for file in (source, subtitle, reference):
                file.write_bytes(b"test")
            cues = [{"start": 0, "end": 4, "speaker": "SPEAKER_00", "text": "Bonjour"}]
            with mock.patch.object(rt, "make_speaker_references", return_value=(
                {"SPEAKER_00": reference}, {"SPEAKER_00": {"start": 0, "end": 4, "text": "Texte source"}},
            )):
                _, manifest, checksum = rt.build_voice_profile(root, source, subtitle, rt.V5_ENGLISH_IDENTITY_PROFILE, cues, [], source, models={"voiceEngine": "qwen3-tts", "voiceMode": "faithful"})
            self.assertEqual(json.loads(manifest.read_text())["voiceMode"], "faithful")
            rt.load_voice_profile(root, checksum, source, subtitle, [], expected_voice_mode="faithful")
            with self.assertRaisesRegex(RuntimeError, "mode vocal"):
                rt.load_voice_profile(root, checksum, source, subtitle, [], expected_voice_mode="natural")


if __name__ == "__main__":
    unittest.main()
