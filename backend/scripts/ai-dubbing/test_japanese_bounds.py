import io
import os
import tempfile
import unittest
from contextlib import redirect_stderr
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

import numpy as np
import runtime as rt
import compare_japanese as comparison
import test_japanese_identity as identity_tests


class JapaneseBoundsTest(unittest.TestCase):
    def model(self, tokens=(1, 2, 99)):
        talker = SimpleNamespace(generate=mock.Mock(return_value=SimpleNamespace(sequences=np.array([tokens]))))
        tokenizer = SimpleNamespace(decode=mock.Mock(return_value=([np.ones(10)], 24000)))
        core = SimpleNamespace(talker=talker, speech_tokenizer=tokenizer,
            config=SimpleNamespace(talker_config=SimpleNamespace(codec_eos_token_id=99)))
        model = SimpleNamespace(model=core)
        return model, talker, tokenizer

    def test_budget_depends_on_text_not_subtitle_duration(self):
        self.assertEqual(rt.japanese_token_budget("はい。"), 96)
        text = "打つって言ってくれ 怖かったのは柱だ だから最高に狙うんだ"
        self.assertEqual(rt.japanese_token_budget(text), len(rt.normalized_speech_text(text)) * 4 + 48)
        self.assertEqual(rt.japanese_token_budget("あ" * 1000), 720)
        with self.assertRaises(rt.DubbingInputQualityError):
            rt.japanese_token_budget("... !")

    def test_natural_eos_decodes_and_restores_methods(self):
        model, talker, tokenizer = self.model()
        original, decode = talker.generate, tokenizer.decode
        report = mock.Mock()
        def operation():
            talker.generate(max_new_tokens=96)
            return tokenizer.decode("codes")
        result = rt.guarded_qwen_call(model, operation, 96, report)
        self.assertEqual(result[1], 24000)
        self.assertIs(talker.generate, original)
        self.assertIs(tokenizer.decode, decode)
        self.assertIsNone(original.call_args.kwargs["forced_eos_token_id"])
        self.assertEqual([c.args[0] for c in report.call_args_list],
                         ["TOKEN_GENERATION", "TOKEN_GENERATION_RETURNED", "AUDIO_DECODING", "AUDIO_DECODED"])

    def test_missing_eos_never_reaches_decoder_even_if_sequence_is_short(self):
        for tokens in [(1, 2), tuple(range(96)), (99, 2)]:
            model, talker, tokenizer = self.model(tokens)
            original, decode = talker.generate, tokenizer.decode
            def operation():
                talker.generate(max_new_tokens=96)
                return tokenizer.decode("codes")
            with self.assertRaises(rt.DubbingGenerationLimitError):
                rt.guarded_qwen_call(model, operation, 96, mock.Mock())
            decode.assert_not_called()
            self.assertIs(talker.generate, original)

    def test_eos_exactly_at_the_budget_is_not_treated_as_truncated(self):
        model, talker, tokenizer = self.model(tuple([1] * 95 + [99]))
        rt.guarded_qwen_call(model, lambda: (talker.generate(max_new_tokens=96), tokenizer.decode("codes")), 96, mock.Mock())

    def test_class_descriptors_are_restored_after_decoder_exception(self):
        class Talker:
            def generate(self, **kwargs):
                return SimpleNamespace(sequences=np.array([[99]]))
        class Tokenizer:
            def decode(self, *args):
                raise RuntimeError("decoder failed")
        model, _, _ = self.model()
        talker, tokenizer = Talker(), Tokenizer()
        model.model.talker, model.model.speech_tokenizer = talker, tokenizer
        with self.assertRaisesRegex(RuntimeError, "decoder failed"):
            rt.guarded_qwen_call(model, lambda: (talker.generate(max_new_tokens=96), tokenizer.decode("codes")), 96, mock.Mock())
        self.assertNotIn("generate", vars(talker))
        self.assertNotIn("decode", vars(tokenizer))

    def test_incompatible_result_budget_and_bypass_fail_closed(self):
        model, talker, tokenizer = self.model()
        with self.assertRaises(rt.DubbingGenerationContractError):
            rt.guarded_qwen_call(model, lambda: talker.generate(max_new_tokens=2048), 96, mock.Mock())
        with self.assertRaises(rt.DubbingGenerationContractError):
            rt.guarded_qwen_call(model, lambda: tokenizer.decode("codes"), 96, mock.Mock())
        with self.assertRaises(rt.DubbingGenerationContractError):
            rt.guarded_qwen_call(model, lambda: "unobserved waveform", 96, mock.Mock())
        talker.generate.return_value = SimpleNamespace(sequences=np.array([[99], [99]]))
        with self.assertRaises(rt.DubbingGenerationContractError):
            rt.guarded_qwen_call(model, lambda: talker.generate(max_new_tokens=96), 96, mock.Mock())

    def test_internal_diagnostic_survives_completion_and_limit_error(self):
        for tokens, state in [((1, 99), "completed"), ((1, 2), "failed")]:
            with tempfile.TemporaryDirectory() as directory, mock.patch.dict(os.environ, {"SAMI_DUBBING_WATCHDOG_PROTOCOL": "1"}), redirect_stderr(io.StringIO()):
                root = Path(directory)
                model, talker, tokenizer = self.model(tokens)
                reference = root / "reference.wav"
                reference.write_bytes(b"reference")
                runtime = {"model": model, "engine": "qwen3-tts", "prompts": {"SPEAKER_00": "old"}}
                model.create_voice_clone_prompt = mock.Mock(return_value="identity")
                def synthesize(**kwargs):
                    self.assertEqual(kwargs["voice_clone_prompt"], "identity")
                    talker.generate(max_new_tokens=kwargs["max_new_tokens"])
                    return tokenizer.decode("codes")
                model.generate_voice_clone = synthesize
                def run():
                    return rt.generate_voice(runtime, "はい。", "ja", "SPEAKER_00", {"path": reference, "text": "Oui"},
                        profile=rt.V5_JAPANESE_BOUNDED_PROFILE,
                        watch_context={"workspace": root, "kind": "cue", "progress": 68, "source_start": 135.56})
                if state == "completed":
                    run()
                else:
                    with self.assertRaises(rt.DubbingGenerationLimitError):
                        run()
                report = rt.load_json(root / "generation-attempt.json")
                self.assertEqual(report["state"], state)
                self.assertEqual(report["internalStage"], "AUDIO_DECODED" if state == "completed" else "TOKEN_GENERATION_RETURNED")
                self.assertEqual(report["internalStages"][0]["maxNewTokens"], 96)

    def test_r2_and_other_languages_have_no_new_budget(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            model = mock.Mock()
            model.generate_voice_clone.return_value = (["audio"], 24000)
            runtime = {"model": model, "engine": "qwen3-tts", "prompts": {"SPEAKER_00": "prompt"}}
            for language in ["fr", "en"]:
                rt.generate_voice_unwatched(runtime, "All is well", language, "SPEAKER_00", {}, profile=rt.V5_JAPANESE_IDENTITY_PROFILE)
                before = model.generate_voice_clone.call_args
                rt.generate_voice_unwatched(runtime, "All is well", language, "SPEAKER_00", {}, profile=rt.V5_JAPANESE_BOUNDED_PROFILE)
                self.assertEqual(model.generate_voice_clone.call_args, before)
                self.assertNotIn("max_new_tokens", model.generate_voice_clone.call_args.kwargs)

    def test_full_cue_has_only_three_bounded_attempts_and_no_wav_on_limit(self):
        with tempfile.TemporaryDirectory() as directory, redirect_stderr(io.StringIO()), \
                mock.patch.object(rt, "seed_synthesis", return_value=123), \
                mock.patch.object(rt, "save_generated_audio") as save:
            root = Path(directory)
            cue = {"start": 135.56, "end": 139.6, "sourceStart": 135.56, "speaker": "SPEAKER_00", "text": "はい。"}
            def limit(*args, **kwargs):
                rt.write_json(root / "generation-attempt.json", {"internalStages": [{"stage": "TOKEN_GENERATION_RETURNED"}]})
                raise rt.DubbingGenerationLimitError("fin absente")
            with mock.patch.object(rt, "generate_voice", side_effect=limit) as generate:
                with self.assertRaises(rt.DubbingGenerationLimitError):
                    list(rt.synthesize_cues_v5({}, {}, [cue], "ja", {"SPEAKER_00": {}}, root, "hash", rt.V5_JAPANESE_BOUNDED_PROFILE, 310))
                self.assertEqual(generate.call_count, 3)
            save.assert_not_called()
            report = rt.load_json(root / "quality-failure.json")
            self.assertEqual(len(report["qualityReport"]["generationLimitAttempts"]), 3)

    def test_full_cue_can_recover_after_a_limit_without_validating_the_rejected_output(self):
        with tempfile.TemporaryDirectory() as directory, redirect_stderr(io.StringIO()), \
                mock.patch.object(rt, "seed_synthesis", return_value=123), \
                mock.patch.object(rt, "media_duration", return_value=.3), \
                mock.patch.object(rt, "transcribe_quality", return_value="はい"), \
                mock.patch.object(rt, "generated_audio_activity", return_value={"hasSpeech": True}), \
                mock.patch.object(rt, "run"), \
                mock.patch.object(rt, "save_generated_audio", side_effect=lambda w, sr, p: p.write_bytes(b"complete")) as save:
            root = Path(directory)
            cue = {"start": 135.56, "end": 139.6, "sourceStart": 135.56, "speaker": "SPEAKER_00", "text": "はい。"}
            def generate(*args, **kwargs):
                if kwargs["attempt"] == 0:
                    rt.write_json(root / "generation-attempt.json", {"internalStages": [{"eosObserved": False}]})
                    raise rt.DubbingGenerationLimitError("fin absente")
                return "complete", 24000
            with mock.patch.object(rt, "generate_voice", side_effect=generate) as synth:
                result = list(rt.synthesize_cues_v5({}, {}, [cue], "ja", {"SPEAKER_00": {}}, root, "hash", rt.V5_JAPANESE_BOUNDED_PROFILE, 310))
                self.assertEqual(synth.call_count, 2)
            save.assert_called_once()
            self.assertEqual(result[0][0]["start"], cue["start"])
            self.assertEqual(len(result[0][2]["generationLimitAttempts"]), 1)
            self.assertFalse((root / "quality-failure.json").exists())


class TimeoutInputTest(unittest.TestCase):
    def test_timeout_selects_exact_cue_and_refuses_ambiguous_matches(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            reference = identity_tests.ComparisonInputTest().make_inputs(root)
            failure = rt.load_json(root / "quality-failure.json")
            (root / "quality-failure.json").unlink()
            manifest = rt.load_json(root / "input-profile.json")
            manifest["dialogueUnits"] = [failure["cue"]]
            rt.write_json(root / "input-profile.json", manifest)
            rt.write_json(root / "error.json", {"code": "AI_DUBBING_GENERATION_TIMEOUT", "pipelineVersion": manifest["pipelineVersion"]})
            report = comparison.compare_variant(root, root, reference, root / "unused", "bounded-identity", True)
            self.assertEqual(report["cue"], failure["cue"])
            self.assertEqual(report["pipelineVersion"], rt.V5_JAPANESE_BOUNDED_PROFILE)
            manifest["dialogueUnits"].append(failure["cue"])
            rt.write_json(root / "input-profile.json", manifest)
            with self.assertRaisesRegex(ValueError, "ambiguïté"):
                comparison.read_comparison_inputs(root, reference)


if __name__ == "__main__":
    unittest.main()
