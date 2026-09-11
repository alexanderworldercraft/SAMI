import unittest
from types import SimpleNamespace
from voice_library import validate_request


class VoiceLibraryContract(unittest.TestCase):
    def setUp(self):
        self.runtime = SimpleNamespace(
            SUPPORTED_LANGUAGES={"fr", "en", "ja"},
            resolve_dubbing_profile=lambda value: value,
            PROFILE_GENERATION_CONFIG_HASHES={"r9": "hash"},
        )
        self.install = {"voiceEngine": "qwen3-tts", "voiceModel": "voice", "voiceModelRevision": "revision"}
        self.payload = {"text": "Bonjour", "language": "fr", "models": {**self.install, "pipeline": "r9", "generationConfigHash": "hash"}}

    def test_supported_languages_keep_the_same_model_identity(self):
        for language in ["fr", "en", "ja"]:
            self.assertEqual(validate_request({**self.payload, "language": language}, self.install, self.runtime)[1], language)

    def test_wrong_model_or_generation_contract_is_rejected(self):
        for key in ["voiceModel", "voiceModelRevision", "voiceEngine", "generationConfigHash"]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                validate_request({**self.payload, "models": {**self.payload["models"], key: "other"}}, self.install, self.runtime)

    def test_invalid_text_and_language_are_rejected(self):
        for changed in [{"text": ""}, {"text": "x" * 501}, {"language": "xx"}]:
            with self.assertRaises(ValueError):
                validate_request({**self.payload, **changed}, self.install, self.runtime)


if __name__ == "__main__":
    unittest.main()
